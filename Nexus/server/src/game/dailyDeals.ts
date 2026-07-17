import type Database from 'better-sqlite3';

/**
 * Дневни оферти в NPC магазина — „почти автоматично": ротацията е чисто
 * ДЕТЕРМИНИСТИЧНА функция на деня (UTC), без cron, без админ, без състояние
 * в БД. Всички играчи виждат едни и същи оферти (честно и социално — хората
 * си ги споделят в чата), а на следващия ден изборът се сменя сам.
 *
 * Баланс: −30% само върху злато-предмети от магазина (без маунтове/гемове);
 * сървърът е авторитетен — /buy сам прилага отстъпката, клиентът само я вижда.
 */

export const DEAL_COUNT = 4;
export const DEAL_DISCOUNT = 0.30; // −30%

/** Малък детерминистичен PRNG (mulberry32) — сеедва се с деня. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DailyDeal {
  item_id: number;
  deal_price: number;   // buy_price след отстъпката (закръглено надолу, мин 1)
}

/** Днешният dayIndex (UTC). */
export function currentDayIndex(now = Date.now()): number {
  return Math.floor(now / 86_400_000);
}

/** Кога изтичат днешните оферти (началото на следващия UTC ден, ms). */
export function dealsExpireAt(now = Date.now()): number {
  return (currentDayIndex(now) + 1) * 86_400_000;
}

/**
 * Офертите за даден ден. Пулът е стабилен (подредени по id предмети с
 * buy_price>0, без 'misc' — маунтове/козметика не се дисконтират), затова
 * същият dayIndex винаги дава същите оферти на всяка инстанция.
 */
export function dealsForDay(db: Database.Database, dayIndex: number): DailyDeal[] {
  const pool = db.prepare(
    "SELECT id, buy_price FROM items WHERE buy_price > 0 AND category != 'misc' ORDER BY id",
  ).all() as { id: number; buy_price: number }[];
  if (pool.length === 0) return [];
  const rng = mulberry32(dayIndex * 2654435761);
  const picked = new Set<number>();
  const deals: DailyDeal[] = [];
  let guard = 0;
  while (deals.length < Math.min(DEAL_COUNT, pool.length) && guard++ < 200) {
    const idx = Math.floor(rng() * pool.length);
    if (picked.has(idx)) continue;
    picked.add(idx);
    const it = pool[idx];
    deals.push({ item_id: it.id, deal_price: Math.max(1, Math.floor(it.buy_price * (1 - DEAL_DISCOUNT))) });
  }
  return deals;
}

/** Днешната оферта за конкретен предмет (или undefined). */
export function dealFor(db: Database.Database, itemId: number, now = Date.now()): DailyDeal | undefined {
  return dealsForDay(db, currentDayIndex(now)).find((d) => d.item_id === itemId);
}
