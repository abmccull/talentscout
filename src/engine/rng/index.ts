/**
 * Mulberry32 seeded pseudo-random number generator.
 *
 * Mulberry32 is a fast, high-quality 32-bit PRNG that produces a full period
 * of 2^32 values before cycling. It is deterministic given the same seed,
 * making it ideal for reproducible game worlds.
 *
 * Usage:
 *   const rng = createRNG("my-world-seed");
 *   rng.next();           // 0.412...
 *   rng.nextInt(1, 20);   // 13
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert an arbitrary string to a 32-bit unsigned integer seed via djb2-style
 * hashing, so that even small string differences produce very different seeds.
 */
function hashString(str: string): number {
  let h = 0x12345678; // non-zero start avoids all-zero degenerate state
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x9e3779b9);
    h ^= h >>> 16;
  }
  // Force to unsigned 32-bit integer
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// RNG class
// ---------------------------------------------------------------------------

export class RNG {
  private state: number;

  constructor(seed: string) {
    this.state = hashString(seed);
    // Warm up: the very first output of Mulberry32 can be weakly correlated
    // with the seed when the seed is small.
    this.next();
    this.next();
  }

  /**
   * Advance the PRNG state and return a float in [0, 1).
   * Core Mulberry32 algorithm — constant time, extremely fast.
   */
  next(): number {
    // Increment state (wraps at 2^32 naturally via >>> 0)
    this.state = (this.state + 0x6d2b79f5) >>> 0;

    let z = this.state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    z = (z ^ (z >>> 14)) >>> 0;

    // Divide by 2^32 to get [0, 1)
    return z / 4294967296;
  }

  /**
   * Return a uniformly distributed integer in [min, max] (both inclusive).
   */
  nextInt(min: number, max: number): number {
    if (min > max) {
      throw new RangeError(`nextInt: min (${min}) must be <= max (${max})`);
    }
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Return a uniformly distributed float in [min, max).
   */
  nextFloat(min: number, max: number): number {
    if (min > max) {
      throw new RangeError(`nextFloat: min (${min}) must be <= max (${max})`);
    }
    return this.next() * (max - min) + min;
  }

  /**
   * Return a random element from a non-empty array (uniform distribution).
   */
  pick<T>(array: readonly T[]): T {
    if (array.length === 0) {
      throw new RangeError("pick: array must not be empty");
    }
    return array[this.nextInt(0, array.length - 1)];
  }

  /**
   * Return a random element selected proportionally to its weight.
   * All weights must be non-negative; at least one must be positive.
   */
  pickWeighted<T>(items: ReadonlyArray<{ item: T; weight: number }>): T {
    if (items.length === 0) {
      throw new RangeError("pickWeighted: items must not be empty");
    }

    const totalWeight = items.reduce((sum, entry) => {
      if (entry.weight < 0) {
        throw new RangeError(
          `pickWeighted: weight must be non-negative, got ${entry.weight}`,
        );
      }
      return sum + entry.weight;
    }, 0);

    if (totalWeight <= 0) {
      throw new RangeError("pickWeighted: total weight must be positive");
    }

    let threshold = this.next() * totalWeight;
    for (const entry of items) {
      threshold -= entry.weight;
      if (threshold <= 0) {
        return entry.item;
      }
    }

    // Floating-point rounding edge case: fall through to last item
    return items[items.length - 1].item;
  }

  /**
   * Return a new array that is a Fisher-Yates shuffle of the input.
   * The original array is NOT mutated.
   */
  shuffle<T>(array: readonly T[]): T[] {
    const result = array.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const temp = result[i];
      result[i] = result[j];
      result[j] = temp;
    }
    return result;
  }

  /**
   * Sample from a normal (Gaussian) distribution using the Box-Muller
   * transform. Consumes two uniform samples per call.
   */
  gaussian(mean: number, stddev: number): number {
    // Box-Muller: two uniform [0,1) samples → one standard-normal sample
    const u1 = Math.max(this.next(), 1e-10); // guard against log(0)
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + stddev * z;
  }

  /**
   * Return true with the given probability in [0, 1].
   */
  chance(probability: number): boolean {
    if (probability < 0 || probability > 1) {
      throw new RangeError(
        `chance: probability must be in [0, 1], got ${probability}`,
      );
    }
    return this.next() < probability;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a new seeded RNG instance from a string seed. */
export function createRNG(seed: string): RNG {
  return new RNG(seed);
}
