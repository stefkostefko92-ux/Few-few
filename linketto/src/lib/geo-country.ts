// Държава на посетителя (ISO-2) — чисто, тества се (docs/geo-autotranslate-spec.md, А).
// Първо заглавката на прокси отпред (Cloudflare/Vercel), иначе справка в
// локалната база по IP. IP адресът се ползва само за справката — не се записва.

import { isIP } from 'node:net';
import { pickClientIp } from '@/lib/limiter';

const ISO2 = /^[A-Z]{2}$/;
// Псевдо кодове: XX неизвестна, T1 Tor (Cloudflare), ZZ/EU/AP — не са държави.
const PSEUDO = new Set(['XX', 'T1', 'ZZ', 'EU', 'AP', 'A1', 'A2', 'O1']);

export function normalizeCountry(raw: string | null | undefined): string | null {
  const code = (raw ?? '').trim().toUpperCase();
  return ISO2.test(code) && !PSEUDO.has(code) ? code : null;
}

export function countryFromRequest(
  get: (name: string) => string | null | undefined,
  lookup: (ip: string) => string | null | undefined,
): string | null {
  const proxied = normalizeCountry(get('cf-ipcountry')) ?? normalizeCountry(get('x-vercel-ip-country'));
  if (proxied) return proxied;
  const ip = pickClientIp(get);
  if (!isIP(ip)) return null;
  try {
    return normalizeCountry(lookup(ip));
  } catch {
    return null;
  }
}
