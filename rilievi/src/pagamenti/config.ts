import type { AmbienteRevolut } from '@prisma/client';
import { writeAudit } from '../audit.js';
import { cifraRevolut, decifraRevolut } from '../auth/chiavi.js';
import { config, isProduction } from '../config.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import {
  BASI,
  eliminaWebhook,
  ErroreRevolut,
  ORIGINI_CHECKOUT,
  registraWebhook,
  type ClienteRevolut,
} from './revolut.js';

/**
 * Настройката на плащанията (#31 — собственикът: „да мога да конфигурирам напълно от настройките на мастър акаунта
 * по най-лесния възможен начин, както и да включвам и изключвам плащанията“): вкл./изкл., sandbox или продукция,
 * ключът на API (само се пише, в базата — шифрован), webhook-ът с един бутон (signing secret-ът — шифрован). Одит
 * без ключове.
 */

/** Адресът на API: средата от конзолата; в тестове — фалшивият Revolut (само извън продукция). */
export function baseDi(ambiente: AmbienteRevolut): string {
  const override = config().REVOLUT_API_BASE;
  if (override && !isProduction()) return override;
  return BASI[ambiente];
}

/** Откъде може да е страницата за плащане (`checkout_url`) — Revolut; в тестове и фалшивият. */
export function originiCheckout(): string[] {
  const override = config().REVOLUT_API_BASE;
  return override && !isProduction()
    ? [...ORIGINI_CHECKOUT, new URL(override).origin]
    : [...ORIGINI_CHECKOUT];
}

export async function leggiConfig() {
  const riga = await prisma.configPagamenti.findUnique({
    where: { id: 'revolut' },
    include: { updatedBy: { select: { name: true } } },
  });
  return {
    attivo: riga?.attivo ?? false,
    ambiente: riga?.ambiente ?? ('SANDBOX' as AmbienteRevolut),
    chiave: riga?.chiaveEnc ? decifraRevolut(riga.chiaveEnc) : null,
    webhookId: riga?.webhookId ?? null,
    webhookSegreto: riga?.webhookSegretoEnc ? decifraRevolut(riga.webhookSegretoEnc) : null,
    senzaVies: riga?.senzaVies ?? true,
    altreVenditeUeCent: riga?.altreVenditeUeCent ?? 0,
    updatedAt: riga?.updatedAt ?? null,
    updatedBy: riga?.updatedBy?.name ?? null,
  };
}

/** Клиентът на API за плащане сега — само при включени плащания с ключ. */
export async function clienteAttivo(): Promise<{
  c: ClienteRevolut;
  ambiente: AmbienteRevolut;
} | null> {
  const cfg = await leggiConfig();
  if (!cfg.attivo || !cfg.chiave) return null;
  return { c: { base: baseDi(cfg.ambiente), chiave: cfg.chiave }, ambiente: cfg.ambiente };
}

/** Клиентът на средата, в която е направено плащане (сверка и след изключване на плащанията). */
export async function clientePer(ambiente: AmbienteRevolut): Promise<ClienteRevolut | null> {
  const cfg = await leggiConfig();
  if (!cfg.chiave || cfg.ambiente !== ambiente) return null;
  return { base: baseDi(ambiente), chiave: cfg.chiave };
}

export type EsitoConfig = 'ok' | 'senzaChiave';

export async function salvaConfig(
  actorId: string,
  v: { attivo: boolean; ambiente: AmbienteRevolut; chiave: string | null },
): Promise<EsitoConfig> {
  const esistente = await prisma.configPagamenti.findUnique({ where: { id: 'revolut' } });
  if (v.attivo && !v.chiave && !esistente?.chiaveEnc) return 'senzaChiave';
  // Нов ключ или друга среда — webhook-ът на старата вече не е наш: маха се със стария ключ и се регистрира наново.
  const cambio = v.chiave !== null || (esistente && esistente.ambiente !== v.ambiente);
  const vecchia = esistente?.chiaveEnc ? decifraRevolut(esistente.chiaveEnc) : null;
  if (cambio && esistente?.webhookId && vecchia)
    await togliWebhook({ base: baseDi(esistente.ambiente), chiave: vecchia }, esistente.webhookId);
  const dati = {
    attivo: v.attivo,
    ambiente: v.ambiente,
    updatedById: actorId,
    ...(v.chiave !== null ? { chiaveEnc: cifraRevolut(v.chiave) } : {}),
    ...(cambio ? { webhookId: null, webhookSegretoEnc: null } : {}),
  };
  await prisma.$transaction(async (tx) => {
    await tx.configPagamenti.upsert({ where: { id: 'revolut' }, create: dati, update: dati });
    await writeAudit(
      {
        actorId,
        action: 'PAGAMENTI_IMPOSTATI',
        aziendaId: null,
        targetType: 'pagamento',
        targetId: 'revolut',
        meta: { attivo: v.attivo, ambiente: v.ambiente, chiaveNuova: v.chiave !== null },
      },
      tx,
    );
  });
  return 'ok';
}

