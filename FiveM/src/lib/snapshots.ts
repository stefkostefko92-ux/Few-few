/**
 * Графиката „играчи през деня“. Данните се трупат от всяко пингване
 * (`ServerSnapshot`) — дотук се пишеха и никой не ги четеше.
 *
 * Модулът е ЧИСТ (нула Prisma), по същата причина като `rating.ts`: иначе
 * тестът за групирането щеше да иска жива база. Четенето е в `servers.ts`.
 */
export type Point = { at: Date; players: number };

export const HOUR_MS = 3_600_000;

/**
 * Свива снимките в кофи по час. Причината не е козметична: пингването е на
 * 3 минути, тоест 24 часа значат ~480 точки за един сървър — това е шум, не
 * информация, и утроява HTML-а. Кофата взема МАКСИМУМА, не средното: пикът е
 * това, което играчът търси („в колко часа е пълно“), а средното го скрива.
 *
 * Кофа без нито една снимка остава 0 — това е „не знаем“, изрисувано като
 * празно. Затова графиката пази и текстов еквивалент: 0 от липса и 0 от
 * празен сървър изглеждат еднакво на картинка.
 */
export function bucketByHour(points: readonly Point[], hours = 24, now = new Date()): number[] {
  const buckets = new Array<number>(hours).fill(0);
  const end = now.getTime();
  const span = hours * HOUR_MS;

  for (const point of points) {
    const age = end - point.at.getTime();
    // Бъдещи (age < 0) и по-стари от прозореца точки не влизат — часовникът на
    // базата и нашият може да се разминат с малко.
    if (age < 0 || age >= span) continue;
    const index = hours - 1 - Math.floor(age / HOUR_MS);
    if (index >= 0 && index < hours) {
      buckets[index] = Math.max(buckets[index], point.players);
    }
  }
  return buckets;
}
