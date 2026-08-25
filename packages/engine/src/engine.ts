import {
  areAdjacent,
  findMatches,
  generateBoard,
  hasLegalMove,
  swapCreatesMatch,
  type MatchGroup,
} from "./board.js";
import { Ctx, other } from "./context.js";
import { runEffects } from "./effects.js";
import { getMonster } from "./monsters.js";
import { createRng, RngCursor } from "./rng.js";
import {
  DEFAULT_CONFIG,
  ELEMENTS,
  type Element,
  type MatchConfig,
  type MatchState,
  type MonsterState,
  type Move,
  type MoveResult,
  type PlayerIndex,
  type PlayerState,
  type SlotIndex,
} from "./types.js";

export interface CreateMatchOptions {
  seed: number;
  /** Two base-form monster ids per player. */
  teams: [[string, string], [string, string]];
  /** Which player takes the first turn. The other gets the health bonus. */
  first?: PlayerIndex;
  config?: Partial<MatchConfig>;
}

function makeMonster(defId: string): MonsterState {
  const def = getMonster(defId);
  return {
    defId,
    mana: 0,
    evolved: def.evolved,
    lockedFor: 0,
    counters: { ...(def.initialCounters ?? {}) },
    flags: { ...(def.initialFlags ?? {}) },
  };
}

/** All Pick rule: a team may not field two monsters of the same element. */
export function validateTeam(team: readonly string[]): string | null {
  if (team.length !== 2) return "A team must have exactly 2 monsters.";
  const seen = new Set<Element>();
  for (const id of team) {
    const def = getMonster(id);
    if (def.evolved) return `${def.name} is an evolved form and cannot be picked directly.`;
    if (seen.has(def.element)) return `A team cannot field two ${def.element} monsters.`;
    seen.add(def.element);
  }
  return null;
}

export function createMatch(options: CreateMatchOptions): MatchState {
  const config: MatchConfig = { ...DEFAULT_CONFIG, ...options.config };
  const first: PlayerIndex = options.first ?? 0;
  const second = other(first);

  for (const team of options.teams) {
    const problem = validateTeam(team);
    if (problem) throw new Error(problem);
  }

  const players = [0, 1].map((i) => {
    const index = i as PlayerIndex;
    const team = options.teams[index];
    const maxHp = config.startingHp + (index === second ? config.secondPlayerHpBonus : 0);
    const player: PlayerState = {
      index,
      hp: maxHp,
      maxHp,
      berries: 0,
      monsters: [makeMonster(team[0]), makeMonster(team[1])],
      statuses: [],
      lastMatchKind: null,
    };
    return player;
  }) as [PlayerState, PlayerState];

  const state: MatchState = {
    board: [],
    players,
    active: first,
    movesLeft: config.baseMoves,
    extraMovesThisTurn: 0,
    turn: 1,
    rng: createRng(options.seed),
    nextTileId: 1,
    winner: null,
    config,
  };

  const cursor = new RngCursor(state);
  state.board = generateBoard(
    config.boardSize,
    cursor,
    { next: (kind) => ({ id: state.nextTileId++, kind }) },
    config.berryWeight,
  );

  return state;
}

// ---------------------------------------------------------------------------
// Move application
// ---------------------------------------------------------------------------

