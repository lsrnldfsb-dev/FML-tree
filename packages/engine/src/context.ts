import { applyGravity, columnIndices, gridIndices, occupiedIndices, refill, rowIndices } from "./board.js";
import { RngCursor } from "./rng.js";
import type {
  CellTile,
  GameEvent,
  MatchState,
  MonsterState,
  PlayerIndex,
  SlotIndex,
  StatusEffect,
  Tile,
  TileFlags,
  TileKind,
} from "./types.js";
import { getMonster } from "./monsters.js";

export function other(player: PlayerIndex): PlayerIndex {
  return player === 0 ? 1 : 0;
}

/**
 * Shared mutable scratchpad for one `applyMove` call.
 *
 * Everything that changes game state goes through here so that each change
 * emits its matching event exactly once. `applyMove` clones the incoming state
 * before constructing a context, so the caller's state is never touched.
 */
export class Ctx {
  readonly rng: RngCursor;
  readonly events: GameEvent[] = [];

  constructor(readonly state: MatchState) {
    this.rng = new RngCursor(state);
  }

  get size(): number {
    return this.state.config.boardSize;
  }

  emit(event: GameEvent): void {
    this.events.push(event);
  }

  player(index: PlayerIndex) {
    return this.state.players[index];
  }

  monster(player: PlayerIndex, slot: SlotIndex): MonsterState {
    return this.state.players[player].monsters[slot];
  }

  def(player: PlayerIndex, slot: SlotIndex) {
    return getMonster(this.monster(player, slot).defId);
  }

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------

  /**
   * Applies damage through the shield pipeline.
   *
   * A shield charge absorbs 5 damage. Charges left unspent after absorbing
   * reflect 10 each back at the attacker -- the design document's wording is
   * ambiguous here, but this reading matches its claim that attacking into a
   * full shield is severely punished.
   */
  damage(target: PlayerIndex, amount: number, attacker: PlayerIndex | null = null): void {
    if (amount <= 0 || this.state.winner !== null) return;

    let incoming = amount;
    const shield = this.player(target).statuses.find((s) => s.kind === "shield");

    if (shield && shield.amount > 0) {
      const chargesNeeded = Math.ceil(incoming / 5);
      const chargesUsed = Math.min(shield.amount, chargesNeeded);
      const absorbed = Math.min(incoming, chargesUsed * 5);
      incoming -= absorbed;
      shield.amount -= chargesUsed;

      if (absorbed > 0) {
        this.emit({ type: "absorbed", target, amount: absorbed, chargesLeft: shield.amount });
      }
      if (shield.amount > 0 && attacker !== null) {
        const reflected = shield.amount * 10;
        shield.amount = 0;
        this.emit({ type: "absorbed", target, amount: 0, chargesLeft: 0 });
        this.applyRawDamage(attacker, reflected, true);
      }
      if (shield.amount <= 0) {
        this.player(target).statuses = this.player(target).statuses.filter((s) => s !== shield);
      }
    }

    this.applyRawDamage(target, incoming, false);
  }

  private applyRawDamage(target: PlayerIndex, amount: number, reflected: boolean): void {
    if (amount <= 0 || this.state.winner !== null) return;
    const p = this.player(target);
    p.hp = Math.max(0, p.hp - amount);
    this.emit({ type: "damage", target, amount, hp: p.hp, reflected });
    if (p.hp <= 0) this.declareWinner(other(target));
  }

