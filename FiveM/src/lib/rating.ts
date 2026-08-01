/** Чисти сметки около листинга — без Prisma, за да са тестваеми без база. */

/** Средна оценка, закръглена до 0.1. `null`, когато няма ревюта. */
export function averageRating(reviews: ReadonlyArray<{ rating: number }>): number | null {
  if (reviews.length === 0) return null;
  const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
  return Math.round((sum / reviews.length) * 10) / 10;
}

/**
 * Подредбата на публичния списък. Живее ТУК, а не само в `orderBy`, защото
 * SQL-ът не може да изрази „промотиран, но само докато не е изтекло“:
 * `featuredUntil DESC` вдига и изтеклите. Резултатът беше сървър с изтекла
 * промоция, който държи първо място БЕЗ значка „промотиран (платено)“ — тоест
 * платен ранг, който не е обявен, точно обратното на условията.
 */
export function compareServers<T extends { featuredUntil: Date | null; online: boolean; players: number; name: string }>(
  a: T,
  b: T,
  now = new Date(),
): number {
  const fa = isFeatured(a, now) ? 1 : 0;
  const fb = isFeatured(b, now) ? 1 : 0;
  if (fa !== fb) return fb - fa;
  if (a.online !== b.online) return a.online ? -1 : 1;
  if (a.players !== b.players) return b.players - a.players;
  return a.name.localeCompare(b.name, 'bg');
}

/**
 * Само промотирането. Изнесено отделно, защото всяка подредба, която
 * посетителят избере, трябва да го уважи — платеното място е обявено в
 * условията и не бива да изчезва при натискане на „по име“.
 */
export function compareFeatured<T extends { featuredUntil: Date | null }>(
  a: T,
  b: T,
  now = new Date(),
): number {
  return (isFeatured(b, now) ? 1 : 0) - (isFeatured(a, now) ? 1 : 0);
}

/** Промотиран ли е сървърът в този момент. */
export function isFeatured(server: { featuredUntil: Date | null }, now = new Date()): boolean {
  return server.featuredUntil !== null && server.featuredUntil.getTime() > now.getTime();
}
