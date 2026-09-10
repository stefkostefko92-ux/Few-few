import type { BrandAsset, BrandPlan } from './plan.js';

/**
 * Чиста логика на автопилота — без база и без мрежа, за да се тества до последния ъгъл.
 */

/** Колко чернови липсват за седмицата: план минус живите (чернова/одобрен/насрочен) за 7 дни. */
export function draftsNeeded(plan: Pick<BrandPlan, 'postsPerWeek'>, alive: number): number {
  return Math.max(0, plan.postsPerWeek - alive);
}

/** Смесица снимки/Reels по дял, но само от вида, за който има материали. */
export function kindMix(
  count: number,
  reelsShare: number,
  available: { image: number; reels: number },
): Array<'IMAGE' | 'REELS'> {
  const out: Array<'IMAGE' | 'REELS'> = [];
  let reelsTarget = Math.round(count * reelsShare);
  reelsTarget = Math.min(reelsTarget, available.reels);
  let imageTarget = Math.min(count - reelsTarget, available.image);
  // Ако единият вид не стига, допълни с другия докъдето има материал.
  reelsTarget = Math.min(count - imageTarget, available.reels);
  imageTarget = Math.min(count - reelsTarget, available.image);
  for (let i = 0; i < reelsTarget; i += 1) out.push('REELS');
  for (let i = 0; i < imageTarget; i += 1) out.push('IMAGE');
  return out;
}

/** Материалите се редуват: най-отдавна (или никога) ползваният е пръв. */
export function pickAssets(
  assets: readonly BrandAsset[],
  lastUsedAt: ReadonlyMap<string, Date>,
  kinds: ReadonlyArray<'IMAGE' | 'REELS'>,
): BrandAsset[] {
  const byAge = (a: BrandAsset, b: BrandAsset): number =>
    (lastUsedAt.get(a.url)?.getTime() ?? 0) - (lastUsedAt.get(b.url)?.getTime() ?? 0);
  const pools = {
    IMAGE: assets.filter((asset) => asset.kind === 'IMAGE').sort(byAge),
    REELS: assets.filter((asset) => asset.kind === 'REELS').sort(byAge),
  };
  const picked: BrandAsset[] = [];
  for (const kind of kinds) {
    const next = pools[kind].shift();
    if (next) picked.push(next);
  }
  return picked;
}

/** Стълбовете се редуват от там, докъдето е стигнато — не винаги от първия. */
export function nextPillars(pillars: readonly string[], offset: number, count: number): string[] {
  if (!pillars.length) return [];
  return Array.from({ length: count }, (_, i) => pillars[(offset + i) % pillars.length]!);
}

/**
 * Следващите `count` свободни слота по предпочитаните часове (локално време на сървъра),
 * започвайки от следващия ден. Заетите слотове (вече насрочени постове) се прескачат.
 */
export function nextSlots(
  postingTimes: readonly string[],
  count: number,
  from: Date,
  taken: ReadonlySet<number> = new Set(),
): Date[] {
  const times = [...postingTimes]
    .map((time) => time.split(':').map(Number) as [number, number])
    .sort((a, b) => a[0] * 60 + a[1] - (b[0] * 60 + b[1]));
  const slots: Date[] = [];
  const day = new Date(from);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() + 1);
  for (let guard = 0; slots.length < count && guard < 60; guard += 1) {
    for (const [hour, minute] of times) {
      const slot = new Date(day);
      slot.setHours(hour, minute, 0, 0);
      if (slot.getTime() > from.getTime() && !taken.has(slot.getTime())) slots.push(slot);
      if (slots.length >= count) break;
    }
    day.setDate(day.getDate() + 1);
  }
  return slots;
}
