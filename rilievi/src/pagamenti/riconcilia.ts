import { z } from 'zod';
import { scadenzaDopoMesi } from '../abbonamenti/regole.js';
import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { sendMail } from '../mail/mailer.js';
import { pagamentoRicevutoMail } from '../mail/templates-abbonamento.js';
import { clientePer, leggiConfig } from './config.js';
import { firmaValida } from './firma.js';
import { ErroreRevolut, leggiOrdine } from './revolut.js';

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

/** Дава периода на завършено плащане — веднъж. Връща края или null (вече дадено / няма го). */
async function applica(id: string): Promise<Date | null> {
  const fatto = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Pagamento" WHERE id = ${id} FOR UPDATE`;
    const p = await tx.pagamento.findUnique({ where: { id } });
    if (!p || p.stato !== 'IN_ATTESA') return null;
    const now = new Date();
    let inizio = now;
    let fine = now;
    if (p.aziendaId) {
      await tx.$queryRaw`SELECT id FROM "Azienda" WHERE id = ${p.aziendaId} FOR UPDATE`;
      const a = await tx.azienda.findUniqueOrThrow({
        where: { id: p.aziendaId },
        select: { abbonamentoFino: true },
      });
      inizio = a.abbonamentoFino && a.abbonamentoFino > now ? a.abbonamentoFino : now;
      fine = scadenzaDopoMesi(a.abbonamentoFino, p.mesi, now);
      await tx.azienda.update({
        where: { id: p.aziendaId },
        data: { abbonamentoFino: fine, abbonamentoLivello: p.livello, abbonamentoProva: false },
      });
      await writeAudit(
        {
          actorId: null,
          action: 'AZIENDA_ABBONAMENTO',
          aziendaId: p.aziendaId,
          targetType: 'azienda',
          targetId: p.aziendaId,
          meta: { origine: 'revolut', livello: p.livello, pagamento: p.id },
        },
        tx,
      );
    }
    await tx.pagamento.update({
      where: { id },
      data: { stato: 'COMPLETATO', completatoAt: now, inizio, fine },
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
    return { p, fine };
  });
  if (!fatto) return null;
  // Копието на офертата — до администратора, който е платил (чл. 12.1; Дир. 2000/31, чл. 11).
  const [chi, prova] = await Promise.all([
    fatto.p.createdById
      ? prisma.user.findUnique({ where: { id: fatto.p.createdById }, select: { email: true } })
      : null,
    prisma.accettazioneOfferta.findUnique({ where: { pagamentoId: id }, select: { testo: true } }),
  ]);
  if (chi && prova) {
    await sendMail(
      pagamentoRicevutoMail({
        to: chi.email,
        azienda: fatto.p.aziendaNome,
        totaleCent: fatto.p.totaleCent,
        ultimoGiorno: new Date(fatto.fine.getTime() - 1),
        offerta: prova.testo,
      }),
    );
  }
  return fatto.fine;
}

/** Сверката с Revolut: какво казва поръчката сега — и действа по него. Връща състоянието на плащането. */
export async function riconcilia(id: string) {
  const p = await prisma.pagamento.findUnique({ where: { id } });
  if (!p || p.stato !== 'IN_ATTESA' || !p.revolutOrderId) return p?.stato ?? null;
  const c = await clientePer(p.ambiente);
  if (!c) return p.stato;
  let ordine;
  try {
    ordine = await leggiOrdine(c, p.revolutOrderId);
  } catch (error) {
    if (!(error instanceof ErroreRevolut)) throw error;
    logger.warn({ stato: error.stato }, 'revolut: поръчката не се прочете');
    return p.stato;
  }
  if (ordine.state === 'completed') {
    if (
      ordine.id !== p.revolutOrderId ||
      ordine.amount !== p.totaleCent ||
      ordine.currency !== 'EUR'
    ) {
      logger.error({ pagamento: id }, 'revolut: завършена поръчка с друга сума — не се дава нищо');
      return p.stato;
    }
    await applica(id);
    return 'COMPLETATO' as const;
  }
  if (ordine.state === 'failed') await segnaFallito(id, 'FALLITO', null);
  if (ordine.state === 'cancelled') await segnaFallito(id, 'ANNULLATO', null);
  return (
    (await prisma.pagamento.findUnique({ where: { id }, select: { stato: true } }))?.stato ?? null
  );
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
 * старите — още една сверка и, ако Revolut пак не казва „завършена“, изтекли (поръчката изтича след час — PT1H).
 */
export async function riconciliaInSospeso(now: Date = new Date()): Promise<number> {
  const SETTE_GIORNI = 7 * 24 * 60 * 60 * 1000;
  const vecchi = await prisma.pagamento.findMany({
    where: { stato: 'IN_ATTESA', createdAt: { lt: new Date(now.getTime() - SETTE_GIORNI) } },
    select: { id: true },
    take: 100,
  });
  for (const v of vecchi) {
    if ((await riconcilia(v.id)) === 'IN_ATTESA') await segnaFallito(v.id, 'SCADUTO', null);
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
