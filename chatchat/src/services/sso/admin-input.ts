import { isIP } from 'node:net';
import { z } from 'zod';
import { normalizeDomain } from './policy.js';

/**
 * Входът на администратора за доставчик (Zod) и проверките на адреса на издателя. Издателят на
 * общ OIDC е адрес, към който СЪРВЪРЪТ прави заявки (discovery, JWKS, token) — затова само HTTPS и
 * никога IP литерал, localhost или вътрешни имена (SSRF към метаданните на облака, метриките и пр.).
 * За Entra адрес няма: издателят се извежда от GUID-а на директорията.
 */

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const Guid = z.string().trim().toLowerCase().regex(GUID);
const DisplayName = z
  .string()
  .trim()
  .max(60)
  .regex(/^[^\p{Cc}<>]*$/u);
/** Видими ASCII знаци без интервали (client id на Entra е GUID, на Keycloak — име). */
const ClientId = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[\x21-\x7e]+$/);
const ClientSecret = z
  .string()
  .min(1)
  .max(1000)
  .regex(/^[^\p{Cc}]+$/u);
const Issuer = z.string().trim().min(8).max(500);
const Domains = z.array(z.string().max(253)).min(1).max(20);
const Id = z.string().min(1).max(40);

export const CreateInput = z
  .object({
    /** null → вътрешните на клиента; иначе — порталните потребители на фирмата. */
    companyId: Id.nullable().default(null),
    provider: z.enum(['ENTRA', 'OIDC']),
    displayName: DisplayName.default(''),
    entraTenantId: Guid.optional(),
    issuer: Issuer.optional(),
    clientId: ClientId,
    clientSecret: ClientSecret,
    domains: Domains,
    trustIdpMfa: z.boolean().default(false),
    idpLogout: z.boolean().default(false),
    enabled: z.boolean().default(false),
  })
  .strict();

/** Промяна: всичко по избор; секрет без стойност → остава старият. Доставчикът не се сменя. */
export const UpdateInput = z
  .object({
    displayName: DisplayName.optional(),
    entraTenantId: Guid.optional(),
    issuer: Issuer.optional(),
    clientId: ClientId.optional(),
    clientSecret: ClientSecret.optional(),
    domains: Domains.optional(),
    mode: z.enum(['OPTIONAL', 'REQUIRED']).optional(),
    trustIdpMfa: z.boolean().optional(),
    idpLogout: z.boolean().optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export type CreateInputT = z.infer<typeof CreateInput>;
export type UpdateInputT = z.infer<typeof UpdateInput>;

/** Имена на хостове, които никога не са публичен доставчик. */
function internalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(h) !== 0) return true;
  if (h === 'localhost' || !h.includes('.')) return true;
  return /\.(localhost|local|internal|intranet|lan|home|corp|localdomain)$/.test(h);
}

/**
 * Издател на общ OIDC: абсолютен HTTPS адрес без потребител/парола, заявка и фрагмент, към
 * публично име. `allowInsecure` е САМО за тестовете (локален фалшив доставчик на http://127.0.0.1).
 */
export function validIssuer(raw: string, allowInsecure: boolean): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.username || u.password || u.search || u.hash) return null;
  if (allowInsecure) return u.protocol === 'https:' || u.protocol === 'http:' ? raw : null;
  if (u.protocol !== 'https:' || (u.port !== '' && u.port !== '443')) return null;
  return internalHost(u.hostname) ? null : raw;
}

/** Нормализирани, без повторения; невалиден домейн → null (целият вход се отказва). */
export function normalizeDomains(raw: readonly string[]): string[] | null {
  const out = new Set<string>();
  for (const d of raw) {
    const n = normalizeDomain(d.replace(/^@/, ''));
    if (!n) return null;
    out.add(n);
  }
  return [...out];
}
