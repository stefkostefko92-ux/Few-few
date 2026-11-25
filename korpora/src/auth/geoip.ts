import { existsSync } from 'node:fs';
import { isIP } from 'node:net';
import maxmind, { type CountryResponse, type Reader } from 'maxmind';
import { config } from '../config.js';
import { normalizeIp } from '../http/ip.js';
import { fromRoot } from '../paths.js';
import { logger } from '../logger.js';

let reader: Reader<CountryResponse> | null = null;

/**
 * Държава по IP от DB-IP Lite (CC BY 4.0, mmdb). Без файла продуктът работи, а държавата е „—“.
 * Файлът се обновява месечно с `npm run geoip:update`.
 */
export async function loadGeoIp(path = config().GEOIP_PATH): Promise<boolean> {
  const file = fromRoot(path);
  if (!existsSync(file)) {
    logger.warn('няма база за държава по IP — държавата ще е празна (npm run geoip:update)');
    reader = null;
    return false;
  }
  reader = await maxmind.open<CountryResponse>(file);
  return true;
}

export function geoIpReady(): boolean {
  return reader !== null;
}

/** Локален или частен адрес — за тях държава няма. */
function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a = 0, b = 0] = ip.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    );
  }
  const lower = ip.toLowerCase();
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe80')
  );
}

/** ISO код на държавата (напр. „BG“) или null. */
export function countryOf(ip: string | null | undefined): string | null {
  const value = normalizeIp(ip);
  if (!value || isPrivateIp(value) || !reader) return null;
  try {
    const code = reader.get(value)?.country?.iso_code;
    return typeof code === 'string' && /^[A-Z]{2}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

const names = new Map<string, Intl.DisplayNames>();

/** Името на държавата на езика на екрана („BG“ → „България“). */
export function countryName(code: string | null | undefined, localeTag: string): string {
  if (!code) return '';
  let display = names.get(localeTag);
  if (!display) {
    display = new Intl.DisplayNames([localeTag], { type: 'region' });
    names.set(localeTag, display);
  }
  try {
    return display.of(code) ?? code;
  } catch {
    return code;
  }
}
