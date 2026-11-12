import type { AmbienteRevolut } from '@prisma/client';
import { writeAudit } from '../audit.js';
import { cifraRevolut, decifraRevolut } from '../auth/chiavi.js';
import { config, isProduction } from '../config.js';
import { prisma } from '../db.js';
import { BASI, ORIGINI_CHECKOUT, registraWebhook, type ClienteRevolut } from './revolut.js';

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
  // Нов ключ или друга среда — webhook-ът на старата вече не е наш: регистрира се наново.
  const cambio = v.chiave !== null || (esistente && esistente.ambiente !== v.ambiente);
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

/** Регистрира адреса за известията в Revolut и пази signing secret-а шифрован. */
export async function registraIlWebhook(actorId: string): Promise<'ok' | 'senzaChiave'> {
  const cfg = await leggiConfig();
  if (!cfg.chiave) return 'senzaChiave';
  const w = await registraWebhook(
    { base: baseDi(cfg.ambiente), chiave: cfg.chiave },
    `${config().PUBLIC_BASE_URL}/webhook/revolut`,
  );
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
        meta: { webhook: true },
      },
      tx,
    );
  });
  return 'ok';
}