export function applyMove(state: MatchState, move: Move): MoveResult {
  if (state.winner !== null) {
    return { state, events: [{ type: "moveRejected", reason: "The match is already over." }] };
  }

  const next = structuredClone(state);
  const ctx = new Ctx(next);
  const active = next.active;

  const reject = (reason: string): MoveResult => ({
    state,
    events: [{ type: "moveRejected", reason }],
  });

  switch (move.type) {
    case "swap": {
      if (next.movesLeft <= 0) return reject("No moves left this turn.");
      if (!areAdjacent(move.a, move.b, next.config.boardSize)) {
        return reject("Those tiles are not next to each other.");
      }
      const view = { board: next.board, size: next.config.boardSize };
      if (!next.board[move.a] || !next.board[move.b]) return reject("That cell is empty.");
      if (!swapCreatesMatch(view, move.a, move.b)) {
        return reject("That swap would not make a line of three.");
      }

      const tileA = next.board[move.a]!;
      const tileB = next.board[move.b]!;
      next.board[move.a] = tileB;
      next.board[move.b] = tileA;
      ctx.emit({ type: "swap", a: move.a, b: move.b });

      next.movesLeft -= 1;
      tickMonsterLocks(ctx, active);
      settle(ctx, active, true);
      break;
    }

    case "evolve": {
      if (next.movesLeft <= 0) return reject("No moves left this turn.");
      const monster = ctx.monster(active, move.slot);
      const def = getMonster(monster.defId);
      if (monster.evolved || !def.evolvesTo) return reject(`${def.name} is already fully evolved.`);
      if (ctx.player(active).berries < next.config.evolveBerryCost) {
        return reject(`Evolving costs ${next.config.evolveBerryCost} berries.`);
      }

      ctx.addBerries(active, -next.config.evolveBerryCost, false);
      next.movesLeft -= 1;
      const from = monster.defId;
      monster.defId = def.evolvesTo;
      monster.evolved = true;
      const evolvedDef = getMonster(monster.defId);
      monster.mana = Math.min(monster.mana, evolvedDef.mana);
      ctx.emit({ type: "evolve", player: active, slot: move.slot, from, to: monster.defId });

      tickMonsterLocks(ctx, active);
      settle(ctx, active, true);
      break;
    }

    case "boost": {
      if (next.movesLeft <= 0) return reject("No moves left this turn.");
      const monster = ctx.monster(active, move.slot);
      const def = getMonster(monster.defId);
      if (!monster.evolved) return reject(`${def.name} must be evolved before it can be boosted.`);
      if (ctx.player(active).berries < next.config.boostBerryCost) {
        return reject(`Boosting costs ${next.config.boostBerryCost} berries.`);
      }

      ctx.addBerries(active, -next.config.boostBerryCost, false);
      next.movesLeft -= 1;
      ctx.addMana(active, move.slot, next.config.boostManaAmount, false);
      ctx.emit({
        type: "boost",
        player: active,
        slot: move.slot,
        amount: next.config.boostManaAmount,
      });

      tickMonsterLocks(ctx, active);
      settle(ctx, active, true);
      break;
    }

    case "pass": {
      next.movesLeft = 0;
      break;
    }
  }

  if (next.winner === null && next.movesLeft <= 0) {
    endTurn(ctx);
  }

  return { state: next, events: ctx.events };
}

export interface MatchBonus {
  extraMove: boolean;
  heal: number;
  damage: number;
}

/**
 * Bonus tiers are cumulative: four tiles refunds a move, five adds a heal, six
 * or more adds chip damage on top.
 */
export function bonusForRun(runLength: number): MatchBonus {
  if (runLength < 4) return { extraMove: false, heal: 0, damage: 0 };
  return {
    extraMove: true,
    heal: runLength >= 5 ? 5 : 0,
    damage: runLength >= 6 ? 5 : 0,
  };
}

/** Every swap that would score, for hints and for driving test playthroughs. */
export function legalSwaps(state: MatchState): { a: number; b: number }[] {
  const size = state.config.boardSize;
  const view = { board: state.board, size };
  const out: { a: number; b: number }[] = [];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const here = y * size + x;
      if (x + 1 < size && swapCreatesMatch(view, here, here + 1)) out.push({ a: here, b: here + 1 });
      if (y + 1 < size && swapCreatesMatch(view, here, here + size)) {
        out.push({ a: here, b: here + size });
      }
    }
  }

  return out;
}

function tickMonsterLocks(ctx: Ctx, player: PlayerIndex): void {
  for (const slot of [0, 1] as SlotIndex[]) {
    const monster = ctx.monster(player, slot);
    if (monster.lockedFor > 0) monster.lockedFor -= 1;
  }
}

