import { z } from 'zod';
import type { Pagamento, Prisma, StatoPagamento } from '@prisma/client';
import { scadenzaDopoMesi, type CampiAbbonamento } from '../abbonamenti/regole.js';
import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import { errorMessage, logger } from '../logger.js';
import { sendMail } from '../mail/mailer.js';
import { pagamentoRicevutoMail } from '../mail/templates-abbonamento.js';
import { clientePer, leggiConfig } from './config.js';
import { firmaValida } from './firma.js';
import { periodoDi } from './periodo.js';
import { ErroreRevolut, leggiOrdine } from './revolut.js';
import { CAMPI_ABBONAMENTO, daPeriodo, situazioneDi } from './situazione.js';

/**
 * Сверката на плащанията с Revolut (#31): кое е вярно решава поръчката, прочетена обратно от Revolut (не
 * известието и не връщането на човека). Завършена със същата сума и валута → периодът — веднъж (редовете на
 * плащането и на фирмата `FOR UPDATE`, условно „IN_ATTESA“); неуспешна/отказана — отбелязва се. Webhook-ът
 * само с валиден подпис; поддръжката сверява висящите и отбелязва изтеклите.
 */

export async function segnaFallito(
  id: string,
  stato: 'FALLITO' | 'ANNULLATO' | 'SCADUTO',
  actorId: string | null,
): Promise<void> {
  const p = await prisma.pagamento.findUnique({ where: { id }, select: { aziendaId: true } });
  const { count } = await prisma.pagamento.updateMany({
    where: { id, stato: 'IN_ATTESA' },
    data: { stato },
  });
  if (count === 1) {
    await writeAudit({
      actorId,
      action: 'PAGAMENTO_FALLITO',
      aziendaId: p?.aziendaId ?? null,
      targetType: 'pagamento',
      targetId: id,
      meta: { stato },
    });
  }
}

/**
 * Периодът на завършено плащане: този от офертата, ако абонаментът е какъвто беше при нея; иначе (MASTER го е
 * сменил, друго плащане е минало) — смятан наново сега. Започва ли по-късно — в опашка (нивото и краят на
 * пробата — тогава, чл. 12.3); иначе — веднага.
 */
async function periodoDaDare(
  tx: Prisma.TransactionClient,
  p: Pagamento,
  a: CampiAbbonamento,
  now: Date,
): Promise<{ inizio: Date; fine: Date; creditoCent: number } | null> {
  const stessa =
    p.inizio !== null &&
    p.fine !== null &&
    (a.abbonamentoFino?.getTime() ?? null) === (p.baseFino?.getTime() ?? null) &&
    a.abbonamentoLivello === p.baseLivello &&
    !a.abbonamentoCambioAt;
  if (stessa) return { inizio: p.inizio!, fine: p.fine!, creditoCent: p.creditoCent };
  const { segmenti } = await situazioneDi(tx, p.aziendaId!, now);
  const per = periodoDi(
    a,
    segmenti,
    { livello: p.livello, mesi: p.mesi, prezzoCent: p.imponibileCent },
    now,
  );
  if (per.ok)
    return { inizio: per.inizio, fine: per.fine, creditoCent: per.credito?.valoreCent ?? 0 };
  // MASTER е махнал срока междувременно: фирмата е без срок — не ѝ се слага такъв; MASTER връща парите (12.9).
  if (per.errore === 'senzaScadenza') {
    logger.warn({ pagamento: p.id }, 'pagamento: azienda senza scadenza, periodo non applicato');
    return null;
  }
  // Платено, но вече не се смята (план в опашка, ръчен период): месеците се добавят в края — нищо не се губи.
  const fino = a.abbonamentoFino && a.abbonamentoFino > now ? a.abbonamentoFino : now;
  logger.warn({ pagamento: p.id, motivo: per.errore }, 'pagamento: periodo aggiunto alla fine');
  return { inizio: fino, fine: scadenzaDopoMesi(a.abbonamentoFino, p.mesi, now), creditoCent: 0 };
}

