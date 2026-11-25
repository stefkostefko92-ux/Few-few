// Без server-only: чисто (транзакцията идва отвън) — тества се срещу реален Postgres.
import type { Prisma } from '@prisma/client';

/**
 * Заключва реда на профила (FOR UPDATE) и брои блоковете или кратките му линкове — в
 * транзакцията на викащия. Таваните (MAX_BLOCKS_PER_PROFILE, MAX_SHORT_LINKS_PER_PROFILE)
 * се проверяват и записват под това заключване: паралелни заявки чакат реда и виждат
 * новия брой (Разбивача Н3: без него 235/200 блока и 128/100 кратки линка).
 */
export async function lockedCount(
  tx: Prisma.TransactionClient,
  profileId: string,
  what: 'links' | 'shortLinks',
): Promise<number> {
  await tx.$queryRaw`SELECT id FROM "Profile" WHERE id = ${profileId} FOR UPDATE`;
  return what === 'links'
    ? tx.link.count({ where: { profileId } })
    : tx.shortLink.count({ where: { profileId } });
}
