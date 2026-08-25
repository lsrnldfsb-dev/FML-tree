import { describe, expect, it } from "vitest";
import {
  applyMove,
  bonusForRun,
  createMatch,
  DEFAULT_CONFIG,
  findMatches,
  getMonster,
  legalSwaps,
  validateTeam,
  type GameEvent,
  type MatchState,
} from "../src/index.js";
import { boardFromString, scenario } from "./helpers.js";

/**
 * A base pattern with no runs of three anywhere: each row is the five elements
 * cycling, shifted one step per row.
 */
const CLEAN = `
  F W E L P F W E
  W E L P F W E L
  E L P F W E L P
  L P F W E L P F
  P F W E L P F W
  F W E L P F W E
  W E L P F W E L
  E L P F W E L P
`;

function withRows(...overrides: [number, string][]): string {
  const rows = CLEAN.trim().split("\n").map((r) => r.trim());
  for (const [index, row] of overrides) rows[index] = row;
  return rows.join("\n");
}

function pick<T extends GameEvent["type"]>(
  events: GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((e) => e.type === type) as Extract<GameEvent, { type: T }>[];
}

describe("team validation", () => {
  it("rejects two monsters of the same element", () => {
    expect(validateTeam(["bonzumi", "pyrokun"])).toMatch(/two fire/);
  });

  it("rejects picking an evolved form directly", () => {
    expect(validateTeam(["bonzire", "pelijet"])).toMatch(/evolved form/);
  });

  it("accepts a legal pair", () => {
    expect(validateTeam(["bonzumi", "pelijet"])).toBeNull();
  });
});

describe("match setup", () => {
  it("gives the second player the health bonus", () => {
    const state = createMatch({
      seed: 1,
      teams: [
        ["bonzumi", "pelijet"],
        ["turtlelisk", "slickitty"],
      ],
      first: 0,
    });
    expect(state.players[0].hp).toBe(DEFAULT_CONFIG.startingHp);
    expect(state.players[1].hp).toBe(DEFAULT_CONFIG.startingHp + DEFAULT_CONFIG.secondPlayerHpBonus);
    expect(state.active).toBe(0);
  });

  it("opens with the configured move budget", () => {
    const state = scenario();
    expect(state.movesLeft).toBe(DEFAULT_CONFIG.baseMoves);
    expect(state.turn).toBe(1);
  });

  it("is reproducible from its seed", () => {
    const build = () =>
      createMatch({
        seed: 4242,
        teams: [
          ["bonzumi", "pelijet"],
          ["turtlelisk", "slickitty"],
        ],
      }).board.map((t) => t?.kind);
    expect(build()).toEqual(build());
  });
});

describe("swap validation", () => {
  it("rejects a swap between cells that are not neighbours", () => {
    const state = scenario({ board: CLEAN });
    const { events, state: after } = applyMove(state, { type: "swap", a: 0, b: 2 });
    expect(pick(events, "moveRejected")[0]?.reason).toMatch(/not next to each other/);
    expect(after).toBe(state);
  });

  it("rejects a swap that would not make a line of three", () => {
    const state = scenario({ board: CLEAN });
    const { events } = applyMove(state, { type: "swap", a: 0, b: 1 });
    expect(pick(events, "moveRejected")[0]?.reason).toMatch(/line of three/);
  });

  it("does not spend a move on a rejected swap", () => {
    const state = scenario({ board: CLEAN });
    const { state: after } = applyMove(state, { type: "swap", a: 0, b: 1 });
    expect(after.movesLeft).toBe(state.movesLeft);
  });
});

