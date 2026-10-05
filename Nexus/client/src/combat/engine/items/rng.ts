// Детерминиран RNG по slug — един и същи предмет изглежда еднакво при всяко изпичане/зареждане.
// mulberry32, seed-нат от FNV-1a хеш на низа (стабилен между сесии/платформи).

export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type Rand = () => number;

export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RNG, стабилен по slug + сол (напр. по слот, за да не корелират твърде много решения). */
export function rngFor(slug: string, salt = ''): Rand {
  return mulberry32(hashString(`${slug}::${salt}`));
}

export function pick<T>(rand: Rand, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length) % arr.length];
}

export function range(rand: Rand, min: number, max: number): number {
  return min + rand() * (max - min);
}
