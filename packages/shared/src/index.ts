import type { GameEvent, MatchState, Move, PlayerIndex } from "@mm/engine";

/** Wire protocol between the browser and the authoritative server. */

export const PROTOCOL_VERSION = 1;

export type Phase = "lobby" | "match";

export interface PublicPlayer {
  index: PlayerIndex;
  name: string;
  online: boolean;
  /** Team submitted in the lobby, if any. */
  team: [string, string] | null;
}

export interface HistoryEntry {
  id: string;
  winner: PlayerIndex;
  turns: number;
  endedAt: number;
  teams: [[string, string], [string, string]];
}

export interface LobbySnapshot {
  phase: Phase;
  players: [PublicPlayer, PublicPlayer];
  history: HistoryEntry[];
}

/** Everything the client needs to render, sent on connect and after changes. */
export interface Snapshot extends LobbySnapshot {
  you: PlayerIndex;
  matchId: string | null;
  match: MatchState | null;
}

export type ClientMessage =
  | { t: "submitTeam"; team: [string, string] }
  | { t: "clearTeam" }
  | { t: "move"; matchId: string; move: Move }
  | { t: "resign"; matchId: string }
  | { t: "returnToLobby" }
  | { t: "ping" };

export type ServerMessage =
  | { t: "snapshot"; snapshot: Snapshot }
  | { t: "events"; matchId: string; events: GameEvent[]; match: MatchState }
  | { t: "error"; message: string }
  | { t: "pong" };

export interface LoginRequest {
  passphrase: string;
}

export interface LoginResponse {
  ok: boolean;
  name?: string;
  index?: PlayerIndex;
  error?: string;
}
