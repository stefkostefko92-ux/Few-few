/**
 * Deterministic, seeded PRNG (xmur3 hash → mulberry32 stream). Pure JS so the
 * exact same stream is produced on the server (authority) and the client
 * (prediction/replay). No platform crypto — see commit.ts for the fairness seed.
 *
 * The realtime host constructs ONE SeededRng per match from the revealed seed
 * and threads it through every `reduce` call; replaying the same action sequence
 * against a fresh SeededRng(seed) reproduces identical states (§7.1).
 */

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SeededRng {
  private readonly next01: () => number;

  constructor(seed: string) {
    this.next01 = mulberry32(xmur3(seed)());
  }

  /** Float in [0, 1). */
  next(): number {
    return this.next01();
  }

  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    return Math.floor(this.next01() * maxExclusive);
  }

  /** A single d6 roll in [1, 6]. */
  die(): number {
    return this.int(6) + 1;
  }

  /** Fisher–Yates shuffle returning a new array (does not mutate input). */
  shuffle<T>(input: readonly T[]): T[] {
    const a = input.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = a[i] as T;
      a[i] = a[j] as T;
      a[j] = tmp;
    }
    return a;
  }
}