/** Дава периода на завършено плащане — веднъж. Връща края или null (вече дадено / няма го). */
async function applica(id: string): Promise<Date | null> {
  const fatto = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Pagamento" WHERE id = ${id} FOR UPDATE`;
    const p = await tx.pagamento.findUnique({ where: { id } });
    if (!p || p.stato !== 'IN_ATTESA') return null;
    const now = new Date();
    let periodo = { inizio: p.inizio ?? now, fine: p.fine ?? now, creditoCent: p.creditoCent };
    // Проба в Sandbox на живия сървър: завършва, но период не дава (pagamenti/situazione.ts).
    const vero = daPeriodo(p.ambiente);
    if (p.aziendaId && vero) {
      await tx.$queryRaw`SELECT id FROM "Azienda" WHERE id = ${p.aziendaId} FOR UPDATE`;
      const a = await tx.azienda.findUniqueOrThrow({
        where: { id: p.aziendaId },
        select: CAMPI_ABBONAMENTO,
      });
      const dato = await periodoDaDare(tx, p, a, now);
      if (dato) periodo = dato;
      const inCoda = periodo.inizio.getTime() > now.getTime();
      if (dato)
        await tx.azienda.update({
          where: { id: p.aziendaId },
          data: inCoda
            ? {
                abbonamentoFino: periodo.fine,
                // Вече има план в опашка (рядко: две плащания едновременно) — той остава, месеците са в края.
                ...(a.abbonamentoCambioAt
                  ? {}
                  : { abbonamentoCambioAt: periodo.inizio, abbonamentoCambioLivello: p.livello }),
              }
            : {
                abbonamentoFino: periodo.fine,
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
          meta: { origine: 'revolut', livello: p.livello, pagamento: p.id, inCoda },
        },
        tx,
      );
    }
    await tx.pagamento.update({
      where: { id },
      data: { stato: 'COMPLETATO', completatoAt: now, ...periodo },
    });
    await writeAudit(
      {
        actorId: null,
        action: 'PAGAMENTO_COMPLETATO',
        aziendaId: p.aziendaId,
        targetType: 'pagamento',
        targetId: id,
        meta: { totaleCent: p.totaleCent, ...(vero ? {} : { sandbox: true }) },
      },
      tx,
    );
    return vero ? { p, fine: periodo.fine } : null;
  });
  if (!fatto) return null;
  // Копието на офертата — до администратора, който е платил (чл. 12.1; Дир. 2000/31, чл. 11). Не спира отговора.
  void inviaCopia(id, fatto.p.createdById, fatto.p.aziendaNome, fatto.p.totaleCent, fatto.fine);
  return fatto.fine;
}

async function inviaCopia(
  id: string,
  createdById: string | null,
  azienda: string,
  totaleCent: number,
  fine: Date,
): Promise<void> {
  try {
    const [chi, prova] = await Promise.all([
      createdById
        ? prisma.user.findUnique({ where: { id: createdById }, select: { email: true } })
        : null,
      prisma.accettazioneOfferta.findUnique({
        where: { pagamentoId: id },
        select: { testo: true },
      }),
    ]);
    if (!chi || !prova) return;
    await sendMail(
      pagamentoRicevutoMail({
        to: chi.email,
        azienda,
        totaleCent,
        ultimoGiorno: new Date(fine.getTime() - 1),
        offerta: prova.testo,
      }),
    );
  } catch (error) {
    logger.error({ err: errorMessage(error), pagamento: id }, 'pagamento: copia non inviata');
  }
}

/**
 * Сверката с Revolut: какво казва поръчката сега — и действа по него. `nonPagato` — Revolut е отговорил, че още
 * чака плащане (само тогава поддръжката може да я обяви за изтекла; непрочетена поръчка не изтича никога).
 */
