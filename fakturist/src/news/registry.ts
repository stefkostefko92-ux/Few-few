import { prisma } from '../db.js';
import { NEWS, toRegister } from './entries.js';

/**
 * Кога е излязла всяка новина (таблицата `NewsEntry`). При първата нужда процесът записва новините, които
 * още нямат ред (`toRegister` — на нова инсталация в деня им, иначе сега: това е обновяването), и пази
 * картата в паметта: редовете се сменят само тук. Провал не се помни — следващата страница опитва пак.
 */
let published: Promise<ReadonlyMap<string, Date>> | null = null;

async function load(): Promise<ReadonlyMap<string, Date>> {
  const rows = await prisma.newsEntry.findMany();
  const fresh = toRegister(new Set(rows.map((r) => r.id)), new Date(), NEWS);
  if (fresh.length === 0) return new Map(rows.map((r) => [r.id, r.publishedAt]));
  // Два процеса едновременно: вторият не пише нищо, а чете записаното от първия.
  await prisma.newsEntry.createMany({ data: fresh, skipDuplicates: true });
  const all = await prisma.newsEntry.findMany();
  return new Map(all.map((r) => [r.id, r.publishedAt]));
}

export function publishedNews(): Promise<ReadonlyMap<string, Date>> {
  published ??= load().catch((error: unknown) => {
    published = null;
    throw error;
  });
  return published;
}

/** Само за тестовете: следващото четене минава през базата. */
export function forgetPublishedNews(): void {
  published = null;
}

/** „Разбрах“: новините до този момент са прочетени (без да пипа `updatedAt` на профила). */
export async function markNewsRead(userId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "User" SET "newsReadAt" = (now() AT TIME ZONE 'UTC') WHERE id = ${userId}`;
}
