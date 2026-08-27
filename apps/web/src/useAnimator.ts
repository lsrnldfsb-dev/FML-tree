import { useCallback, useRef, useState } from "react";
import type { GameEvent, MatchState, PlayerIndex, TileKind } from "@mm/engine";

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

export function tilesFromState(state: MatchState | null): RenderTile[] {
  if (!state) return [];
  const out: RenderTile[] = [];
  state.board.forEach((tile, index) => {
    if (tile) out.push({ id: tile.id, kind: tile.kind, index });
  });
  return out;
}

/**
 * Turns the engine's event stream back into frames.
 *
 * The engine reports only the settled state, so the animation is reconstructed
 * from the events themselves; the authoritative board is applied at the end as
 * a correctness check. Shared by local and online play — the only difference
 * between them is where the events come from.
 */
export function useAnimator(initial: MatchState | null) {
  const [tiles, setTiles] = useState<RenderTile[]>(() => tilesFromState(initial));
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [notes, setNotes] = useState<FloatingNote[]>([]);

  const playing = useRef(false);
  const noteId = useRef(1);
  const current = useRef<RenderTile[]>(tilesFromState(initial));

  const commitTiles = useCallback((next: RenderTile[]) => {
    current.current = next;
    setTiles(next);
  }, []);

  /** Jumps straight to a board with no animation — reconnects, first load. */
  const syncTo = useCallback(
    (state: MatchState | null) => {
      if (playing.current) return;
      commitTiles(tilesFromState(state));
    },
    [commitTiles],
  );

  const pushNote = useCallback((text: string, tone: FloatingNote["tone"], target: PlayerIndex) => {
    const id = noteId.current++;
    setNotes((all) => [...all, { id, text, tone, target }]);
    setTimeout(() => setNotes((all) => all.filter((n) => n.id !== id)), 1100);
  }, []);

  const play = useCallback(
    async (events: GameEvent[], finalState: MatchState) => {
      if (playing.current) return;
      playing.current = true;
      setBusy(true);

      const live = new Map<number, RenderTile>();
      for (const tile of current.current) live.set(tile.id, { ...tile });

      const at = (index: number) => {
        for (const tile of live.values()) if (tile.index === index) return tile;
        return undefined;
      };
      const commit = () => commitTiles([...live.values()]);

      try {
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

            case "spawn":
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
              await sleep(event.type === "spawn" ? TIMING.spawn : TIMING.convert);
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

            default:
              break;
          }
        }
      } finally {
        commitTiles(tilesFromState(finalState));
        setBanner(null);
        setBusy(false);
        playing.current = false;
      }
    },
    [commitTiles, pushNote],
  );

  return { tiles, busy, banner, notes, play, syncTo };
}