/**
 * ДДС при номер извън VIES (условията 2026-11-14, чл. 12.10 b): ключът и другите продажби на фирмата за годината
 * към данъчно незадължени лица в ЕС (от счетоводството — порталът не ги знае; влизат в прага от 10 000 €).
 */
export async function salvaIva(
  actorId: string,
  v: { senzaVies: boolean; altreVenditeUeCent: number; altreVenditeUePrecCent: number },
  now: Date = new Date(),
): Promise<void> {
  // Двете числа са за текущата и за предходната календарна година към момента на записа.
  const dati = { ...v, altreVenditeUeAnno: now.getUTCFullYear(), updatedById: actorId };
  await prisma.$transaction(async (tx) => {
    await tx.configPagamenti.upsert({ where: { id: 'revolut' }, create: dati, update: dati });
    await writeAudit(
      {
        actorId,
        action: 'PAGAMENTI_IMPOSTATI',
        aziendaId: null,
        targetType: 'pagamento',
        targetId: 'revolut',
        meta: {
          senzaVies: v.senzaVies,
          altreVenditeUeCent: v.altreVenditeUeCent,
          altreVenditeUePrecCent: v.altreVenditeUePrecCent,
        },
      },
      tx,
    );
  });
}

/**
 * Регистрира адреса за известията в Revolut и пази signing secret-а шифрован. Иска и известията за спорове
 * (`DISPUTE_*`); ако Revolut ги откаже за този ключ или среда (400/422), регистрира само поръчките —
 * `senzaDispute` (плащанията и връщанията работят, споровете се гледат в Revolut Business).
 */
export async function registraIlWebhook(
  actorId: string,
): Promise<'ok' | 'senzaDispute' | 'senzaChiave'> {
  const cfg = await leggiConfig();
  if (!cfg.chiave) return 'senzaChiave';
  const cliente = { base: baseDi(cfg.ambiente), chiave: cfg.chiave };
  // Наново — първо старият (иначе всяко известие идва два пъти, а след 10 Revolut отказва).
  if (cfg.webhookId) await togliWebhook(cliente, cfg.webhookId);
  const url = `${config().PUBLIC_BASE_URL}/webhook/revolut`;
  let conDispute = true;
  let w: Awaited<ReturnType<typeof registraWebhook>>;
  try {
    w = await registraWebhook(cliente, url);
  } catch (error) {
    if (!(error instanceof ErroreRevolut) || (error.stato !== 400 && error.stato !== 422))
      throw error;
    conDispute = false;
    w = await registraWebhook(cliente, url, false);
  }
  await prisma.$transaction(async (tx) => {
    await tx.configPagamenti.update({
      where: { id: 'revolut' },
      data: { webhookId: w.id, webhookSegretoEnc: cifraRevolut(w.segreto), updatedById: actorId },
    });
    await writeAudit(
      {
        actorId,
        action: 'PAGAMENTI_IMPOSTATI',
        aziendaId: null,
        targetType: 'pagamento',
        targetId: 'revolut',
        meta: { webhook: true, dispute: conDispute },
      },
      tx,
    );
  });
  return conDispute ? 'ok' : 'senzaDispute';
}

/** Маха webhook-а в Revolut; неуспехът само се записва в лога (вече изтрит, друг акаунт, срив). */
async function togliWebhook(c: ClienteRevolut, id: string): Promise<void> {
  try {
    await eliminaWebhook(c, id);
  } catch (error) {
    if (!(error instanceof ErroreRevolut)) throw error;
    logger.warn({ stato: error.stato }, 'revolut: il vecchio webhook non è stato tolto');
  }
}
