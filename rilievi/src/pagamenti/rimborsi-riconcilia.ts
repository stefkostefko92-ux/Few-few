import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { baseDi, clientePer, leggiConfig } from './config.js';
import { ErroreRevolut, leggiOrdine, type OrdineRevolut } from './revolut.js';
import { fallisci, ordina, registra } from './rimborso-revolut.js';

/**
 * Сверката на връщанията през Revolut (rimborso-revolut.ts): кое е вярно решава поръчката за връщане, прочетена
 * обратно — от подписания webhook, от бутона „Riprova“ или от поддръжката. Връщане без отговор се нарежда пак със
 * същия Idempotency-Key; ако отговорът се е изгубил, а Revolut го е направил, известието му се познава по нашия id.
 */

/** Сверката на едно отворено връщане: чете поръчката му или, без отговор досега, нарежда пак със същия ключ. */
export async function riconciliaRimborso(rimborsoId: string): Promise<void> {
  const r = await prisma.rimborso.findUnique({
    where: { id: rimborsoId },
    include: { pagamento: { select: { ambiente: true, revolutOrderId: true } } },
  });
  if (!r || r.stato !== 'IN_CORSO' || !r.pagamento.revolutOrderId) return;
  const c = await clientePer(r.pagamento.ambiente);
  if (!c) return;
  if (!r.revolutRefundId) {
    await ordina(c, r, r.pagamento.revolutOrderId);
    return;
  }
  try {
    const ordine = await leggiOrdine(c, r.revolutRefundId);
    if (ordine.amount !== r.importoCent || ordine.currency !== 'EUR') {
      logger.error(
        { evento: 'rimborso.importo_diverso', rimborso: r.id },
        'revolut: rimborso con un altro importo',
      );
      return;
    }
    await registra(r.id, ordine);
  } catch (error) {
    if (!(error instanceof ErroreRevolut)) throw error;
    logger.warn(
      { evento: 'rimborso.lettura_fallita', rimborso: r.id, stato: error.stato },
      'revolut: il rimborso non si legge',
    );
  }
}

/**
 * Известие за поръчка, която не е плащане: връщане, което знаем — сверка; връщане, чийто отговор се е изгубил —
 * познава се по нашия id в `merchant_order_data.reference` (и по върнатата поръчка и сумата) и се довършва.
 */
export async function rimborsoDaNotifica(orderId: string): Promise<void> {
  const noto = await prisma.rimborso.findUnique({
    where: { revolutRefundId: orderId },
    select: { id: true },
  });
  if (noto) return riconciliaRimborso(noto.id);
  const cfg = await leggiConfig();
  if (!cfg.chiave) return;
  let ordine: OrdineRevolut;
  try {
    ordine = await leggiOrdine({ base: baseDi(cfg.ambiente), chiave: cfg.chiave }, orderId);
  } catch (error) {
    if (!(error instanceof ErroreRevolut)) throw error;
    return;
  }
  const riferimento = ordine.merchant_order_data?.reference;
  if (ordine.type !== 'refund' || !riferimento || ordine.id !== orderId) return;
  const r = await prisma.rimborso.findFirst({
    where: { id: riferimento, stato: 'IN_CORSO', revolutRefundId: null },
    include: { pagamento: { select: { revolutOrderId: true } } },
  });
  if (
    !r ||
    r.importoCent !== ordine.amount ||
    ordine.currency !== 'EUR' ||
    ordine.related_order_id !== r.pagamento.revolutOrderId
  )
    return;
  await registra(r.id, ordine);
}

const MINUTO = 60_000;

/**
 * Поддръжката (всеки час): отворените връщания — четене на поръчката им; без отговор от Revolut — още едно
 * нареждане със същия ключ през първия час; след 24 часа без отговор — неуспешно (MASTER гледа в Revolut Business).
 */
export async function riconciliaRimborsi(now: Date = new Date()): Promise<number> {
  const aperti = await prisma.rimborso.findMany({
    where: { stato: 'IN_CORSO' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, revolutRefundId: true, createdAt: true },
    take: 50,
  });
  for (const r of aperti) {
    const eta = now.getTime() - r.createdAt.getTime();
    if (r.revolutRefundId) await riconciliaRimborso(r.id);
    else if (eta >= 24 * 60 * MINUTO) await fallisci(r.id, 'senzaRisposta');
    else if (eta >= 2 * MINUTO && eta < 60 * MINUTO) await riconciliaRimborso(r.id);
  }
  return aperti.length;
}
