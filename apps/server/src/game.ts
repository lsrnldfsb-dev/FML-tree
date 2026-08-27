import { randomBytes, randomInt } from "node:crypto";
import { applyMove, createMatch, validateTeam, type Move, type PlayerIndex } from "@mm/engine";
import type { ClientMessage, PublicPlayer, ServerMessage, Snapshot } from "@mm/shared";
import type { Store } from "./store.js";

export interface Connection {
  index: PlayerIndex;
  send: (message: ServerMessage) => void;
}

const MAX_HISTORY = 50;

function otherPlayer(index: PlayerIndex): PlayerIndex {
  return index === 0 ? 1 : 0;
}

/**
 * Owns the lobby and the single in-flight match.
 *
 * The server is authoritative: it holds the only real match state, validates
 * whose turn it is, and runs the engine itself. Clients send an intent and
 * receive the resulting event stream.
 */
export class Game {
  private connections = new Set<Connection>();

  constructor(private readonly store: Store) {}

  // -------------------------------------------------------------------------
  // Connections
  // -------------------------------------------------------------------------

  attach(connection: Connection): void {
    this.connections.add(connection);
    connection.send({ t: "snapshot", snapshot: this.snapshotFor(connection.index) });
    this.broadcastSnapshot(connection.index);
  }

  detach(connection: Connection): void {
    this.connections.delete(connection);
    this.broadcastSnapshot();
  }

  private isOnline(index: PlayerIndex): boolean {
    for (const c of this.connections) if (c.index === index) return true;
    return false;
  }

  /** Sends a fresh snapshot to everyone, optionally skipping one connection. */
  private broadcastSnapshot(skipIndex?: PlayerIndex): void {
    for (const c of this.connections) {
      if (skipIndex !== undefined && c.index === skipIndex) continue;
      c.send({ t: "snapshot", snapshot: this.snapshotFor(c.index) });
    }
  }

  private broadcast(message: ServerMessage): void {
    for (const c of this.connections) c.send(message);
  }

  // -------------------------------------------------------------------------
  // Snapshots
  // -------------------------------------------------------------------------

  snapshotFor(you: PlayerIndex): Snapshot {
    const d = this.store.data;

    const players = ([0, 1] as PlayerIndex[]).map<PublicPlayer>((index) => ({
      index,
      name: d.users[index].name,
      online: this.isOnline(index),
      team: d.teams[index],
    })) as [PublicPlayer, PublicPlayer];

    return {
      you,
      phase: d.match ? "match" : "lobby",
      players,
      history: d.history.slice(0, 10),
      matchId: d.matchId,
      match: d.match,
    };
  }

  // -------------------------------------------------------------------------
  // Message handling
  // -------------------------------------------------------------------------

  handle(connection: Connection, message: ClientMessage): void {
    switch (message.t) {
      case "ping":
        connection.send({ t: "pong" });
        return;

      case "submitTeam":
        this.submitTeam(connection, message.team);
        return;

      case "clearTeam":
        this.store.data.teams[connection.index] = null;
        this.store.save();
        this.broadcastSnapshot();
        return;

      case "move":
        this.move(connection, message.matchId, message.move);
        return;

      case "resign":
        this.resign(connection, message.matchId);
        return;

      case "returnToLobby":
        this.returnToLobby();
        return;

      default: {
        const exhaustive: never = message;
        connection.send({ t: "error", message: `Unknown message: ${JSON.stringify(exhaustive)}` });
      }
    }
  }

  private submitTeam(connection: Connection, team: [string, string]): void {
    const d = this.store.data;

    if (d.match) {
      connection.send({ t: "error", message: "A match is already in progress." });
      return;
    }
    if (!Array.isArray(team) || team.length !== 2) {
      connection.send({ t: "error", message: "Pick exactly two monsters." });
      return;
    }

    let problem: string | null;
    try {
      problem = validateTeam(team);
    } catch (error) {
      problem = error instanceof Error ? error.message : "Unknown monster.";
    }
    if (problem) {
      connection.send({ t: "error", message: problem });
      return;
    }

    d.teams[connection.index] = team;

    const both = d.teams[0] && d.teams[1];
    if (both) this.startMatch();

    this.store.save();
    this.broadcastSnapshot();
  }

  private startMatch(): void {
    const d = this.store.data;
    const teams = [d.teams[0]!, d.teams[1]!] as [[string, string], [string, string]];

    // Alternate who moves first between matches; the other gets the health bonus.
    const first = otherPlayer(d.lastFirst);

    d.match = createMatch({ seed: randomInt(0, 2 ** 31 - 1), teams, first });
    d.matchId = randomBytes(8).toString("hex");
    d.lastFirst = first;
    d.teams = [null, null];
  }

  private move(connection: Connection, matchId: string, move: Move): void {
    const d = this.store.data;

    if (!d.match || d.matchId !== matchId) {
      connection.send({ t: "error", message: "That match is no longer active." });
      this.broadcastSnapshot();
      return;
    }
    if (d.match.winner !== null) {
      connection.send({ t: "error", message: "The match is already over." });
      return;
    }
    if (d.match.active !== connection.index) {
      connection.send({ t: "error", message: "It is not your turn." });
      return;
    }
    if (!isValidMoveShape(move)) {
      connection.send({ t: "error", message: "Malformed move." });
      return;
    }

    const result = applyMove(d.match, move);
    const rejection = result.events.find((e) => e.type === "moveRejected");
    if (rejection && rejection.type === "moveRejected") {
      connection.send({ t: "error", message: rejection.reason });
      return;
    }

    d.match = result.state;
    this.store.save();

    this.broadcast({ t: "events", matchId, events: result.events, match: result.state });

    if (d.match.winner !== null) this.finishMatch();
  }

  private resign(connection: Connection, matchId: string): void {
    const d = this.store.data;
    if (!d.match || d.matchId !== matchId || d.match.winner !== null) return;

    d.match.winner = otherPlayer(connection.index);
    d.match.players[connection.index].hp = 0;
    this.store.save();

    this.broadcast({
      t: "events",
      matchId,
      events: [{ type: "gameOver", winner: d.match.winner }],
      match: d.match,
    });
    this.finishMatch();
  }

  /** Records the result but leaves the board up until someone clears it. */
  private finishMatch(): void {
    const d = this.store.data;
    if (!d.match || d.match.winner === null || !d.matchId) return;
    if (d.history[0]?.id === d.matchId) return;

    d.history.unshift({
      id: d.matchId,
      winner: d.match.winner,
      turns: d.match.turn,
      endedAt: Date.now(),
      teams: [
        [d.match.players[0].monsters[0].defId, d.match.players[0].monsters[1].defId],
        [d.match.players[1].monsters[0].defId, d.match.players[1].monsters[1].defId],
      ],
    });
    d.history = d.history.slice(0, MAX_HISTORY);
    this.store.save();
  }

  private returnToLobby(): void {
    const d = this.store.data;
    if (d.match && d.match.winner === null) return; // never abandon a live match

    d.match = null;
    d.matchId = null;
    d.teams = [null, null];
    this.store.save();
    this.broadcastSnapshot();
  }
}

function isValidMoveShape(move: Move): boolean {
  if (!move || typeof move !== "object") return false;
  switch (move.type) {
    case "swap":
      return Number.isInteger(move.a) && Number.isInteger(move.b);
    case "evolve":
    case "boost":
      return move.slot === 0 || move.slot === 1;
    case "pass":
      return true;
    default:
      return false;
  }
}