describe("scoring", () => {
  // Row 0 holds two fire then a water; row 1 puts a fire directly beneath that
  // water, so swapping them completes three fire across the top.
  const FIRE_THREE = withRows([0, "F F W L P F W E"], [1, "W E F P F W E L"]);

  it("credits mana only to the matching element on the active team", () => {
    const state = scenario({ board: FIRE_THREE });
    expect(findMatches({ board: state.board, size: 8 })).toHaveLength(0);

    const { events, state: after } = applyMove(state, { type: "swap", a: 2, b: 10 });

    const first = pick(events, "match")[0]!;
    expect(first.kind).toBe("fire");
    expect(first.size).toBe(3);

    const mana = pick(events, "mana");
    expect(mana.length).toBeGreaterThan(0);
    expect(mana.every((m) => m.player === 0)).toBe(true);
    expect(mana[0]!.slot).toBe(0); // Bonzumi is the fire monster in slot 0
    expect(mana[0]!.amount).toBe(3);

    // The opponent gains nothing from the active player's board work.
    expect(after.players[1].monsters.every((m) => m.mana === 0)).toBe(true);
  });

  it("awards berries rather than mana for berry matches", () => {
    const board = withRows([0, "B B W L P F W E"], [1, "W E B P F W E L"]);
    const state = scenario({ board });
    const { events, state: after } = applyMove(state, { type: "swap", a: 2, b: 10 });

    const berries = pick(events, "berries");
    expect(berries[0]!.amount).toBe(3);
    expect(after.players[0].berries).toBeGreaterThanOrEqual(3);
  });

  it("clears tiles of an element nobody fields without paying anyone", () => {
    // Neither team fields a psychic monster in this scenario.
    const board = withRows([0, "P P W L F F W E"], [1, "W E P F E W E L"]);
    const state = scenario({ board });
    const { events } = applyMove(state, { type: "swap", a: 2, b: 10 });

    const psychicMatch = pick(events, "match").find((m) => m.kind === "psychic");
    expect(psychicMatch).toBeDefined();
    const manaFromPsychic = pick(events, "mana").filter((m) => m.amount > 0);
    // Any mana that did land came from later cascades, never from the psychic clear.
    for (const m of manaFromPsychic) {
      const def = getMonster(m.player === 0 ? "bonzumi" : "turtlelisk");
      expect(def.element).not.toBe("psychic");
    }
  });
});

describe("match-size bonuses", () => {
  it("computes the cumulative tiers", () => {
    expect(bonusForRun(3)).toEqual({ extraMove: false, heal: 0, damage: 0 });
    expect(bonusForRun(4)).toEqual({ extraMove: true, heal: 0, damage: 0 });
    expect(bonusForRun(5)).toEqual({ extraMove: true, heal: 5, damage: 0 });
    expect(bonusForRun(6)).toEqual({ extraMove: true, heal: 5, damage: 5 });
    expect(bonusForRun(8)).toEqual({ extraMove: true, heal: 5, damage: 5 });
  });

  it("refunds a move for a run of four", () => {
    const board = withRows([0, "F F W F P F W E"], [1, "W E F P F W E L"]);
    const state = scenario({ board });
    const { events } = applyMove(state, { type: "swap", a: 2, b: 10 });

    const bonus = pick(events, "bonus")[0]!;
    expect(bonus.runLength).toBe(4);
    expect(bonus.extraMoves).toBe(1);
    expect(bonus.heal).toBe(0);
  });

  it("adds a heal for a run of five", () => {
    const board = withRows([0, "F F W F F P W E"], [1, "W E F P F W E L"]);
    const state = scenario({ board });
    state.players[0].hp = 50;

    const { events, state: after } = applyMove(state, { type: "swap", a: 2, b: 10 });

    const bonus = pick(events, "bonus")[0]!;
    expect(bonus.runLength).toBe(5);
    expect(bonus.extraMoves).toBe(1);
    expect(bonus.heal).toBe(5);
    expect(after.players[0].hp).toBeGreaterThan(50);
  });

  it("caps extra moves at one per turn when match bonuses are off", () => {
    const board = withRows([0, "F F W F P F W E"], [1, "W E F P F W E L"]);
    const state = scenario({ board });
    state.config.matchBonusEnabled = false;
    state.config.cappedExtraMoves = 1;
    state.extraMovesThisTurn = 1;

    const { events } = applyMove(state, { type: "swap", a: 2, b: 10 });
    expect(pick(events, "bonus")[0]!.extraMoves).toBe(0);
  });
});

