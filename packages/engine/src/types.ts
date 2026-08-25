import type { Rng } from "./rng.js";

export type Element = "fire" | "water" | "earth" | "electric" | "psychic";

export const ELEMENTS: readonly Element[] = [
  "fire",
  "water",
  "earth",
  "electric",
  "psychic",
] as const;

/** Berry tiles are neutral: they feed the economy rather than any mana bar. */
export type TileKind = Element | "berry";

export const TILE_KINDS: readonly TileKind[] = [...ELEMENTS, "berry"] as const;

/**
 * Flags sit orthogonally to `kind`, so a tile can be (say) a cracked fire tile
 * or an echoing berry. Abilities that read the board back — Petirex, Echomori,
 * Cactkid — work off these rather than off the element.
 */
export interface TileFlags {
  cracked?: boolean;
  echo?: boolean;
  bullet?: boolean;
}

export interface Tile extends TileFlags {
  /** Stable across falls and swaps so the client can animate movement. */
  id: number;
  kind: TileKind;
}

export type PlayerIndex = 0 | 1;
export type SlotIndex = 0 | 1;

// ---------------------------------------------------------------------------
// Effect DSL
// ---------------------------------------------------------------------------

/**
 * Monster abilities are data, not code. Roughly two dozen primitives cover the
 * whole documented roster; adding a monster is a config entry.
 */
export type Effect =
  | { k: "damage"; n: number }
  | { k: "heal"; n: number }
  | { k: "healOverTime"; n: number; turns: number }
  | { k: "clearRow"; n: number }
  | { k: "clearColumn"; n: number }
  | { k: "clearGrid"; w: number; h: number }
  | { k: "clearRandom"; n: number }
  | { k: "convertTiles"; n: number; to: TileKind }
  | { k: "spawnTiles"; n: number; to: TileKind }
  | { k: "drainMana"; n: number }
  | { k: "grantManaAlly"; n: number }
  | { k: "grantManaTeam"; n: number }
  | { k: "stealBerries"; n: number }
  | { k: "stealMana"; n: number }
  | { k: "modifyMoves"; n: number; who: "self" | "opponent"; turns: number }
  | { k: "lockMonster"; moves: number }
  | { k: "shield"; charges: number; max: number }
  | { k: "crackTiles"; n: number }
  | { k: "collectCracked"; damagePerTile: number }
  | { k: "flagTiles"; n: number; flag: keyof TileFlags }
  | { k: "consumeFlagged"; flag: keyof TileFlags; damagePerTile: number }
  | { k: "addCounter"; counter: string; n: number; max?: number }
  | { k: "damagePerCounter"; counter: string; per: number; reset?: boolean }
  | { k: "toggleFlag"; flag: string; values: [string, string] }
  | { k: "branchOnLastMatch"; cases: Partial<Record<TileKind, Effect[]>> }
  | { k: "branchOnCounter"; counter: string; cases: { upTo: number; effects: Effect[] }[] };

export interface MonsterHooks {
  onTurnStart?: Effect[];
  onTurnEnd?: Effect[];
  /** Fires when the owning player's *other* monster gains mana from a match. */
  onAllyMatch?: Effect[];
}

export interface MonsterDef {
  /** Stable slug used everywhere in code and asset filenames. */
  id: string;
  /** Roster number from the design document, or "" for the unnumbered entries. */
  numId: string;
  name: string;
  element: Element;
  /** Mana required for the ability to fire. */
  mana: number;
  skill: string;
  /** Human-readable rules text, shown in the UI. */
  text: string;
  effects: Effect[];
  hooks?: MonsterHooks;
  evolved: boolean;
  evolvesTo?: string;
  initialCounters?: Record<string, number>;
  initialFlags?: Record<string, string>;
  /** Multipliers the monster's own state can modulate (Gargice's stances). */
  damageMultiplier?: number;
  manaMultiplier?: number;
}

// ---------------------------------------------------------------------------
// Match state
// ---------------------------------------------------------------------------

export interface MonsterState {
  /** Definition id of the monster's *current* form. */
  defId: string;
  mana: number;
  evolved: boolean;
  /** Moves remaining during which this monster cannot accumulate mana. */
  lockedFor: number;
  counters: Record<string, number>;
  flags: Record<string, string>;
}

export type StatusKind = "healOverTime" | "moveDelta" | "shield";

export interface StatusEffect {
  kind: StatusKind;
  amount: number;
  /** Ticks down at the owner's turn start; 0 means expired. */
  turnsRemaining: number;
  /**
   * Turn number the status was created on. A status never ticks on the turn it
   * was applied, so "lose a move next turn" costs the next turn, not this one.
   */
  appliedOnTurn: number;
}

export interface PlayerState {
  index: PlayerIndex;
  hp: number;
  maxHp: number;
  berries: number;
  monsters: [MonsterState, MonsterState];
  statuses: StatusEffect[];
  /** Element of this player's most recent match — read by Aromaphant. */
  lastMatchKind: TileKind | null;
}

