import { z } from 'zod';
import type { StatoPagamento } from '@prisma/client';
import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { DAY } from '../time.js';
import { applica } from './applica.js';
import { avvisaDopoPagamento } from './avvisi.js';
import { clientePer, leggiConfig } from './config.js';
import { firmaValida } from './firma.js';
import { ErroreRevolut, leggiOrdine } from './revolut.js';

/**
 * Сверката на плащанията с Revolut (#31): кое е вярно решава поръчката, прочетена обратно от Revolut (не
 * известието и не връщането на човека). Завършена със същата сума и валута → `applica` (pagamenti/applica.ts —
 * веднъж); неуспешна/отказана — отбелязва се. Webhook-ът само с валиден подпис; поддръжката сверява висящите.
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
 * Какво казва поръчката сега — и действа по него. `nonPagato` — Revolut е отговорил, че още чака плащане (само
 * тогава поддръжката може да я обяви за изтекла; непрочетена поръчка не изтича — може да е платена).
 */
async function verifica(id: string): Promise<{ stato: StatoPagamento | null; nonPagato: boolean }> {
  const p = await prisma.pagamento.findUnique({ where: { id } });
  if (!p || p.stato !== 'IN_ATTESA' || !p.revolutOrderId)
    return { stato: p?.stato ?? null, nonPagato: p !== null && p.revolutOrderId === null };
  const c = await clientePer(p.ambiente);
  if (!c) {
    logger.error(
      { evento: 'revolut.chiave_mancante', pagamento: id },
      'revolut: няма ключ за средата на плащането',
    );
    return { stato: p.stato, nonPagato: false };
  }
  let ordine;
  try {
    ordine = await leggiOrdine(c, p.revolutOrderId);
  } catch (error) {
    if (!(error instanceof ErroreRevolut)) throw error;
    logger.warn(
      { evento: 'revolut.lettura_fallita', pagamento: id, stato: error.stato },
      'revolut: поръчката не се прочете',
    );
    return { stato: p.stato, nonPagato: false };
  }
  if (ordine.state === 'completed') {
    if (
      ordine.id !== p.revolutOrderId ||
      ordine.amount !== p.totaleCent ||
      ordine.currency !== 'EUR'
    ) {
      logger.error(
        { evento: 'pagamento.importo_diverso', pagamento: id },
        'revolut: завършена поръчка с друга сума — не се дава нищо',
      );
      return { stato: p.stato, nonPagato: false };
    }
    const esito = await applica(id);
    // Писмата — след отговора (webhook-ът не чака SMTP).
    void avvisaDopoPagamento(esito);
    const stato =
      esito?.pagamento.stato ??
      (await prisma.pagamento.findUnique({ where: { id }, select: { stato: true } }))?.stato ??
      null;
    return { stato, nonPagato: false };
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

/** Последният webhook за „Salute del sistema“: валиден и отказан (в паметта на процеса). */
export const webhookVisti: { valido: Date | null; rifiutati: number; rifiutato: Date | null } = {
  valido: null,
  rifiutati: 0,
  rifiutato: null,
};

/** Webhook-ът: само с валиден подпис; после — сверката (кое е вярно решава поръчката, не известието). */
export async function elaboraWebhook(
  raw: Buffer,
  timestamp: string | undefined,
  firma: string | undefined,
): Promise<'ok' | 'firma'> {
  const cfg = await leggiConfig();
  if (!cfg.webhookSegreto || !firmaValida(raw, timestamp, firma, [cfg.webhookSegreto])) {
    webhookVisti.rifiutati += 1;
    webhookVisti.rifiutato = new Date();
    logger.warn({ evento: 'webhook.firma' }, 'revolut: webhook с невалиден подпис');
    return 'firma';
  }
  webhookVisti.valido = new Date();
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

/** Колко дни непрочетена поръчка се сверява, преди да остане за MASTER. */
const GIORNI_NON_LETTO = 30;

/**
 * Поддръжката: висящите плащания от последните 7 дни — сверка (изгубен webhook, човек, който не се е върнал); по-
 * старите — още една сверка и изтекли само ако Revolut отговори „неплатена“ (поръчката изтича след час — PT1H).
 * Непрочетена поръчка (друг ключ, срив) не изтича: след 30 дни остава за проверка от MASTER. Най-старите първи.
 */
export async function riconciliaInSospeso(now: Date = new Date()): Promise<number> {
  const SETTE_GIORNI = 7 * DAY;
  const vecchi = await prisma.pagamento.findMany({
    where: { stato: 'IN_ATTESA', createdAt: { lt: new Date(now.getTime() - SETTE_GIORNI) } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, createdAt: true },
    take: 100,
  });
  for (const v of vecchi) {
    const { stato, nonPagato } = await verifica(v.id);
    if (stato !== 'IN_ATTESA') continue;
    // Само когато Revolut е казал „неплатена“ — непрочетената може да е платена (смяна на ключ, срив).
    if (nonPagato) await segnaFallito(v.id, 'SCADUTO', null);
    else if (v.createdAt.getTime() < now.getTime() - GIORNI_NON_LETTO * DAY)
      await prisma.pagamento.updateMany({
        where: { id: v.id, stato: 'IN_ATTESA' },
        data: { stato: 'DA_VERIFICARE', verificaMotivo: 'nonLetto' },
      });
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
    orderBy: { createdAt: 'asc' },
    select: { id: true },
    take: 50,
  });
  for (const s of sospesi) await riconcilia(s.id);
  return vecchi.length + sospesi.length;
}