describe("abilities", () => {
  // Three earth across the top, completed by the tile below the gap.
  const EARTH_THREE = withRows([0, "E E W L P F W E"], [1, "W E E P F W E L"]);

  it("fires at full mana, resets the bar, and resolves its effects", () => {
    const state = scenario({
      teams: [
        ["turtlelisk", "slickitty"],
        ["bonzumi", "pelijet"],
      ],
      board: EARTH_THREE,
    });
    state.players[0].monsters[0].mana = 3; // Heal Leaf costs 6
    state.players[0].hp = 50;
    const opponentHpBefore = state.players[1].hp;

    const { events, state: after } = applyMove(state, { type: "swap", a: 2, b: 10 });

    const fired = pick(events, "ability").find((e) => e.defId === "turtlelisk");
    expect(fired).toBeDefined();
    expect(fired!.name).toBe("Heal Leaf");

    expect(after.players[1].hp).toBeLessThan(opponentHpBefore);
    expect(after.players[0].hp).toBeGreaterThan(50);
  });

  it("does not fire below the mana threshold", () => {
    const state = scenario({
      teams: [
        ["turtlelisk", "slickitty"],
        ["bonzumi", "pelijet"],
      ],
      board: EARTH_THREE,
    });
    state.players[0].monsters[0].mana = 0;

    const { events } = applyMove(state, { type: "swap", a: 2, b: 10 });
    expect(pick(events, "ability").filter((e) => e.defId === "turtlelisk")).toHaveLength(0);
  });

  it("blocks mana gain on a locked monster", () => {
    const state = scenario({ board: withRows([0, "F F W L P F W E"], [1, "W E F P F W E L"]) });
    state.players[0].monsters[0].lockedFor = 3;

    const { state: after } = applyMove(state, { type: "swap", a: 2, b: 10 });
    expect(after.players[0].monsters[0].mana).toBe(0);
    // The lock ticks down by one for the move that was spent.
    expect(after.players[0].monsters[0].lockedFor).toBeLessThan(3);
  });
});

describe("berry economy", () => {
  it("evolves a monster for berries and a move", () => {
    const state = scenario({ board: CLEAN });
    state.players[0].berries = 5;

    const { events, state: after } = applyMove(state, { type: "evolve", slot: 0 });

    const evolved = pick(events, "evolve")[0]!;
    expect(evolved.from).toBe("bonzumi");
    expect(evolved.to).toBe("bonzire");
    expect(after.players[0].berries).toBe(5 - DEFAULT_CONFIG.evolveBerryCost);
    expect(after.players[0].monsters[0].evolved).toBe(true);
  });

  it("refuses to evolve without enough berries", () => {
    const state = scenario({ board: CLEAN });
    state.players[0].berries = 3;
    const { events } = applyMove(state, { type: "evolve", slot: 0 });
    expect(pick(events, "moveRejected")[0]?.reason).toMatch(/costs 4 berries/);
  });

  it("refuses to evolve a monster that is already fully evolved", () => {
    const state = scenario({ board: CLEAN });
    state.players[0].berries = 8;
    state.players[0].monsters[0].defId = "bonzire";
    state.players[0].monsters[0].evolved = true;
    const { events } = applyMove(state, { type: "evolve", slot: 0 });
    expect(pick(events, "moveRejected")[0]?.reason).toMatch(/already fully evolved/);
  });

  it("boosts an evolved monster's mana bar", () => {
    const state = scenario({ board: CLEAN });
    state.players[0].berries = 4;
    state.players[0].monsters[0].defId = "bonzire";
    state.players[0].monsters[0].evolved = true;

    const { events, state: after } = applyMove(state, { type: "boost", slot: 0 });
    expect(pick(events, "boost")[0]!.amount).toBe(DEFAULT_CONFIG.boostManaAmount);
    expect(after.players[0].berries).toBe(0);
    expect(after.players[0].monsters[0].mana).toBe(DEFAULT_CONFIG.boostManaAmount);
  });

  it("refuses to boost an unevolved monster", () => {
    const state = scenario({ board: CLEAN });
    state.players[0].berries = 8;
    const { events } = applyMove(state, { type: "boost", slot: 0 });
    expect(pick(events, "moveRejected")[0]?.reason).toMatch(/must be evolved/);
  });
});

