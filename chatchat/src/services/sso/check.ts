import type { SsoConfig } from '@prisma/client';
import type { ServerMetadata } from 'openid-client';
import { oidcErrorCode, type ProviderCache } from './provider.js';
import type { SsoDeps } from './types.js';

/**
 * „Проверка на метаданните“ (без вход): discovery на издателя (issuer съвпада — openid-client),
 * нужните крайни точки по HTTPS, JWKS с поне един ключ за подпис, PKCE S256, изход при доставчика.
 * Връща само флагове и кодове — нито отговорите на доставчика, нито секрета. Пълната проверка
 * (секрет, redirect URI, claims, MFA) е интерактивният тест (`purpose: test`).
 */

export interface MetadataCheck {
  ok: boolean;
  discovery: boolean;
  endpoints: boolean;
  jwks: boolean;
  /** Обявен ли е S256 (Entra не го обявява, но го поддържа — само за сведение). */
  pkceS256: boolean | null;
  endSession: boolean;
  error: string | null;
}

function secureUrl(v: unknown, allowInsecure: boolean): boolean {
  if (typeof v !== 'string') return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || (allowInsecure && u.protocol === 'http:');
  } catch {
    return false;
  }
}

async function jwksUsable(sso: SsoDeps, uri: string): Promise<boolean> {
  const doFetch = sso.fetch ?? fetch;
  const res = await doFetch(uri, {
    method: 'GET',
    headers: { accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(sso.timeoutSeconds * 1000),
    body: undefined,
  });
  if (res.status !== 200) return false;
  const text = await res.text();
  if (text.length > 512 * 1024) return false;
  const body: unknown = JSON.parse(text);
  if (typeof body !== 'object' || body === null || !('keys' in body)) return false;
  const keys = (body as { keys: unknown }).keys;
  return (
    Array.isArray(keys) &&
    keys.some(
      (k: unknown) =>
        typeof k === 'object' &&
        k !== null &&
        'kty' in k &&
        (!('use' in k) || (k as { use: unknown }).use === 'sig'),
    )
  );
}

export async function checkMetadata(
  sso: SsoDeps,
  cache: ProviderCache,
  cfg: Pick<SsoConfig, 'issuer'>,
): Promise<MetadataCheck> {
  const out: MetadataCheck = {
    ok: false,
    discovery: false,
    endpoints: false,
    jwks: false,
    pkceS256: null,
    endSession: false,
    error: null,
  };
  let meta: ServerMetadata;
  try {
    meta = await cache.discover(cfg.issuer);
    out.discovery = true;
  } catch (err) {
    out.error = oidcErrorCode(err).errCode ?? 'discovery_failed';
    return out;
  }
  const insecure = sso.allowInsecureHttp;
  out.endpoints =
    secureUrl(meta.authorization_endpoint, insecure) &&
    secureUrl(meta.token_endpoint, insecure) &&
    secureUrl(meta.jwks_uri, insecure);
  const methods = meta.code_challenge_methods_supported;
  out.pkceS256 = Array.isArray(methods) ? methods.includes('S256') : null;
  out.endSession = secureUrl(meta.end_session_endpoint, insecure);
  if (out.endpoints && typeof meta.jwks_uri === 'string') {
    try {
      out.jwks = await jwksUsable(sso, meta.jwks_uri);
    } catch {
      out.jwks = false;
    }
  }
  if (!out.jwks && out.error === null) out.error = out.endpoints ? 'jwks_unusable' : 'endpoints';
  out.ok = out.discovery && out.endpoints && out.jwks && out.pkceS256 !== false;
  if (out.pkceS256 === false) out.error = 'pkce_s256_missing';
  return out;
}