  heal(target: PlayerIndex, amount: number): void {
    if (amount <= 0 || this.state.winner !== null) return;
    const p = this.player(target);
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + amount);
    const gained = p.hp - before;
    if (gained > 0) this.emit({ type: "heal", target, amount: gained, hp: p.hp });
  }

  declareWinner(winner: PlayerIndex): void {
    if (this.state.winner !== null) return;
    this.state.winner = winner;
    this.emit({ type: "gameOver", winner });
  }

  // -------------------------------------------------------------------------
  // Mana and berries
  // -------------------------------------------------------------------------

  /** Adds mana, respecting the monster's lock and its ability's cap. */
  addMana(player: PlayerIndex, slot: SlotIndex, amount: number, fromMatch: boolean): number {
    const monster = this.monster(player, slot);
    if (amount > 0 && monster.lockedFor > 0) {
      this.emit({ type: "mana", player, slot, amount: 0, total: monster.mana, capped: false });
      return 0;
    }

    const cap = getMonster(monster.defId).mana;
    const before = monster.mana;
    monster.mana = Math.max(0, Math.min(cap, monster.mana + amount));
    const delta = monster.mana - before;
    if (delta === 0) return 0;

    if (fromMatch) {
      this.emit({
        type: "mana",
        player,
        slot,
        amount: delta,
        total: monster.mana,
        capped: monster.mana >= cap,
      });
    } else {
      this.emit({ type: "manaChange", target: player, slot, delta, total: monster.mana });
    }
    return delta;
  }

  addBerries(player: PlayerIndex, amount: number, fromMatch: boolean): number {
    const p = this.player(player);
    const before = p.berries;
    p.berries = Math.max(0, p.berries + amount);
    const delta = p.berries - before;
    if (delta === 0) return 0;

    if (fromMatch) this.emit({ type: "berries", player, amount: delta, total: p.berries });
    else this.emit({ type: "berryChange", target: player, delta, total: p.berries });
    return delta;
  }

  addStatus(target: PlayerIndex, status: Omit<StatusEffect, "appliedOnTurn">): void {
    const full: StatusEffect = { ...status, appliedOnTurn: this.state.turn };
    if (status.kind === "shield") {
      // Shields stack into a single capped pool rather than layering.
      const existing = this.player(target).statuses.find((s) => s.kind === "shield");
      if (existing) {
        existing.amount = Math.min(existing.amount + status.amount, status.turnsRemaining || 7);
        this.emit({ type: "statusApplied", target, status: existing });
        return;
      }
    }
    this.player(target).statuses.push(full);
    this.emit({ type: "statusApplied", target, status: full });
  }

  setCounter(player: PlayerIndex, slot: SlotIndex, counter: string, value: number): void {
    const monster = this.monster(player, slot);
    monster.counters[counter] = value;
    this.emit({ type: "counterChanged", player, slot, counter, total: value });
  }

  setMonsterFlag(player: PlayerIndex, slot: SlotIndex, flag: string, value: string): void {
    const monster = this.monster(player, slot);
    monster.flags[flag] = value;
    this.emit({ type: "flagChanged", player, slot, flag, value });
  }

  // -------------------------------------------------------------------------
  // Board mutation
  // -------------------------------------------------------------------------

  newTile(kind: TileKind): Tile {
    return { id: this.state.nextTileId++, kind };
  }

  private get view() {
    return { board: this.state.board, size: this.size };
  }

  /**
   * Destroys tiles outright. Ability clears award no mana on their own -- the
   * value comes from the cascade they set up, which the settle loop scores
   * normally.
   */
  clearCells(indices: readonly number[]): void {
    const cleared = [...new Set(indices)].filter((i) => this.state.board[i]);
    if (cleared.length === 0) return;
    for (const i of cleared) this.state.board[i] = null;
    this.emit({ type: "remove", tiles: cleared });
    this.settleGravity();
  }

  /** Drops tiles into gaps and refills from the top. */
  settleGravity(): void {
    const moves = applyGravity(this.view);
    if (moves.length > 0) this.emit({ type: "fall", moves });
    const spawned = refill(
      this.view,
      this.rng,
      { next: (kind) => this.newTile(kind) },
      this.state.config.berryWeight,
    );
    if (spawned.length > 0) this.emit({ type: "spawn", cells: spawned });
  }

  /** Replaces the contents of cells in place, keeping them on the board. */
  convertCells(indices: readonly number[], kind: TileKind): void {
    const cells: CellTile[] = [];
    for (const i of [...new Set(indices)]) {
      if (!this.state.board[i]) continue;
      const tile = this.newTile(kind);
      this.state.board[i] = tile;
      cells.push({ index: i, tile });
    }
    if (cells.length > 0) this.emit({ type: "convert", cells });
  }

  flagCells(indices: readonly number[], flag: keyof TileFlags): void {
    const touched: number[] = [];
    for (const i of [...new Set(indices)]) {
      const tile = this.state.board[i];
      if (!tile || tile[flag]) continue;
      tile[flag] = true;
      touched.push(i);
    }
    if (touched.length > 0) this.emit({ type: "flag", cells: touched, flag });
  }

  findFlagged(flag: keyof TileFlags): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.state.board.length; i++) {
      if (this.state.board[i]?.[flag]) out.push(i);
    }
    return out;
  }

  randomCells(count: number): number[] {
    return this.rng.sample(occupiedIndices(this.view), count);
  }

  /** Random cells, preferring ones that are not already `kind`. */
  randomCellsNotOfKind(count: number, kind: TileKind): number[] {
    const all = occupiedIndices(this.view);
    const preferred = all.filter((i) => this.state.board[i]?.kind !== kind);
    if (preferred.length >= count) return this.rng.sample(preferred, count);
    return [...preferred, ...this.rng.sample(all.filter((i) => !preferred.includes(i)), count - preferred.length)];
  }

  randomRows(count: number): number[] {
    const rows = this.rng.sample(
      Array.from({ length: this.size }, (_, y) => y),
      count,
    );
    return rows.flatMap((y) => rowIndices(y, this.size));
  }

  randomColumns(count: number): number[] {
    const cols = this.rng.sample(
      Array.from({ length: this.size }, (_, x) => x),
      count,
    );
    return cols.flatMap((x) => columnIndices(x, this.size));
  }

  randomGrid(w: number, h: number): number[] {
    const x = this.rng.int(Math.max(1, this.size - w + 1));
    const y = this.rng.int(Math.max(1, this.size - h + 1));
    return gridIndices(x, y, w, h, this.size);
  }
}
