import { createMatch, type MatchState, type Tile, type TileKind } from "../src/index.js";

const LEGEND: Record<string, TileKind> = {
  F: "fire",
  W: "water",
  E: "earth",
  L: "electric",
  P: "psychic",
  B: "berry",
};

/**
 * Parses a board from a picture, so tests can assert against an exact layout
 * instead of fishing for one in generated output.
 *
 *   F F W ...
 */
export function boardFromString(picture: string, startId = 10_000): (Tile | null)[] {
  const rows = picture
    .trim()
    .split("\n")
    .map((row) => row.trim().split(/\s+/));

  const size = rows.length;
  const tiles: (Tile | null)[] = [];
  let id = startId;

  for (const row of rows) {
    if (row.length !== size) {
      throw new Error(`Board must be square: got a row of ${row.length} in a ${size}-row picture`);
    }
    for (const cell of row) {
      const kind = LEGEND[cell];
      if (!kind) throw new Error(`Unknown tile character: ${cell}`);
      tiles.push({ id: id++, kind });
    }
  }

  return tiles;
}

export interface ScenarioOptions {
  teams?: [[string, string], [string, string]];
  board?: string;
  seed?: number;
  first?: 0 | 1;
}

/** A match with an optionally hand-placed board. */
export function scenario(options: ScenarioOptions = {}): MatchState {
  const state = createMatch({
    seed: options.seed ?? 1234,
    teams: options.teams ?? [
      ["bonzumi", "pelijet"],
      ["turtlelisk", "slickitty"],
    ],
    first: options.first ?? 0,
    config: { boardSize: options.board ? boardSize(options.board) : 8 },
  });

  if (options.board) {
    state.board = boardFromString(options.board);
    state.nextTileId = 20_000;
  }

  return state;
}

function boardSize(picture: string): number {
  return picture.trim().split("\n").length;
}

/** Total mana held by a player across both slots. */
export function totalMana(state: MatchState, player: 0 | 1): number {
  return state.players[player].monsters.reduce((sum, m) => sum + m.mana, 0);
}
