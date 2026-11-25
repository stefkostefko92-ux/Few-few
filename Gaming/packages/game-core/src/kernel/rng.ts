/**
 * Deterministic, seeded PRNG (cyrb128 хеш → sfc32 със 128-битово състояние).
 * Pure JS so the exact same stream is produced on the server (authority) and the
 * client (prediction/replay). No platform crypto — see commit.ts for the
 * fairness seed.
 *
 * Преди беше xmur3 → mulberry32: целият seed се свиваше до 32 бита, т.е. поток
 * от няколко хвърляния на зарове позволяваше да се възстанови seed-ът с
 * 2^32 проби и да се предвидят всички следващи. Сега състоянието е 128 бита, а
 * 128-битов seed (generateSeed) не губи ентропия при хеширането.
 * ЗАБЕЛЕЖКА: sfc32 НЕ е криптографски генератор; сигурността идва от тайния
 * 128-битов seed, който не излиза до края на мача.
 *
 * The realtime host constructs ONE SeededRng per match from the match seed (it
 * stays on the server — Match.seed, admin-only — it is NOT revealed to players;
 * kernel/commit.ts is not wired in yet) and threads it through every `reduce` call; replaying the same action sequence
 * against a fresh SeededRng(seed) reproduces identical states (§7.1).
 */

/** cyrb128: низ → четири 32-битови думи (128-битово състояние). */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** sfc32 (Small Fast Counting): 128-битово състояние, период ≥ 2^32 за всеки seed. */
function sfc32(a: number, b: number, c: number, d: number): () => number {
  const step = (): number => {
    const t0 = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t0) | 0;
    return t0 >>> 0;
  };
  for (let i = 0; i < 12; i++) step(); // загрявка: разсейва слабите начални състояния
  return () => step() / 4294967296;
}

export class SeededRng {
  private readonly next01: () => number;

  constructor(seed: string) {
    const [a, b, c, d] = cyrb128(seed);
    this.next01 = sfc32(a, b, c, d);
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
