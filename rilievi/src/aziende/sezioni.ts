import { writeAudit } from '../audit.js';
import { scopeFor } from '../auth/scope.js';
import { prisma } from '../db.js';
import type { SectionKey } from '../schede/fields.js';
import { ORDINABILI } from '../schede/ordine.js';
import type { SessionUser } from '../types.js';
import { isAziendaId } from './service.js';

/**
 * Редът на разделите на картата във фирмата (`Azienda.ordineSezioni`) — подрежда го администраторът ѝ
 * (`aziende:settings`), важи за формата, страницата, печата и PDF-а. Самото подреждане (без база) е в
 * src/schede/ordine.ts.
 */

/** Записаният ред на фирмата — за нова карта (при редакция идва с картата); без фирма — празно. */
export async function ordineSezioniDi(aziendaId: string | null): Promise<string[]> {
  if (!isAziendaId(aziendaId)) return [];
  const row = await prisma.azienda.findUnique({
    where: { id: aziendaId },
    select: { ordineSezioni: true },
  });
  return row?.ordineSezioni ?? [];
}

/** Фирмите, чиито настройки човекът може да пипа — активните в обхвата му (MASTER — всички активни). */
export function aziendeImpostabili(user: SessionUser) {
  const scope = scopeFor(user, 'aziende:settings');
  return prisma.azienda.findMany({
    where: { deactivatedAt: null, ...(scope.all ? {} : { id: { in: [...scope.aziendaIds] } }) },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      ordineSezioni: true,
      datiSocietari: true,
      cartelloModello: true,
      logoType: true,
      nomiRuoli: true,
      permessiRuoli: true,
    },
  });
}

/**
 * Записва реда с одита му; редът по подразбиране се пази като празен (нов раздел в бъдеще застава на
 * мястото си). `null` — обратно към реда по подразбиране. false — фирмата я няма.
 */
export async function setOrdineSezioni(
  actor: SessionUser,
  aziendaId: string,
  ordine: readonly SectionKey[] | null,
): Promise<boolean> {
  const predefinito = ordine === null || ordine.every((key, i) => key === ORDINABILI[i]);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.azienda.updateMany({
      where: { id: aziendaId },
      data: { ordineSezioni: predefinito ? [] : [...ordine] },
    });
    if (updated.count === 0) return false;
    await writeAudit(
      {
        actorId: actor.id,
        action: 'AZIENDA_SEZIONI',
        aziendaId,
        targetType: 'azienda',
        targetId: aziendaId,
        meta: { predefinito },
      },
      tx,
    );
    return true;
  });
}
