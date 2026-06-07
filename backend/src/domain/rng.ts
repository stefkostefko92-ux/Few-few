import { randomInt as cryptoRandomInt, randomBytes } from "node:crypto";

/**
 * Cryptographically secure RNG primitives.
 *
 * GDD §5.1 / §11.3: the spin/raid/gacha outcome is decided server-side with a
 * CSPRNG — "crypto.randomInt, NOT Math.random". The interface is injectable so
 * tests can supply a deterministic stream and assert exact outcomes, while
 * production always gets the crypto-backed implementation.
 */
export interface Rng {
  /** Uniform integer in [min, max). */
  intBetween(min: number, max: number): number;
  /** Uniform float in [0, 1). */
  random(): number;
}

export const cryptoRng: Rng = {
  intBetween(min: number, max: number): number {
    if (max <= min) throw new Error(`invalid range [${min}, ${max})`);
    return cryptoRandomInt(min, max);
  },
  random(): number {
    // 53 bits of entropy mapped to [0, 1) — avoids Math.random entirely.
    const buf = randomBytes(8);
    // Clear the exponent so we read 52 mantissa bits uniformly.
    const hi = buf.readUInt32BE(0) & 0x1fffff; // 21 bits
    const lo = buf.readUInt32BE(4); // 32 bits
    return (hi * 2 ** 32 + lo) / 2 ** 53;
  },
};

/**
 * Pick one key from a weighted map using the given RNG.
 * Weights are positive integers; total need not be 100.
 */
export function pickByWeight<K extends string>(weights: Record<K, number>, rng: Rng): K {
  const keys = Object.keys(weights) as K[];
  let total = 0;
  for (const k of keys) total += weights[k];
  if (total <= 0) throw new Error("weights must sum to a positive value");

  let roll = rng.intBetween(0, total);
  for (const k of keys) {
    roll -= weights[k];
    if (roll < 0) return k;
  }
  // Unreachable when total is computed correctly; satisfies the type checker.
  return keys[keys.length - 1];
}
