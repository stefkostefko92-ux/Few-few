import type { Pagamento, Prisma } from '@prisma/client';
import type { CampiAbbonamento } from '../abbonamenti/regole.js';
import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { periodoDi } from './periodo.js';
import { CAMPI_ABBONAMENTO, daPeriodo, situazioneDi } from './situazione.js';

/**
 * Какво става със завършено в Revolut плащане (#31; условията 2026-11-12, чл. 12.3–12.4) — веднъж: редът на
 * плащането, после на фирмата `FOR UPDATE`, само от „IN_ATTESA“. Периодът е този от офертата, ако абонаментът е
 * какъвто беше при нея; сменен ли е междувременно (MASTER, друго плащане) — смята се наново. Когато не може да се
 * даде честно (фирма без срок, изтрита или спряна; период, който вече не се смята), плащането НЕ дава нищо и чака
 * MASTER („DA_VERIFICARE“: връща парите по чл. 12.9 или го дава на ръка) — нищо платено не изчезва тихо.
 */

export type MotivoVerifica =
  'senzaScadenza' | 'aziendaAssente' | 'aziendaDisattivata' | 'periodo' | 'nonLetto';

export type EsitoApplica =
  | { tipo: 'dato'; pagamento: Pagamento; inizio: Date; fine: Date; ricalcolato: boolean }
  | { tipo: 'prova'; pagamento: Pagamento }
  | { tipo: 'verifica'; pagamento: Pagamento; motivo: MotivoVerifica }
  | null;

type Dato = { inizio: Date; fine: Date; creditoCent: number; creditoDa: string[] };

/** Периодът за даване, дали е смятан наново, или причината да не се даде. */
async function periodoDaDare(
  tx: Prisma.TransactionClient,
  p: Pagamento,
  a: CampiAbbonamento,
  now: Date,
): Promise<{ dato: Dato; ricalcolato: boolean } | { motivo: MotivoVerifica }> {
  const uguale = (x: Date | null | undefined, y: Date | null) =>
    (x?.getTime() ?? null) === (y?.getTime() ?? null);
  const stessa =
    p.inizio !== null &&
    p.fine !== null &&
    uguale(a.abbonamentoFino, p.baseFino) &&
    a.abbonamentoLivello === p.baseLivello &&
    uguale(a.abbonamentoCambioAt, p.baseCambioAt);
  if (stessa)
    return {
      dato: {
        inizio: p.inizio!,
        fine: p.fine!,
        creditoCent: p.creditoCent,
        creditoDa: p.creditoDa,
      },
      ricalcolato: false,
    };
  const { segmenti } = await situazioneDi(tx, p.aziendaId!, now);
  const per = periodoDi(
    a,
    segmenti,
    { livello: p.livello, mesi: p.mesi, prezzoCent: p.imponibileCent },
    now,
  );
  if (!per.ok) return { motivo: per.errore === 'senzaScadenza' ? 'senzaScadenza' : 'periodo' };
  return {
    dato: {
      inizio: per.inizio,
      fine: per.fine,
      creditoCent: per.credito?.valoreCent ?? 0,
      creditoDa: per.credito?.da ?? [],
    },
    ricalcolato: true,
  };
}

async function inVerifica(
  tx: Prisma.TransactionClient,
  p: Pagamento,
  motivo: MotivoVerifica,
  now: Date,
): Promise<EsitoApplica> {
  const pagamento = await tx.pagamento.update({
    where: { id: p.id },
    data: { stato: 'DA_VERIFICARE', verificaMotivo: motivo, completatoAt: now },
  });
  await writeAudit(
    {
      actorId: null,
      action: 'PAGAMENTO_DA_VERIFICARE',
      aziendaId: p.aziendaId,
      targetType: 'pagamento',
      targetId: p.id,
      meta: { totaleCent: p.totaleCent, motivo },
    },
    tx,
  );
  logger.error(
    { evento: 'pagamento.da_verificare', pagamento: p.id, motivo },
    'pagamento pagato senza periodo',
  );
  return { tipo: 'verifica', pagamento, motivo };
}

/** Прилага завършено плащане — веднъж. null: вече е приложено или го няма. */
export function applica(id: string): Promise<EsitoApplica> {
  return prisma.$transaction(async (tx): Promise<EsitoApplica> => {
    await tx.$queryRaw`SELECT id FROM "Pagamento" WHERE id = ${id} FOR UPDATE`;
    const p = await tx.pagamento.findUnique({ where: { id } });
    if (!p || p.stato !== 'IN_ATTESA') return null;
    const now = new Date();
    // Проба в Sandbox на живия сървър: завършва, но период не дава (pagamenti/situazione.ts).
    if (!daPeriodo(p.ambiente)) {
      const pagamento = await tx.pagamento.update({
        where: { id },
        data: {
          stato: 'COMPLETATO',
          completatoAt: now,
          inizio: p.inizio ?? now,
          fine: p.fine ?? now,
        },
      });
      await writeAudit(
        {
          actorId: null,
          action: 'PAGAMENTO_COMPLETATO',
          aziendaId: p.aziendaId,
          targetType: 'pagamento',
          targetId: id,
          meta: { totaleCent: p.totaleCent, sandbox: true },
        },
        tx,
      );
      return { tipo: 'prova', pagamento };
    }
    if (!p.aziendaId) return inVerifica(tx, p, 'aziendaAssente', now);
    await tx.$queryRaw`SELECT id FROM "Azienda" WHERE id = ${p.aziendaId} FOR UPDATE`;
    const a = await tx.azienda.findUnique({
      where: { id: p.aziendaId },
      select: { ...CAMPI_ABBONAMENTO, deactivatedAt: true },
    });
    if (!a) return inVerifica(tx, p, 'aziendaAssente', now);
    if (a.deactivatedAt) return inVerifica(tx, p, 'aziendaDisattivata', now);
    const esito = await periodoDaDare(tx, p, a, now);
    if ('motivo' in esito) return inVerifica(tx, p, esito.motivo, now);
    const { dato, ricalcolato } = esito;
    const inCoda = dato.inizio.getTime() > now.getTime();
    await tx.azienda.update({
      where: { id: p.aziendaId },
      data: inCoda
        ? {
            // Чака края на пробата или на платения план: нивото и краят на пробата — тогава (чл. 12.3).
            abbonamentoFino: dato.fine,
            abbonamentoCambioAt: dato.inizio,
            abbonamentoCambioLivello: p.livello,
          }
        : {
            abbonamentoFino: dato.fine,
            abbonamentoLivello: p.livello,
            abbonamentoProva: false,
            abbonamentoCambioAt: null,
            abbonamentoCambioLivello: null,
          },
    });
    await writeAudit(
      {
        actorId: null,
        action: 'AZIENDA_ABBONAMENTO',
        aziendaId: p.aziendaId,
        targetType: 'azienda',
        targetId: p.aziendaId,
        meta: { origine: 'revolut', livello: p.livello, pagamento: p.id, inCoda, ricalcolato },
      },
      tx,
    );
    const pagamento = await tx.pagamento.update({
      where: { id },
      data: { stato: 'COMPLETATO', completatoAt: now, ...dato },
    });
    await writeAudit(
      {
        actorId: null,
        action: 'PAGAMENTO_COMPLETATO',
        aziendaId: p.aziendaId,
        targetType: 'pagamento',
        targetId: id,
        meta: { totaleCent: p.totaleCent },
      },
      tx,
    );
    return { tipo: 'dato', pagamento, inizio: dato.inizio, fine: dato.fine, ricalcolato };
  });
}
