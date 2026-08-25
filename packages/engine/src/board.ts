import type { RngCursor } from "./rng.js";
import { TILE_KINDS, type CellTile, type Tile, type TileKind, type TileMove } from "./types.js";

export interface BoardView {
  board: (Tile | null)[];
  size: number;
}

export function xy(index: number, size: number): [number, number] {
  return [index % size, Math.floor(index / size)];
}

export function idx(x: number, y: number, size: number): number {
  return y * size + x;
}

export function inBounds(x: number, y: number, size: number): boolean {
  return x >= 0 && y >= 0 && x < size && y < size;
}

export function areAdjacent(a: number, b: number, size: number): boolean {
  const [ax, ay] = xy(a, size);
  const [bx, by] = xy(b, size);
  return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
}

/** Indices holding a tile, in row-major order. */
export function occupiedIndices(view: BoardView): number[] {
  const out: number[] = [];
  for (let i = 0; i < view.board.length; i++) {
    if (view.board[i]) out.push(i);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Match detection
// ---------------------------------------------------------------------------

export interface MatchGroup {
  /** Every cell in the connected union of overlapping runs. */
  tiles: number[];
  kind: TileKind;
  /**
   * Longest single row or column run inside the group. The design document
   * scores bonuses "in a single row or column", so the bonus tier reads this
   * while mana reads `tiles.length`.
   */
  runLength: number;
}

interface Run {
  cells: number[];
  kind: TileKind;
}

function collectRuns(view: BoardView): Run[] {
  const { board, size } = view;
  const runs: Run[] = [];

  const scan = (get: (i: number) => number, outerCount: number, innerCount: number) => {
    for (let outer = 0; outer < outerCount; outer++) {
      let start = 0;
      while (start < innerCount) {
        const startIndex = get(outer * innerCount + start);
        const kind = board[startIndex]?.kind;
        if (kind === undefined) {
          start++;
          continue;
        }
        let end = start + 1;
        while (end < innerCount) {
          const nextIndex = get(outer * innerCount + end);
          if (board[nextIndex]?.kind !== kind) break;
          end++;
        }
        const length = end - start;
        if (length >= 3) {
          const cells: number[] = [];
          for (let k = start; k < end; k++) cells.push(get(outer * innerCount + k));
          runs.push({ cells, kind });
        }
        start = end;
      }
    }
  };

  // Rows: outer = y, inner = x.
  scan((flat) => flat, size, size);
  // Columns: outer = x, inner = y.
  scan((flat) => idx(Math.floor(flat / size), flat % size, size), size, size);

  return runs;
}

/** Merges overlapping runs into groups, so an L or T shape scores once. */
export function findMatches(view: BoardView): MatchGroup[] {
  const runs = collectRuns(view);
  if (runs.length === 0) return [];

  const parent = runs.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[i] !== root) {
      const next = parent[i]!;
      parent[i] = root;
      i = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const owner = new Map<number, number>();
  runs.forEach((run, runIndex) => {
    for (const cell of run.cells) {
      const existing = owner.get(cell);
      if (existing === undefined) owner.set(cell, runIndex);
      else union(existing, runIndex);
    }
  });

  const grouped = new Map<number, { cells: Set<number>; kind: TileKind; runLength: number }>();
  runs.forEach((run, runIndex) => {
    const root = find(runIndex);
    let entry = grouped.get(root);
    if (!entry) {
      entry = { cells: new Set(), kind: run.kind, runLength: 0 };
      grouped.set(root, entry);
    }
    for (const cell of run.cells) entry.cells.add(cell);
    entry.runLength = Math.max(entry.runLength, run.cells.length);
  });

  return [...grouped.values()]
    .map((entry) => ({
      tiles: [...entry.cells].sort((a, b) => a - b),
      kind: entry.kind,
      runLength: entry.runLength,
    }))
    .sort((a, b) => a.tiles[0]! - b.tiles[0]!);
}

export function hasMatch(view: BoardView): boolean {
  return collectRuns(view).length > 0;
}

/** Would swapping these two cells create at least one match? */
export function swapCreatesMatch(view: BoardView, a: number, b: number): boolean {
  const board = view.board.slice();
  const tileA = board[a] ?? null;
  const tileB = board[b] ?? null;
  board[a] = tileB;
  board[b] = tileA;
  return hasMatch({ board, size: view.size });
}

/** Any legal swap available? Used to detect a dead board. */
export function hasLegalMove(view: BoardView): boolean {
  const { size } = view;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const here = idx(x, y, size);
      if (x + 1 < size && swapCreatesMatch(view, here, idx(x + 1, y, size))) return true;
      if (y + 1 < size && swapCreatesMatch(view, here, idx(x, y + 1, size))) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Gravity and refill
// ---------------------------------------------------------------------------

/** Compacts each column downward. Mutates `view.board`. */
export function applyGravity(view: BoardView): TileMove[] {
  const { board, size } = view;
  const moves: TileMove[] = [];

  for (let x = 0; x < size; x++) {
    let writeY = size - 1;
    for (let y = size - 1; y >= 0; y--) {
      const from = idx(x, y, size);
      const tile = board[from];
      if (!tile) continue;
      const to = idx(x, writeY, size);
      if (to !== from) {
        board[to] = tile;
        board[from] = null;
        moves.push({ from, to, tileId: tile.id });
      }
      writeY--;
    }
  }

  return moves;
}

export function pickTileKind(rng: RngCursor, berryWeight: number): TileKind {
  const weights = TILE_KINDS.map((kind) => (kind === "berry" ? berryWeight : 1));
  return TILE_KINDS[rng.weighted(weights)] ?? "fire";
}

export interface TileFactory {
  next(kind: TileKind): Tile;
}

/** Fills empty cells from the top. Mutates `view.board`. */
export function refill(
  view: BoardView,
  rng: RngCursor,
  factory: TileFactory,
  berryWeight: number,
): CellTile[] {
  const spawned: CellTile[] = [];
  for (let i = 0; i < view.board.length; i++) {
    if (view.board[i]) continue;
    const tile = factory.next(pickTileKind(rng, berryWeight));
    view.board[i] = tile;
    spawned.push({ index: i, tile });
  }
  return spawned;
}

/**
 * Builds an opening board with no pre-existing matches and at least one legal
 * swap available.
 */
export function generateBoard(
  size: number,
  rng: RngCursor,
  factory: TileFactory,
  berryWeight: number,
): (Tile | null)[] {
  for (let attempt = 0; attempt < 200; attempt++) {
    const board: (Tile | null)[] = new Array(size * size).fill(null);
    for (let i = 0; i < board.length; i++) {
      // Retry the individual cell rather than the whole board when it would
      // close a run — far cheaper, and keeps the distribution close to uniform.
      for (let tries = 0; tries < 24; tries++) {
        const tile = factory.next(pickTileKind(rng, berryWeight));
        board[i] = tile;
        if (!closesRun(board, i, size)) break;
        board[i] = null;
      }
      if (!board[i]) board[i] = factory.next(pickTileKind(rng, berryWeight));
    }
    const view = { board, size };
    if (!hasMatch(view) && hasLegalMove(view)) return board;
  }
  throw new Error("generateBoard: could not produce a settled opening board");
}

/** Does placing at `index` complete a run of three backwards or upwards? */
function closesRun(board: (Tile | null)[], index: number, size: number): boolean {
  const kind = board[index]?.kind;
  if (kind === undefined) return false;
  const [x, y] = xy(index, size);

  if (x >= 2) {
    const a = board[idx(x - 1, y, size)]?.kind;
    const b = board[idx(x - 2, y, size)]?.kind;
    if (a === kind && b === kind) return true;
  }
  if (y >= 2) {
    const a = board[idx(x, y - 1, size)]?.kind;
    const b = board[idx(x, y - 2, size)]?.kind;
    if (a === kind && b === kind) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Targeting helpers used by board-altering effects
// ---------------------------------------------------------------------------

export function rowIndices(y: number, size: number): number[] {
  return Array.from({ length: size }, (_, x) => idx(x, y, size));
}

export function columnIndices(x: number, size: number): number[] {
  return Array.from({ length: size }, (_, y) => idx(x, y, size));
}

export function gridIndices(x: number, y: number, w: number, h: number, size: number): number[] {
  const out: number[] = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const cx = x + dx;
      const cy = y + dy;
      if (inBounds(cx, cy, size)) out.push(idx(cx, cy, size));
    }
  }
  return out;
}
