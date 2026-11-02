import { prisma } from '../db.js';
import { writeAudit } from '../audit.js';
import type { SessionUser } from '../types.js';

/**
 * Функциите по избор на фирмата — включва ги само MASTER (страницата на фирмата, маршрутът проверява
 * `aziende:manage`). Засега една: скицникът в края на картата (src/schizzi/).
 */

/** Скицникът за фирмата, с одита; false — фирмата я няма. */
export async function setSchizzi(
  actor: SessionUser,
  aziendaId: string,
  attivi: boolean,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.azienda.findUnique({
      where: { id: aziendaId },
      select: { schizzi: true },
    });
    if (!current) return false;
    if (current.schizzi === attivi) return true;
    await tx.azienda.update({ where: { id: aziendaId }, data: { schizzi: attivi } });
    await writeAudit(
      {
        actorId: actor.id,
        action: attivi ? 'AZIENDA_SCHIZZI_ON' : 'AZIENDA_SCHIZZI_OFF',
        aziendaId,
        targetType: 'azienda',
        targetId: aziendaId,
      },
      tx,
    );
    return true;
  });
}

/** Кои от фирмите имат скицника — за нова карта решава избраната фирма. */
export async function aziendeConSchizzi(ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await prisma.azienda.findMany({
    where: { id: { in: [...ids] }, schizzi: true },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}
