/**
 * Deterministic random number generation.
 *
 * The generator state lives inside the match state, so a whole match is
 * reproducible from its seed plus its move log. Every draw advances `counter`;
 * nothing in the engine may consume randomness from any other source.
 */

export interface Rng {
  seed: number;
  counter: number;
}

export function createRng(seed: number): Rng {
  return { seed: seed | 0, counter: 0 };
}

/** splitmix32 finaliser — good avalanche, no state beyond the input word. */
function splitmix32(input: number): number {
  let t = (input + 0x9e3779b9) | 0;
  t = t ^ (t >>> 16);
  t = Math.imul(t, 0x21f0aaad);
  t = t ^ (t >>> 15);
  t = Math.imul(t, 0x735a2d97);
  t = t ^ (t >>> 15);
  return (t >>> 0) / 4294967296;
}

export function rngFloat(rng: Rng): [number, Rng] {
  const mixed = (rng.seed ^ Math.imul(rng.counter + 1, 0x9e3779b9)) | 0;
  return [splitmix32(mixed), { seed: rng.seed, counter: rng.counter + 1 }];
}

/**
 * Mutable cursor over an object that owns an `rng` field.
 *
 * Ergonomic wrapper only — it writes the advanced generator straight back, so
 * determinism is preserved exactly as if the pure form were threaded through.
 */
export class RngCursor {
  constructor(private readonly owner: { rng: Rng }) {}

  float(): number {
    const [value, next] = rngFloat(this.owner.rng);
    this.owner.rng = next;
    return value;
  }

  /** Integer in [0, maxExclusive). Returns 0 for a non-positive bound. */
  int(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0;
    return Math.floor(this.float() * maxExclusive);
  }

  pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[this.int(items.length)];
  }

  /** Fisher-Yates on a copy. */
  shuffled<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const a = out[i]!;
      const b = out[j]!;
      out[i] = b;
      out[j] = a;
    }
    return out;
  }

  /** Up to `n` distinct members of `items`, chosen uniformly. */
  sample<T>(items: readonly T[], n: number): T[] {
    if (n >= items.length) return this.shuffled(items);
    return this.shuffled(items).slice(0, Math.max(0, n));
  }

  /** Index into `weights`, proportional to each entry. */
  weighted(weights: readonly number[]): number {
    const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
    if (total <= 0) return 0;
    let roll = this.float() * total;
    for (let i = 0; i < weights.length; i++) {
      roll -= Math.max(0, weights[i]!);
      if (roll <= 0) return i;
    }
    return weights.length - 1;
  }
}
