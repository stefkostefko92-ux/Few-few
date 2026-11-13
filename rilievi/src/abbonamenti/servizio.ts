import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import { giornoValido, mezzanotteRoma } from '../master/tempo.js';
import { businessDay, DAY } from '../time.js';
import { isProduction } from '../config.js';
import type { Prisma } from '@prisma/client';
import { isLivello, MESI_PROVA, scadenzaDopoMesi, type Livello } from './regole.js';

/**
 * Абонаментът, зададен на ръка от MASTER на страницата на фирмата (#31 — „за плащания, получени извън Revolut“):
 * нивото и последният ден (включен — краят е полунощта след него); празен ден — без срок. Пробният месец спира.
 * Одит: нивото и денят, без суми.
 */
export interface AbbonamentoManuale {
  livello: Livello | null;
  /** `YYYY-MM-DD` — последният ден, или null — без срок. */
  ultimoGiorno: string | null;
}

export function leggiAbbonamentoManuale(body: Record<string, unknown>): AbbonamentoManuale | null {
  const l = typeof body.livello === 'string' ? body.livello.trim() : '';
  const livello = l === '' ? null : Number(l);
  if (livello !== null && !isLivello(livello)) return null;
  const g = typeof body.fino === 'string' ? body.fino.trim() : '';
  if (g !== '' && (!giornoValido(g) || g < '2020-01-01' || g > '2100-12-31')) return null;
  return { livello, ultimoGiorno: g === '' ? null : g };
}

/** Ден за `<input type="date">` от края (полунощ): последният ден по Рим. */
export const ultimoGiornoDi = (fino: Date | null): string =>
  fino ? businessDay(new Date(fino.getTime() - 1)) : '';

/** Чл. 12.8: на клиент „без срок“ срок се слага с поне 30 дни предизвестие. */
export const GIORNI_PREAVVISO_SCADENZA = 30;

/**
 * `base` — краят, който MASTER е видял (ISO или празно); друг сега (плащане междувременно) — 'cambiato'. Две
 * неща искат изрично потвърждение (`confermo`): има платен през Revolut период, който ръчното задаване сменя
 * ('pagato' — платеното не изчезва тихо, чл. 12.3 и 12.9), и срок под 30 дни на фирма „без срок“ ('preavviso',
 * чл. 12.8).
 */
export async function impostaAbbonamento(
  actorId: string,
  aziendaId: string,
  v: AbbonamentoManuale,
  base: string,
  confermo = false,
): Promise<'ok' | 'assente' | 'cambiato' | 'pagato' | 'preavviso'> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Azienda" WHERE id = ${aziendaId} FOR UPDATE`;
    const a = await tx.azienda.findUnique({
      where: { id: aziendaId },
      select: { abbonamentoFino: true },
    });
    if (!a) return 'assente';
    if ((a.abbonamentoFino?.toISOString() ?? '') !== base) return 'cambiato';
    if (!confermo) {
      const now = new Date();
      const nuovo = v.ultimoGiorno ? mezzanotteRoma(v.ultimoGiorno, 1) : null;
      if (
        a.abbonamentoFino === null &&
        nuovo !== null &&
        nuovo.getTime() < now.getTime() + GIORNI_PREAVVISO_SCADENZA * DAY
      )
        return 'preavviso';
      const pagato = await tx.pagamento.count({
        where: {
          aziendaId,
          stato: 'COMPLETATO',
          fine: { gt: now },
          ...(isProduction() ? { ambiente: 'PRODUZIONE' as const } : {}),
        },
      });
      if (pagato > 0) return 'pagato';
    }
    await tx.azienda.update({
      where: { id: aziendaId },
      data: {
        abbonamentoLivello: v.livello,
        abbonamentoFino: v.ultimoGiorno ? mezzanotteRoma(v.ultimoGiorno, 1) : null,
        abbonamentoProva: false,
        // Ръчното задаване решава всичко: и планът в опашка отпада (MASTER го е видял на страницата).
        abbonamentoCambioAt: null,
        abbonamentoCambioLivello: null,
      },
    });
    await writeAudit(
      {
        actorId,
        action: 'AZIENDA_ABBONAMENTO',
        aziendaId,
        targetType: 'azienda',
        targetId: aziendaId,
        meta: { origine: 'manuale', livello: v.livello, ultimoGiorno: v.ultimoGiorno },
      },
      tx,
    );
    return 'ok';
  });
}

/**
 * Поддръжката: плановете в опашка, чийто ден е дошъл, стават сегашни (нивото, краят на пробата). Състоянието ги
 * смята и без това (`abbonamentoAdesso`) — тук само се подреждат колоните.
 */
export async function avviaPianiInCoda(now: Date = new Date()): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "Azienda"
    SET "abbonamentoLivello" = "abbonamentoCambioLivello",
        "abbonamentoProva" = false,
        "abbonamentoCambioAt" = NULL,
        "abbonamentoCambioLivello" = NULL
    WHERE "abbonamentoCambioAt" IS NOT NULL AND "abbonamentoCambioAt" <= ${now}`;
}

/**
 * Пробният месец тече от сключването на договора (чл. 12.2 на условията 2026-11-12, чл. 3.1 — приемането с
 * кода от администратора): при първото приемане на условията за фирмата краят му се смята от този момент.
 * Фирма без пробен период (досегашните, зададените на ръка) не се пипа.
 */
export async function avviaProva(
  tx: Prisma.TransactionClient,
  aziendaId: string,
  at: Date,
): Promise<void> {
  await tx.azienda.updateMany({
    where: { id: aziendaId, abbonamentoProva: true },
    data: { abbonamentoFino: scadenzaDopoMesi(null, MESI_PROVA, at) },
  });
}