// ---------------------------------------------------------------------------
// The settle loop: cascades and ability firing, interleaved
// ---------------------------------------------------------------------------

/**
 * Resolves the board to a stable state.
 *
 * Cascades and ability triggers share one loop because they feed each other: a
 * match can fill a mana bar, and the ability that fires can create new matches.
 * `maxCascadeDepth` is the hard stop that keeps converter monsters such as
 * Pelijet from looping forever.
 */
function settle(ctx: Ctx, scoringPlayer: PlayerIndex, allowMoveBonuses: boolean): void {
  const { config } = ctx.state;
  let depth = 0;
  let abilityHasFired = false;

  for (;;) {
    if (ctx.state.winner !== null) return;

    if (depth >= config.maxCascadeDepth) {
      ctx.emit({ type: "cascadeCapped", depth });
      return;
    }

    const view = { board: ctx.state.board, size: config.boardSize };
    const groups = findMatches(view);

    if (groups.length > 0) {
      // Ability-created matches still pay mana -- that is the documented
      // Pelijet loop -- but by default they do not refund moves.
      const grantMoves =
        allowMoveBonuses && (!abilityHasFired || config.abilityCascadesGrantMoves);
      scoreMatches(ctx, groups, scoringPlayer, depth, grantMoves);
      ctx.clearCells(groups.flatMap((g) => g.tiles));
      depth++;
      continue;
    }

    if (fireNextReadyAbility(ctx, scoringPlayer)) {
      abilityHasFired = true;
      depth++;
      continue;
    }

    break;
  }

  ensurePlayableBoard(ctx);
}

function scoreMatches(
  ctx: Ctx,
  groups: readonly MatchGroup[],
  player: PlayerIndex,
  cascade: number,
  grantMoves: boolean,
): void {
  const { config } = ctx.state;

  for (const group of groups) {
    ctx.emit({
      type: "match",
      tiles: group.tiles,
      kind: group.kind,
      size: group.tiles.length,
      runLength: group.runLength,
      cascade,
    });

    ctx.player(player).lastMatchKind = group.kind;

    if (group.kind === "berry") {
      ctx.addBerries(player, group.tiles.length, true);
    } else {
      const slot = slotForElement(ctx, player, group.kind);
      if (slot !== null) {
        const gained = ctx.addMana(player, slot, applyManaMultiplier(ctx, player, slot, group.tiles.length), true);
        if (gained > 0) runAllyMatchHooks(ctx, player, slot);
      }
    }

    // Bonus tiers read the longest single run in the group.
    const run = group.runLength;
    const bonus = bonusForRun(run);
    if (!bonus.extraMove && bonus.heal === 0 && bonus.damage === 0) continue;

    let extraMoves = 0;
    if (grantMoves && bonus.extraMove) {
      const cap = config.matchBonusEnabled ? Infinity : config.cappedExtraMoves;
      if (ctx.state.extraMovesThisTurn < cap) {
        extraMoves = 1;
        ctx.state.extraMovesThisTurn += 1;
        ctx.state.movesLeft += 1;
      }
    }

    const { heal, damage } = bonus;

    ctx.emit({ type: "bonus", player, runLength: run, extraMoves, heal, damage });
    if (heal > 0) ctx.heal(player, heal);
    if (damage > 0) ctx.damage(other(player), damage, player);
  }
}

function slotForElement(ctx: Ctx, player: PlayerIndex, element: Element | string): SlotIndex | null {
  for (const slot of [0, 1] as SlotIndex[]) {
    if (getMonster(ctx.monster(player, slot).defId).element === element) return slot;
  }
  return null;
}

function applyManaMultiplier(ctx: Ctx, player: PlayerIndex, slot: SlotIndex, amount: number): number {
  return ctx.monster(player, slot).flags["stance"] === "ice" ? amount * 2 : amount;
}

