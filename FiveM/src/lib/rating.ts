/** Чисти сметки около листинга — без Prisma, за да са тестваеми без база. */

/** Средна оценка, закръглена до 0.1. `null`, когато няма ревюта. */
export function averageRating(reviews: ReadonlyArray<{ rating: number }>): number | null {
  if (reviews.length === 0) return null;
  const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
  return Math.round((sum / reviews.length) * 10) / 10;
}

/** Промотиран ли е сървърът в този момент. */
export function isFeatured(server: { featuredUntil: Date | null }, now = new Date()): boolean {
  return server.featuredUntil !== null && server.featuredUntil.getTime() > now.getTime();
}
