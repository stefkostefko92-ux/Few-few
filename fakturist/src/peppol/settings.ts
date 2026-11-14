import { peppolSettings } from '../admin/integrations.js';
import { setting } from '../admin/settings.js';
import { orgHasFeature } from '../billing/entitlements.js';
import { prisma } from '../db.js';
import type { Prisma } from '@prisma/client';
import type { AccessPoint } from './access-point.js';
import { EConnectAccessPoint, type FetchLike } from './econnect.js';

let cached: { key: string; ap: AccessPoint } | null = null;

/**
 * Точката за достъп по настройките от панела или null (Peppol е изключен). Един клиент за едни и същи
 * настройки — токенът се пази между заявките.
 */
export async function accessPoint(fetchImpl?: FetchLike): Promise<AccessPoint | null> {
  const settings = await peppolSettings();
  if (!settings) return null;
  if (fetchImpl) return new EConnectAccessPoint(settings, fetchImpl);
  const key = `${settings.environment}\n${settings.clientId}\n${settings.clientSecret}`;
  if (cached?.key !== key) cached = { key, ap: new EConnectAccessPoint(settings) };
  return cached.ap;
}

/**
 * Може ли фирмата да ползва Peppol. След пускането — функцията `peppol` (статус `live`, включена, в плана).
 * Преди това — само пилотните фирми от настройките и само в тестовата среда на точката за достъп: новият
 * подобработващ не получава реални данни преди новата версия на договора за обработване и предизвестието.
 */
export async function peppolAllowed(
  organizationId: string,
  options: { viaFirmId?: string | null; db?: Prisma.TransactionClient } = {},
): Promise<boolean> {
  // Прекратена фирма не праща (общите условия т. 11 — изключваме я от мрежата).
  const org = await (options.db ?? prisma).organization.findUnique({
    where: { id: organizationId },
    select: { terminatedAt: true, deletedAt: true },
  });
  if (!org || org.terminatedAt || org.deletedAt) return false;
  if (await orgHasFeature(organizationId, 'peppol', options)) return true;
  const pilots = (await setting('peppol.pilotOrgIds')).split(',').filter(Boolean);
  if (!pilots.includes(organizationId)) return false;
  return (await peppolSettings())?.environment === 'acceptance';
}