/** Abyssoul-style hooks that read the *other* slot's matches. */
function runAllyMatchHooks(ctx: Ctx, player: PlayerIndex, matchedSlot: SlotIndex): void {
  const allySlot: SlotIndex = matchedSlot === 0 ? 1 : 0;
  const hooks = getMonster(ctx.monster(player, allySlot).defId).hooks?.onAllyMatch;
  if (hooks) runEffects(ctx, hooks, { player, slot: allySlot });
}

/**
 * Fires at most one ability, so the board can be rescored between triggers.
 * Returns whether anything fired.
 */
function fireNextReadyAbility(ctx: Ctx, activePlayer: PlayerIndex): boolean {
  const order: [PlayerIndex, SlotIndex][] = [
    [activePlayer, 0],
    [activePlayer, 1],
    [other(activePlayer), 0],
    [other(activePlayer), 1],
  ];

  for (const [player, slot] of order) {
    const monster = ctx.monster(player, slot);
    const def = getMonster(monster.defId);
    if (monster.mana < def.mana) continue;

    monster.mana = 0;
    ctx.emit({ type: "ability", player, slot, defId: def.id, name: def.skill });
    ctx.emit({ type: "manaChange", target: player, slot, delta: -def.mana, total: 0 });
    runEffects(ctx, def.effects, { player, slot });
    return true;
  }

  return false;
}

/** Reshuffles a board with no legal swap left. */
function ensurePlayableBoard(ctx: Ctx): void {
  const view = { board: ctx.state.board, size: ctx.state.config.boardSize };
  if (hasLegalMove(view)) return;

  ctx.state.board = generateBoard(
    ctx.state.config.boardSize,
    ctx.rng,
    { next: (kind) => ctx.newTile(kind) },
    ctx.state.config.berryWeight,
  );
  ctx.emit({
    type: "spawn",
    cells: ctx.state.board.map((tile, index) => ({ index, tile: tile! })),
  });
}

// ---------------------------------------------------------------------------
// Turn transitions
// ---------------------------------------------------------------------------

function endTurn(ctx: Ctx): void {
  const active = ctx.state.active;
  ctx.emit({ type: "turnEnd", player: active });

  for (const slot of [0, 1] as SlotIndex[]) {
    const hooks = getMonster(ctx.monster(active, slot).defId).hooks?.onTurnEnd;
    if (hooks) runEffects(ctx, hooks, { player: active, slot });
  }
  settle(ctx, active, false);
  if (ctx.state.winner !== null) return;

  startTurn(ctx, other(active));
}

function startTurn(ctx: Ctx, player: PlayerIndex): void {
  const state = ctx.state;
  state.active = player;
  state.turn += 1;
  state.extraMovesThisTurn = 0;

  let moveDelta = 0;
  const survivors = [];

  for (const status of ctx.player(player).statuses) {
    if (status.kind === "shield") {
      // Shields decay by one charge per turn rather than expiring on a timer.
      status.amount -= 1;
      if (status.amount > 0) survivors.push(status);
      continue;
    }

    // A status never ticks on the turn it was applied.
    if (status.appliedOnTurn >= state.turn) {
      survivors.push(status);
      continue;
    }

    if (status.kind === "healOverTime") ctx.heal(player, status.amount);
    if (status.kind === "moveDelta") moveDelta += status.amount;

    status.turnsRemaining -= 1;
    if (status.turnsRemaining > 0) survivors.push(status);
  }

  ctx.player(player).statuses = survivors;

  // Floored at one so stacked move penalties can never deadlock the match.
  state.movesLeft = Math.max(1, state.config.baseMoves + moveDelta);

  for (const slot of [0, 1] as SlotIndex[]) {
    const hooks = getMonster(ctx.monster(player, slot).defId).hooks?.onTurnStart;
    if (hooks) runEffects(ctx, hooks, { player, slot });
  }

  ctx.emit({ type: "turnStart", player, moves: state.movesLeft });
}

export { ELEMENTS };
