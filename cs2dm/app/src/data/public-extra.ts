import type { PrismaClient } from '@prisma/client';
import { DM_MODES } from '../admin/server-data.js';
import { EVENT_PUBLIC_DAYS, type PublicEvent } from '../events.js';
import { multiplierTenths } from '../settings.js';

/**
 * Четенето за публичните блокове, добавени след етап 1 (събития — CONTRACT §12). Отделно от
 * `prisma-repo.ts`, за да остане всеки файл кратък; PrismaRepo само препраща.
 */
const DAY_MS = 86_400_000;

/** Активните и предстоящите (до 30 дни напред) неотменени събития, по начало. */
export async function loadEvents(db: PrismaClient, now: Date, limit = 6): Promise<PublicEvent[]> {
  const rows = await db.scheduledEvent.findMany({
    where: {
      cancelledAt: null,
      endsAt: { gt: now },
      startsAt: { lt: new Date(now.getTime() + EVENT_PUBLIC_DAYS * DAY_MS) },
    },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    take: limit,
    select: {
      id: true,
      kind: true,
      titleBg: true,
      titleEn: true,
      titleIt: true,
      startsAt: true,
      endsAt: true,
      xpMultiplier: true,
      dmModeId: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    titles: { bg: row.titleBg, en: row.titleEn, it: row.titleIt },
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    xpTenths: multiplierTenths(row.xpMultiplier.toNumber()),
    modeName: DM_MODES.find((mode) => mode.id === row.dmModeId)?.name ?? null,
  }));
}
