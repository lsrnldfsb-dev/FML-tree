import { Ctx, other } from "./context.js";
import type { Effect, PlayerIndex, SlotIndex, TileKind } from "./types.js";

export interface EffectSource {
  /** The player whose monster is acting. */
  player: PlayerIndex;
  /** Which of their two slots. */
  slot: SlotIndex;
}

/** Runs an effect list to completion in order. */
export function runEffects(ctx: Ctx, effects: readonly Effect[], source: EffectSource): void {
  for (const effect of effects) {
    if (ctx.state.winner !== null) return;
    runEffect(ctx, effect, source);
  }
}

function runEffect(ctx: Ctx, effect: Effect, source: EffectSource): void {
  const self = source.player;
  const foe = other(self);
  const allySlot: SlotIndex = source.slot === 0 ? 1 : 0;

  switch (effect.k) {
    // --- direct ---------------------------------------------------------
    case "damage": {
      ctx.damage(foe, scaleDamage(ctx, source, effect.n), self);
      break;
    }
    case "heal": {
      ctx.heal(self, effect.n);
      break;
    }
    case "healOverTime": {
      ctx.addStatus(self, { kind: "healOverTime", amount: effect.n, turnsRemaining: effect.turns });
      break;
    }

    // --- board clears -----------------------------------------------------
    case "clearRow": {
      ctx.clearCells(ctx.randomRows(effect.n));
      break;
    }
    case "clearColumn": {
      ctx.clearCells(ctx.randomColumns(effect.n));
      break;
    }
    case "clearGrid": {
      ctx.clearCells(ctx.randomGrid(effect.w, effect.h));
      break;
    }
    case "clearRandom": {
      ctx.clearCells(ctx.randomCells(effect.n));
      break;
    }

    // --- board rewrites ---------------------------------------------------
    case "convertTiles": {
      ctx.convertCells(ctx.randomCellsNotOfKind(effect.n, effect.to), effect.to);
      break;
    }
    case "spawnTiles": {
      ctx.convertCells(ctx.randomCellsNotOfKind(effect.n, effect.to), effect.to);
      break;
    }
    case "flagTiles": {
      ctx.flagCells(ctx.randomCells(effect.n), effect.flag);
      break;
    }
    case "crackTiles": {
      ctx.flagCells(ctx.randomCells(effect.n), "cracked");
      break;
    }
    case "collectCracked": {
      const cracked = ctx.findFlagged("cracked");
      if (cracked.length > 0) {
        ctx.damage(foe, scaleDamage(ctx, source, cracked.length * effect.damagePerTile), self);
        ctx.clearCells(cracked);
      }
      break;
    }
    case "consumeFlagged": {
      const flagged = ctx.findFlagged(effect.flag);
      if (flagged.length > 0) {
        ctx.damage(foe, scaleDamage(ctx, source, flagged.length * effect.damagePerTile), self);
        ctx.clearCells(flagged);
      }
      break;
    }

    // --- resources --------------------------------------------------------
    case "drainMana": {
      for (const slot of [0, 1] as SlotIndex[]) ctx.addMana(foe, slot, -effect.n, false);
      break;
    }
    case "grantManaAlly": {
      ctx.addMana(self, allySlot, effect.n, false);
      break;
    }
    case "grantManaTeam": {
      for (const slot of [0, 1] as SlotIndex[]) ctx.addMana(self, slot, effect.n, false);
      break;
    }
    case "stealBerries": {
      const taken = Math.min(effect.n, ctx.player(foe).berries);
      if (taken > 0) {
        ctx.addBerries(foe, -taken, false);
        ctx.addBerries(self, taken, false);
      }
      break;
    }
    case "stealMana": {
      let remaining = effect.n;
      for (const slot of [0, 1] as SlotIndex[]) {
        if (remaining <= 0) break;
        const available = ctx.monster(foe, slot).mana;
        const taken = Math.min(remaining, available);
        if (taken <= 0) continue;
        ctx.addMana(foe, slot, -taken, false);
        ctx.addMana(self, source.slot, taken, false);
        remaining -= taken;
      }
      break;
    }

    // --- action economy ---------------------------------------------------
    case "modifyMoves": {
      const target = effect.who === "self" ? self : foe;
      ctx.addStatus(target, {
        kind: "moveDelta",
        amount: effect.n,
        turnsRemaining: effect.turns,
      });
      ctx.emit({ type: "movesChanged", player: target, delta: effect.n, scope: "nextTurn" });
      break;
    }

    // --- denial and defence -----------------------------------------------
    case "lockMonster": {
      const candidates: SlotIndex[] = [0, 1];
      const slot = ctx.rng.pick(candidates) ?? 0;
      ctx.monster(foe, slot).lockedFor = Math.max(ctx.monster(foe, slot).lockedFor, effect.moves);
      ctx.emit({ type: "monsterLocked", target: foe, slot, moves: effect.moves });
      break;
    }
    case "shield": {
      ctx.addStatus(self, {
        kind: "shield",
        amount: effect.charges,
        // Shields do not expire on a timer; `turnsRemaining` carries the cap.
        turnsRemaining: effect.max,
      });
      break;
    }

    // --- per-monster state -------------------------------------------------
    case "addCounter": {
      const monster = ctx.monster(self, source.slot);
      const next = (monster.counters[effect.counter] ?? 0) + effect.n;
      ctx.setCounter(self, source.slot, effect.counter, Math.min(next, effect.max ?? next));
      break;
    }
    case "damagePerCounter": {
      const monster = ctx.monster(self, source.slot);
      const count = monster.counters[effect.counter] ?? 0;
      if (count > 0) ctx.damage(foe, scaleDamage(ctx, source, count * effect.per), self);
      if (effect.reset !== false) ctx.setCounter(self, source.slot, effect.counter, 0);
      break;
    }
    case "toggleFlag": {
      const monster = ctx.monster(self, source.slot);
      const [a, b] = effect.values;
      const next = monster.flags[effect.flag] === a ? b : a;
      ctx.setMonsterFlag(self, source.slot, effect.flag, next);
      break;
    }

    // --- branching ---------------------------------------------------------
    case "branchOnLastMatch": {
      const kind = ctx.player(self).lastMatchKind;
      const branch = kind ? effect.cases[kind as TileKind] : undefined;
      if (branch) runEffects(ctx, branch, source);
      break;
    }
    case "branchOnCounter": {
      const monster = ctx.monster(self, source.slot);
      const count = monster.counters[effect.counter] ?? 0;
      const branch = effect.cases.find((c) => count <= c.upTo) ?? effect.cases[effect.cases.length - 1];
      if (branch) runEffects(ctx, branch.effects, source);
      break;
    }

    default: {
      const exhaustive: never = effect;
      throw new Error(`Unhandled effect: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Applies the acting monster's damage multiplier. Only stance-style monsters
 * set this; everything else runs at 1x.
 */
function scaleDamage(ctx: Ctx, source: EffectSource, amount: number): number {
  const monster = ctx.monster(source.player, source.slot);
  const stance = monster.flags["stance"];
  if (stance === "anger") return amount * 2;
  return amount;
}
