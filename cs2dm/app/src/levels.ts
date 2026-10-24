/**
 * XP и нива — договорът е cs2dm/CONTRACT.md §3; C# плъгинът ползва същите константи.
 *
 * Нужно XP за ниво n: `100 · n · (n − 1) / 2` → `level = floor((1 + sqrt(1 + 8 · xp / 100)) / 2)`.
 * XP в базата е BIGINT, затова сметката е в bigint: плаващата запетая дава приближение, а
 * целочислената поправка го закрепва точно на границата (99 → 1, 100 → 2).
 */
export const XP_STEP = 100n;

/** XP наградите за едно убийство (CONTRACT.md §3) — за таблицата „Как се смята“. */
export const XP_REWARDS = [
  { id: 'kill', xp: 10 },
  { id: 'headshot', xp: 5 },
  { id: 'knife', xp: 20 },
  { id: 'noscope', xp: 10 },
  { id: 'wallbang', xp: 5 },
  { id: 'smoke', xp: 5 },
  { id: 'revenge', xp: 5 },
] as const;

/**
 * Множител на XP (живата настройка `xp` или активно събитие — по-големият от двата, CONTRACT §3):
 * `floor(xp · m10 / 10)`, където m10 е множителят в десети (10…30). Цели числа — без float,
 * за да съвпада с `Progression.ApplyMultiplier` в C#. Тестови стойности: 15×15→22 · 10×30→30 · 7×10→7.
 */
export function applyXpMultiplier(xp: number, tenths: number): number {
  const m10 = Math.min(30, Math.max(10, Math.trunc(tenths)));
  return Math.floor((Math.max(0, Math.trunc(xp)) * m10) / 10);
}

/** Баунти: серия ≥ 5 → `min(25 · (серия − 4), 250)` XP. */
export const BOUNTY = { minStreak: 5, perKill: 25, cap: 250 } as const;

export function bountyFor(streak: number): number {
  if (streak < BOUNTY.minStreak) return 0;
  return Math.min(BOUNTY.perKill * (streak - 4), BOUNTY.cap);
}

function toBig(xp: bigint | number): bigint {
  if (typeof xp === 'bigint') return xp < 0n ? 0n : xp;
  if (!Number.isFinite(xp) || xp <= 0) return 0n;
  return BigInt(Math.floor(xp));
}

/** Общото XP, при което започва ниво n (ниво 1 започва от 0). */
export function xpForLevel(level: number): bigint {
  if (level <= 1) return 0n;
  const n = BigInt(Math.floor(level));
  return (XP_STEP * n * (n - 1n)) / 2n;
}

export function levelForXp(xpInput: bigint | number): number {
  const xp = toBig(xpInput);
  const estimate = Math.floor((1 + Math.sqrt(1 + (8 * Number(xp)) / Number(XP_STEP))) / 2);
  let level = Math.max(1, estimate);
  while (level > 1 && xpForLevel(level) > xp) level -= 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  return level;
}

export interface LevelProgress {
  level: number;
  /** XP, натрупано вътре в текущото ниво. */
  current: bigint;
  /** Колко XP е широко текущото ниво (от началото му до следващото). */
  span: bigint;
  /** Цял процент 0–99 — за `<progress>`; никога 100 преди самото качване на ниво. */
  percent: number;
  nextLevel: number;
}

export function levelProgress(xpInput: bigint | number): LevelProgress {
  const xp = toBig(xpInput);
  const level = levelForXp(xp);
  const start = xpForLevel(level);
  const span = xpForLevel(level + 1) - start;
  const current = xp - start;
  const percent = Number((current * 100n) / span);
  return { level, current, span, percent, nextLevel: level + 1 };
}