async function verifica(id: string): Promise<{ stato: StatoPagamento | null; nonPagato: boolean }> {
  const p = await prisma.pagamento.findUnique({ where: { id } });
  if (!p || p.stato !== 'IN_ATTESA' || !p.revolutOrderId)
    return { stato: p?.stato ?? null, nonPagato: p !== null && p.revolutOrderId === null };
  const c = await clientePer(p.ambiente);
  if (!c) {
    logger.error({ pagamento: id }, "revolut: nessuna chiave per l'ambiente del pagamento");
    return { stato: p.stato, nonPagato: false };
  }
  let ordine;
  try {
    ordine = await leggiOrdine(c, p.revolutOrderId);
  } catch (error) {
    if (!(error instanceof ErroreRevolut)) throw error;
    logger.warn({ stato: error.stato }, 'revolut: поръчката не се прочете');
    return { stato: p.stato, nonPagato: false };
  }
  if (ordine.state === 'completed') {
    if (
      ordine.id !== p.revolutOrderId ||
      ordine.amount !== p.totaleCent ||
      ordine.currency !== 'EUR'
    ) {
      logger.error({ pagamento: id }, 'revolut: завършена поръчка с друга сума — не се дава нищо');
      return { stato: p.stato, nonPagato: false };
    }
    await applica(id);
    return { stato: 'COMPLETATO', nonPagato: false };
  }
  if (ordine.state === 'failed') await segnaFallito(id, 'FALLITO', null);
  if (ordine.state === 'cancelled') await segnaFallito(id, 'ANNULLATO', null);
  const stato =
    (await prisma.pagamento.findUnique({ where: { id }, select: { stato: true } }))?.stato ?? null;
  return { stato, nonPagato: ordine.state === 'pending' };
}

/** Сверката: състоянието на плащането след нея. */
export async function riconcilia(id: string): Promise<StatoPagamento | null> {
  return (await verifica(id)).stato;
}

const eventoSchema = z
  .object({ event: z.string().max(80), order_id: z.string().max(100) })
  .passthrough();

/** Webhook-ът: само с валиден подпис; после — сверката (кое е вярно решава поръчката, не известието). */
export async function elaboraWebhook(
  raw: Buffer,
  timestamp: string | undefined,
  firma: string | undefined,
): Promise<'ok' | 'firma'> {
  const cfg = await leggiConfig();
  if (!cfg.webhookSegreto || !firmaValida(raw, timestamp, firma, [cfg.webhookSegreto]))
    return 'firma';
  let dati: z.infer<typeof eventoSchema>;
  try {
    dati = eventoSchema.parse(JSON.parse(raw.toString('utf8')));
  } catch {
    return 'ok';
  }
  const p = await prisma.pagamento.findUnique({
    where: { revolutOrderId: dati.order_id },
    select: { id: true },
  });
  if (p) await riconcilia(p.id);
  return 'ok';
}

/**
 * Поддръжката: висящите плащания от последните 7 дни — сверка (изгубен webhook, човек, който не се е върнал); по-
 * старите — още една сверка и изтекли само ако Revolut отговори „неплатена“ (поръчката изтича след час — PT1H);
 * непрочетените остават „In attesa“ в конзолата за проверка на ръка.
 */
export async function riconciliaInSospeso(now: Date = new Date()): Promise<number> {
  const SETTE_GIORNI = 7 * 24 * 60 * 60 * 1000;
  const vecchi = await prisma.pagamento.findMany({
    where: { stato: 'IN_ATTESA', createdAt: { lt: new Date(now.getTime() - SETTE_GIORNI) } },
    select: { id: true },
    take: 100,
  });
  for (const v of vecchi) {
    const { stato, nonPagato } = await verifica(v.id);
    // Само когато Revolut е казал „неплатена“ — непрочетената може да е платена (смяна на ключ, срив).
    if (stato === 'IN_ATTESA' && nonPagato) await segnaFallito(v.id, 'SCADUTO', null);
  }
  const sospesi = await prisma.pagamento.findMany({
    where: {
      stato: 'IN_ATTESA',
      revolutOrderId: { not: null },
      createdAt: {
        gte: new Date(now.getTime() - SETTE_GIORNI),
        lt: new Date(now.getTime() - 2 * 60_000),
      },
    },
    select: { id: true },
    take: 50,
  });
  for (const s of sospesi) await riconcilia(s.id);
  return vecchi.length + sospesi.length;
}
