import { peppolSettings } from '../admin/integrations.js';
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