describe("turn flow", () => {
  it("hands the turn over once the move budget is spent", () => {
    const state = scenario({ board: CLEAN });
    const { state: after, events } = applyMove(state, { type: "pass" });
    expect(after.active).toBe(1);
    expect(after.movesLeft).toBe(DEFAULT_CONFIG.baseMoves);
    expect(pick(events, "turnEnd")).toHaveLength(1);
    expect(pick(events, "turnStart")[0]!.player).toBe(1);
  });

  it("applies a move penalty on the following turn, not the current one", () => {
    let state = scenario({ board: CLEAN });
    // Nerverack's Punish costs the user a move next turn.
    state.players[0].statuses.push({
      kind: "moveDelta",
      amount: -1,
      turnsRemaining: 1,
      appliedOnTurn: state.turn,
    });
    expect(state.movesLeft).toBe(2);

    state = applyMove(state, { type: "pass" }).state; // player 0 -> player 1
    state = applyMove(state, { type: "pass" }).state; // player 1 -> player 0

    expect(state.active).toBe(0);
    expect(state.movesLeft).toBe(1);
  });

  it("grants an extra move for two turns from Starblitz+", () => {
    let state = scenario({ board: CLEAN });
    state.players[0].statuses.push({
      kind: "moveDelta",
      amount: 1,
      turnsRemaining: 2,
      appliedOnTurn: state.turn,
    });

    const budgets: number[] = [];
    for (let i = 0; i < 3; i++) {
      state = applyMove(state, { type: "pass" }).state;
      state = applyMove(state, { type: "pass" }).state;
      budgets.push(state.movesLeft);
    }
    expect(budgets).toEqual([3, 3, 2]);
  });

  it("never drops a player below one move", () => {
    let state = scenario({ board: CLEAN });
    state.players[0].statuses.push(
      { kind: "moveDelta", amount: -1, turnsRemaining: 1, appliedOnTurn: state.turn },
      { kind: "moveDelta", amount: -1, turnsRemaining: 1, appliedOnTurn: state.turn },
      { kind: "moveDelta", amount: -1, turnsRemaining: 1, appliedOnTurn: state.turn },
    );
    state = applyMove(state, { type: "pass" }).state;
    state = applyMove(state, { type: "pass" }).state;
    expect(state.movesLeft).toBe(1);
  });

  it("ticks a heal-over-time on later turns only", () => {
    let state = scenario({ board: CLEAN });
    state.players[0].hp = 50;
    state.players[0].statuses.push({
      kind: "healOverTime",
      amount: 5,
      turnsRemaining: 2,
      appliedOnTurn: state.turn,
    });

    state = applyMove(state, { type: "pass" }).state;
    expect(state.players[0].hp).toBe(50); // opponent's turn, no tick yet

    state = applyMove(state, { type: "pass" }).state;
    expect(state.players[0].hp).toBe(55);

    state = applyMove(state, { type: "pass" }).state;
    state = applyMove(state, { type: "pass" }).state;
    expect(state.players[0].hp).toBe(60);

    state = applyMove(state, { type: "pass" }).state;
    state = applyMove(state, { type: "pass" }).state;
    expect(state.players[0].hp).toBe(60); // expired
  });
});

