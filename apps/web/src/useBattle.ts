import { useCallback, useMemo, useRef, useState } from "react";
import {
  applyMove,
  createMatch,
  legalSwaps,
  type GameEvent,
  type MatchState,
  type Move,
  type PlayerIndex,
  type TileKind,
} from "@mm/engine";

export interface RenderTile {
  id: number;
  kind: TileKind;
  index: number;
  matching?: boolean;
  spawning?: boolean;
}

export interface FloatingNote {
  id: number;
  text: string;
  tone: "damage" | "heal" | "berry" | "mana";
  target: PlayerIndex;
}

const TIMING = {
  swap: 170,
  highlight: 240,
  remove: 90,
  fall: 190,
  spawn: 150,
  convert: 200,
  ability: 620,
  hit: 220,
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function tilesFromState(state: MatchState): RenderTile[] {
  const out: RenderTile[] = [];
  state.board.forEach((tile, index) => {
    if (tile) out.push({ id: tile.id, kind: tile.kind, index });
  });
  return out;
}

export interface BattleOptions {
  seed: number;
  teams: [[string, string], [string, string]];
  first: PlayerIndex;
}

export function useBattle(options: BattleOptions) {
  const [match, setMatch] = useState<MatchState>(() =>
    createMatch({ seed: options.seed, teams: options.teams, first: options.first }),
  );
  const [tiles, setTiles] = useState<RenderTile[]>(() => tilesFromState(match));
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notes, setNotes] = useState<FloatingNote[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  const playing = useRef(false);
  const noteId = useRef(1);

  const hints = useMemo(() => (busy ? [] : legalSwaps(match)), [match, busy]);

  const pushNote = useCallback((text: string, tone: FloatingNote["tone"], target: PlayerIndex) => {
    const id = noteId.current++;
    setNotes((current) => [...current, { id, text, tone, target }]);
    setTimeout(() => setNotes((current) => current.filter((n) => n.id !== id)), 1100);
  }, []);

  /**
   * Replays the engine's event stream to reconstruct each intermediate frame.
   * The engine only reports the settled state, so the animation is driven
   * entirely from the events; the final board is used as a correctness check.
   */
  const play = useCallback(
    async (events: GameEvent[], finalState: MatchState) => {
      const live = new Map<number, RenderTile>();
      for (const tile of tilesFromState(match)) live.set(tile.id, { ...tile });

      const at = (index: number) => [...live.values()].find((t) => t.index === index);
      const commit = () => setTiles([...live.values()]);

      for (const event of events) {
        switch (event.type) {
          case "swap": {
            const a = at(event.a);
            const b = at(event.b);
            if (a && b) {
              const tmp = a.index;
              a.index = b.index;
              b.index = tmp;
            }
            commit();
            await sleep(TIMING.swap);
            break;
          }

          case "match": {
            for (const index of event.tiles) {
              const tile = at(index);
              if (tile) tile.matching = true;
            }
            commit();
            await sleep(TIMING.highlight);
            break;
          }

          case "remove": {
            for (const index of event.tiles) {
              const tile = at(index);
              if (tile) live.delete(tile.id);
            }
            commit();
            await sleep(TIMING.remove);
            break;
          }

          case "fall": {
            for (const mv of event.moves) {
              const tile = live.get(mv.tileId);
              if (tile) tile.index = mv.to;
            }
            commit();
            await sleep(TIMING.fall);
            break;
          }

          case "spawn": {
            for (const cell of event.cells) {
              const existing = at(cell.index);
              if (existing) live.delete(existing.id);
              live.set(cell.tile.id, {
                id: cell.tile.id,
                kind: cell.tile.kind,
                index: cell.index,
                spawning: true,
              });
            }
            commit();
            await sleep(TIMING.spawn);
            for (const cell of event.cells) {
              const tile = live.get(cell.tile.id);
              if (tile) tile.spawning = false;
            }
            commit();
            break;
          }

          case "convert": {
            for (const cell of event.cells) {
              const existing = at(cell.index);
              if (existing) live.delete(existing.id);
              live.set(cell.tile.id, {
                id: cell.tile.id,
                kind: cell.tile.kind,
                index: cell.index,
                spawning: true,
              });
            }
            commit();
            await sleep(TIMING.convert);
            for (const cell of event.cells) {
              const tile = live.get(cell.tile.id);
              if (tile) tile.spawning = false;
            }
            commit();
            break;
          }

          case "ability": {
            setBanner(event.name);
            await sleep(TIMING.ability);
            setBanner(null);
            break;
          }

          case "damage": {
            pushNote(`-${event.amount}`, "damage", event.target);
            await sleep(TIMING.hit);
            break;
          }

          case "heal": {
            pushNote(`+${event.amount}`, "heal", event.target);
            await sleep(TIMING.hit);
            break;
          }

          case "berries": {
            pushNote(`+${event.amount} 🍒`, "berry", event.player);
            break;
          }

          case "bonus": {
            if (event.extraMoves > 0) {
              setBanner(`${event.runLength} in a row — extra move`);
              await sleep(360);
              setBanner(null);
            }
            break;
          }

          case "monsterLocked": {
            setBanner("Mana locked");
            await sleep(420);
            setBanner(null);
            break;
          }

          case "gameOver": {
            await sleep(200);
            break;
          }

          default:
            break;
        }
      }

      // The authoritative board is the source of truth; snap to it in case the
      // replay and the engine ever disagree.
      setTiles(tilesFromState(finalState));
    },
    [match, pushNote],
  );

  const submit = useCallback(
    async (move: Move) => {
      if (playing.current || match.winner !== null) return;

      const result = applyMove(match, move);
      const rejection = result.events.find((e) => e.type === "moveRejected");
      if (rejection && rejection.type === "moveRejected") {
        setNotice(rejection.reason);
        setTimeout(() => setNotice(null), 1800);
        return;
      }

      playing.current = true;
      setBusy(true);
      setSelected(null);

      try {
        await play(result.events, result.state);
      } finally {
        setMatch(result.state);
        setBusy(false);
        playing.current = false;
      }
    },
    [match, play],
  );

  const tapTile = useCallback(
    (index: number) => {
      if (busy || match.winner !== null) return;
      if (selected === null) {
        setSelected(index);
        return;
      }
      if (selected === index) {
        setSelected(null);
        return;
      }
      void submit({ type: "swap", a: selected, b: index });
    },
    [busy, match.winner, selected, submit],
  );

  const reset = useCallback(
    (next: BattleOptions) => {
      const fresh = createMatch({ seed: next.seed, teams: next.teams, first: next.first });
      setMatch(fresh);
      setTiles(tilesFromState(fresh));
      setSelected(null);
      setBanner(null);
      setNotice(null);
      setNotes([]);
    },
    [],
  );

  return { match, tiles, busy, banner, notice, notes, selected, hints, submit, tapTile, reset };
}