export interface MatchConfig {
  boardSize: number;
  startingHp: number;
  baseMoves: number;
  /** When false, a turn may gain at most `cappedExtraMoves` extra moves. */
  matchBonusEnabled: boolean;
  cappedExtraMoves: number;
  berryWeight: number;
  evolveBerryCost: number;
  boostBerryCost: number;
  boostManaAmount: number;
  /** Hard stop on the cascade loop so converter abilities cannot run away. */
  maxCascadeDepth: number;
  /** Whether matches created by an ability may refund moves. Recommended off. */
  abilityCascadesGrantMoves: boolean;
  secondPlayerHpBonus: number;
}

export const DEFAULT_CONFIG: MatchConfig = {
  boardSize: 8,
  startingHp: 100,
  baseMoves: 2,
  matchBonusEnabled: true,
  cappedExtraMoves: 1,
  // Berries are rarer than any single element, but not so rare that evolution
  // becomes a late-game accident. At 0.7 the first evolution lands around turn
  // 6-7 of a ~26-turn game; at 0.4 it slipped to turn 11.
  berryWeight: 0.7,
  evolveBerryCost: 4,
  boostBerryCost: 4,
  boostManaAmount: 4,
  maxCascadeDepth: 20,
  abilityCascadesGrantMoves: false,
  secondPlayerHpBonus: 5,
};

export interface MatchState {
  /** Row-major, length boardSize². Never null between moves. */
  board: (Tile | null)[];
  players: [PlayerState, PlayerState];
  active: PlayerIndex;
  movesLeft: number;
  /** Reset each turn; enforces the cap when match bonuses are switched off. */
  extraMovesThisTurn: number;
  turn: number;
  rng: Rng;
  nextTileId: number;
  winner: PlayerIndex | null;
  config: MatchConfig;
}

// ---------------------------------------------------------------------------
// Moves and events
// ---------------------------------------------------------------------------

export type Move =
  | { type: "swap"; a: number; b: number }
  | { type: "evolve"; slot: SlotIndex }
  | { type: "boost"; slot: SlotIndex }
  | { type: "pass" };

export interface TileMove {
  from: number;
  to: number;
  tileId: number;
}

export interface CellTile {
  index: number;
  tile: Tile;
}

/**
 * The animation script. The client never computes game state; it plays these
 * back in order. A rendering bug therefore cannot desynchronise a match.
 */
export type GameEvent =
  | { type: "moveRejected"; reason: string }
  | { type: "turnStart"; player: PlayerIndex; moves: number }
  | { type: "swap"; a: number; b: number }
  | { type: "match"; tiles: number[]; kind: TileKind; size: number; runLength: number; cascade: number }
  | { type: "mana"; player: PlayerIndex; slot: SlotIndex; amount: number; total: number; capped: boolean }
  | { type: "berries"; player: PlayerIndex; amount: number; total: number }
  | { type: "bonus"; player: PlayerIndex; runLength: number; extraMoves: number; heal: number; damage: number }
  | { type: "remove"; tiles: number[] }
  | { type: "fall"; moves: TileMove[] }
  | { type: "spawn"; cells: CellTile[] }
  | { type: "convert"; cells: CellTile[] }
  | { type: "flag"; cells: number[]; flag: keyof TileFlags }
  | { type: "ability"; player: PlayerIndex; slot: SlotIndex; defId: string; name: string }
  | { type: "damage"; target: PlayerIndex; amount: number; hp: number; reflected?: boolean }
  | { type: "absorbed"; target: PlayerIndex; amount: number; chargesLeft: number }
  | { type: "heal"; target: PlayerIndex; amount: number; hp: number }
  | { type: "manaChange"; target: PlayerIndex; slot: SlotIndex; delta: number; total: number }
  | { type: "berryChange"; target: PlayerIndex; delta: number; total: number }
  | { type: "statusApplied"; target: PlayerIndex; status: StatusEffect }
  | { type: "monsterLocked"; target: PlayerIndex; slot: SlotIndex; moves: number }
  | { type: "movesChanged"; player: PlayerIndex; delta: number; scope: "thisTurn" | "nextTurn" }
  | { type: "counterChanged"; player: PlayerIndex; slot: SlotIndex; counter: string; total: number }
  | { type: "flagChanged"; player: PlayerIndex; slot: SlotIndex; flag: string; value: string }
  | { type: "evolve"; player: PlayerIndex; slot: SlotIndex; from: string; to: string }
  | { type: "boost"; player: PlayerIndex; slot: SlotIndex; amount: number }
  | { type: "cascadeCapped"; depth: number }
  | { type: "turnEnd"; player: PlayerIndex }
  | { type: "gameOver"; winner: PlayerIndex };

export interface MoveResult {
  state: MatchState;
  events: GameEvent[];
}