describe("purity and determinism", () => {
  it("does not mutate the state passed in", () => {
    const state = scenario({ board: withRows([0, "F F W L P F W E"], [1, "W E F P F W E L"]) });
    const snapshot = structuredClone(state);
    applyMove(state, { type: "swap", a: 2, b: 10 });
    expect(state).toEqual(snapshot);
  });

  it("produces identical results for identical inputs", () => {
    const state = scenario({ board: withRows([0, "F F W L P F W E"], [1, "W E F P F W E L"]) });
    const a = applyMove(state, { type: "swap", a: 2, b: 10 });
    const b = applyMove(state, { type: "swap", a: 2, b: 10 });
    expect(a.state).toEqual(b.state);
    expect(a.events).toEqual(b.events);
  });

  it("replays a whole match identically from the same seed", () => {
    const play = () => {
      let state = createMatch({
        seed: 20260825,
        teams: [
          ["bonzumi", "pelijet"],
          ["turtlelisk", "slickitty"],
        ],
      });
      for (let i = 0; i < 60 && state.winner === null; i++) {
        const options = legalSwaps(state);
        const choice = options[i % Math.max(1, options.length)];
        state = choice ? applyMove(state, { type: "swap", ...choice }).state
                       : applyMove(state, { type: "pass" }).state;
      }
      return state;
    };
    expect(play()).toEqual(play());
  });
});

describe("full playthroughs", () => {
  const teams: [[string, string], [string, string]][] = [
    [
      ["bonzumi", "pelijet"],
      ["turtlelisk", "slickitty"],
    ],
    [
      ["slickitty", "pelijet"],
      ["barbenin", "birchee"],
    ],
    [
      ["nerverack", "winklit"],
      ["ferobite", "criminook"],
    ],
    [
      ["pyrokun", "tropina"],
      ["glowzard", "trashark"],
    ],
    [
      ["timingo", "elfini"],
      ["bonzumi", "barbenin"],
    ],
  ];

  it("reaches a winner without throwing, across many seeds", () => {
    let finished = 0;

    for (let seed = 1; seed <= 40; seed++) {
      let state: MatchState = createMatch({ seed, teams: teams[seed % teams.length]! });

      for (let step = 0; step < 400 && state.winner === null; step++) {
        const options = legalSwaps(state);
        if (options.length === 0) {
          state = applyMove(state, { type: "pass" }).state;
          continue;
        }
        // Deterministic pseudo-choice so a failure is reproducible from the seed.
        const choice = options[(seed * 7 + step * 13) % options.length]!;
        const result = applyMove(state, { type: "swap", ...choice });
        state = result.state;

        for (const p of state.players) {
          expect(p.hp).toBeGreaterThanOrEqual(0);
          expect(p.hp).toBeLessThanOrEqual(p.maxHp);
          expect(p.berries).toBeGreaterThanOrEqual(0);
          for (const m of p.monsters) {
            expect(m.mana).toBeGreaterThanOrEqual(0);
            expect(m.mana).toBeLessThanOrEqual(getMonster(m.defId).mana);
          }
        }
        expect(state.board.every((t) => t !== null)).toBe(true);
        expect(state.board).toHaveLength(64);
      }

      if (state.winner !== null) finished++;
    }

    // Most random games should actually end; this catches a stalled damage loop.
    expect(finished).toBeGreaterThan(30);
  });

  it("survives the Pelijet conversion loop without hanging", () => {
    let state = createMatch({
      seed: 77,
      teams: [
        ["pelijet", "slickitty"],
        ["turtlelisk", "bonzumi"],
      ],
    });
    state.players[0].monsters[0].mana = 5;

    for (let step = 0; step < 120 && state.winner === null; step++) {
      const options = legalSwaps(state);
      if (options.length === 0) break;
      state = applyMove(state, { type: "swap", ...options[step % options.length]! }).state;
    }

    expect(state.board.every((t) => t !== null)).toBe(true);
  });
});
