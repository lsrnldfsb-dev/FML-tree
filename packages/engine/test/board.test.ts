import { describe, expect, it } from "vitest";
import {
  applyGravity,
  areAdjacent,
  createRng,
  findMatches,
  generateBoard,
  hasLegalMove,
  hasMatch,
  RngCursor,
  rngFloat,
  swapCreatesMatch,
} from "../src/index.js";
import { boardFromString } from "./helpers.js";

describe("rng", () => {
  it("produces the same sequence for the same seed", () => {
    const draw = (seed: number) => {
      let rng = createRng(seed);
      return Array.from({ length: 20 }, () => {
        const [value, next] = rngFloat(rng);
        rng = next;
        return value;
      });
    };
    expect(draw(99)).toEqual(draw(99));
  });

  it("produces different sequences for different seeds", () => {
    const owner1 = { rng: createRng(1) };
    const owner2 = { rng: createRng(2) };
    const a = Array.from({ length: 20 }, () => new RngCursor(owner1).float());
    const b = Array.from({ length: 20 }, () => new RngCursor(owner2).float());
    expect(a).not.toEqual(b);
  });

  it("advances the counter on every draw", () => {
    const owner = { rng: createRng(7) };
    const cursor = new RngCursor(owner);
    cursor.float();
    cursor.float();
    expect(owner.rng.counter).toBe(2);
  });

  it("stays within bounds", () => {
    const owner = { rng: createRng(42) };
    const cursor = new RngCursor(owner);
    for (let i = 0; i < 500; i++) {
      const value = cursor.int(8);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(8);
    }
  });
});

describe("adjacency", () => {
  it("accepts orthogonal neighbours only", () => {
    expect(areAdjacent(0, 1, 8)).toBe(true);
    expect(areAdjacent(0, 8, 8)).toBe(true);
    expect(areAdjacent(0, 9, 8)).toBe(false);
    expect(areAdjacent(0, 2, 8)).toBe(false);
  });

  it("does not wrap around a row edge", () => {
    // index 7 is the last cell of row 0, index 8 the first of row 1
    expect(areAdjacent(7, 8, 8)).toBe(false);
  });
});

describe("match detection", () => {
  const size4 = (picture: string) => ({ board: boardFromString(picture), size: 4 });

  it("finds a horizontal run of three", () => {
    const view = size4(`
      F F F W
      W E W E
      E W E W
      W E W E
    `);
    const matches = findMatches(view);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.kind).toBe("fire");
    expect(matches[0]!.tiles).toEqual([0, 1, 2]);
    expect(matches[0]!.runLength).toBe(3);
  });

  it("finds a vertical run of four and reports its length", () => {
    const view = size4(`
      W E F E
      W F E F
      W E F E
      W F E F
    `);
    const matches = findMatches(view);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.kind).toBe("water");
    expect(matches[0]!.tiles).toEqual([0, 4, 8, 12]);
    expect(matches[0]!.runLength).toBe(4);
  });

  it("merges an L shape into one group but keeps the longest run", () => {
    const view = size4(`
      F F F E
      F E W E
      F W E W
      E F W F
    `);
    const matches = findMatches(view);
    expect(matches).toHaveLength(1);
    // Three across the top plus three down the left, sharing the corner.
    expect(matches[0]!.tiles).toEqual([0, 1, 2, 4, 8]);
    expect(matches[0]!.runLength).toBe(3);
  });

  it("reports no matches on a settled board", () => {
    const view = size4(`
      F W F W
      W F W F
      F W F W
      W F W F
    `);
    expect(hasMatch(view)).toBe(false);
    expect(findMatches(view)).toHaveLength(0);
  });

  it("predicts whether a swap would score", () => {
    const view = size4(`
      F W F W
      F E W F
      F W E W
      W F W F
    `);
    // Column 0 already holds three fire, so start from a board without one.
    const clean = size4(`
      W F F W
      F E W F
      F W E W
      W F W F
    `);
    expect(hasMatch(clean)).toBe(false);
    // Swapping (0,0)=W with (0,1)=F stacks three fire across the top row.
    expect(swapCreatesMatch(clean, 0, 4)).toBe(true);
    // Swapping two settled tiles that make nothing.
    expect(swapCreatesMatch(clean, 5, 6)).toBe(false);
    expect(hasMatch(view)).toBe(true);
  });
});

describe("gravity", () => {
  it("compacts columns downward and reports the moves", () => {
    const board = boardFromString(`
      F W E L
      W E L F
      E L F W
      L F W E
    `);
    board[8] = null; // row 2, column 0
    board[12] = null; // row 3, column 0

    const moves = applyGravity({ board, size: 4 });

    expect(board[12]?.kind).toBe("water");
    expect(board[8]?.kind).toBe("fire");
    expect(board[0]).toBeNull();
    expect(board[4]).toBeNull();
    expect(moves).toHaveLength(2);
  });
});

describe("board generation", () => {
  it("opens with no matches and at least one legal swap", () => {
    for (let seed = 0; seed < 25; seed++) {
      const owner = { rng: createRng(seed) };
      const cursor = new RngCursor(owner);
      let nextId = 1;
      const board = generateBoard(8, cursor, { next: (kind) => ({ id: nextId++, kind }) }, 0.4);
      const view = { board, size: 8 };
      expect(hasMatch(view)).toBe(false);
      expect(hasLegalMove(view)).toBe(true);
    }
  });

  it("is reproducible from a seed", () => {
    const build = () => {
      const owner = { rng: createRng(555) };
      const cursor = new RngCursor(owner);
      let nextId = 1;
      return generateBoard(8, cursor, { next: (kind) => ({ id: nextId++, kind }) }, 0.4).map(
        (t) => t?.kind,
      );
    };
    expect(build()).toEqual(build());
  });
});
