import type { PrismaClient, SsoConfig } from '@prisma/client';
import { createHmac } from 'node:crypto';
import * as oidc from 'openid-client';
import { hashToken, randomToken, safeEqual } from '../../crypto.js';
import { tenantBySsoState } from '../../db/discovery.js';
import type { ProviderCache } from './provider.js';
import type { SsoDeps } from './types.js';

/**
 * Потокът Authorization Code + PKCE (S256) с `state` и `nonce`:
 * - `state` е случаен; в базата е само HMAC-ът му (SsoLoginState), еднократен, 10 минути;
 * - потокът е вързан към браузъра с бисквитка (`cc_sso`, httpOnly, SameSite=Lax — трябва да дойде
 *   при връщането от доставчика, което е навигация от чужд сайт): чужд `code`/`state`, пратен на
 *   жертвата, не я вписва като нападателя (login CSRF);
 * - `nonce` и `code_verifier` не се пазят никъде: извеждат се (HMAC) от бисквитката и записа —
 *   изтичане на базата само по себе си не дава нито едното;
 * - нищо от отговора на доставчика не се записва (токени, claims) — само резултатът на входа.
 */

export const SSO_STATE_TTL_MS = 10 * 60 * 1000;
const STATE = /^[A-Za-z0-9_-]{20,100}$/;
export const SSO_COOKIE = 'cc_sso';
export type FlowPurpose = 'login' | 'test';

export interface FlowDeps {
  db: PrismaClient;
  pepper: string;
  sso: SsoDeps;
  cache: ProviderCache;
}

function derive(pepper: string, label: string, binding: string, stateId: string): string {
  return createHmac('sha256', pepper)
    .update(`chatchat/sso/${label}/v1|${binding}|${stateId}`)
    .digest('base64url');
}

/** Откритият client secret; със стар ключ → преписва се с текущия (ротация на SSO_KEK). */
export async function clientSecretOf(deps: FlowDeps, cfg: SsoConfig): Promise<string> {
  const { secret, stale } = deps.sso.box.open(cfg.clientSecretEnc, cfg.tenantId, cfg.id);
  if (stale) {
    // Без смяна на secretUpdatedAt — кешът на доставчика и тестът не се обезсилват.
    await deps.db.ssoConfig.updateMany({
      where: { id: cfg.id, clientSecretEnc: cfg.clientSecretEnc },
      data: { clientSecretEnc: deps.sso.box.seal(secret, cfg.tenantId, cfg.id) },
    });
  }
  return secret;
}

export async function beginFlow(
  deps: FlowDeps,
  cfg: SsoConfig,
  opts: { purpose: FlowPurpose; redirectUri: string; loginHint?: string; actorId?: string },
): Promise<{ url: string; binding: string }> {
  const client = await deps.cache.get(cfg, await clientSecretOf(deps, cfg));
  const now = Date.now();
  // Изтеклите опити не трупат редове (индекс по expiresAt).
  await deps.db.ssoLoginState.deleteMany({
    where: { expiresAt: { lt: new Date(now - 3600_000) } },
  });
  const state = randomToken();
  const binding = randomToken();
  const row = await deps.db.ssoLoginState.create({
    data: {
      tenantId: cfg.tenantId,
      configId: cfg.id,
      stateHash: hashToken(state, deps.pepper),
      bindingHash: hashToken(binding, deps.pepper),
      purpose: opts.purpose,
      actorId: opts.actorId ?? null,
      expiresAt: new Date(now + SSO_STATE_TTL_MS),
    },
  });
  const verifier = derive(deps.pepper, 'pkce', binding, row.id);
  const params: Record<string, string> = {
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    state,
    nonce: derive(deps.pepper, 'nonce', binding, row.id),
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
  };
  if (opts.loginHint) params.login_hint = opts.loginHint;
  // Тестът иска истински вход (за `amr`), не тихо продължение на стара сесия при доставчика.
  if (opts.purpose === 'test') params.prompt = 'login';
  const url = oidc.buildAuthorizationUrl(client, params);
  if (url.protocol !== 'https:' && !deps.sso.allowInsecureHttp) throw new Error('sso_insecure');
  return { url: url.href, binding };
}

export type FlowFailure = 'state' | 'idp_error' | 'config' | 'exchange' | 'no_id_token';

export type FlowResult =
  | {
      ok: true;
      purpose: FlowPurpose;
      actorId: string | null;
      config: SsoConfig;
      claims: Record<string, unknown>;
    }
  | {
      ok: false;
      reason: FlowFailure;
      purpose: FlowPurpose | null;
      actorId: string | null;
      config: SsoConfig | null;
      error?: unknown;
    };

/**
 * Клиентът на започнатия вход по върнатия `state` — тесният път преди вход (само id на клиента по
 * HMAC-а; неизползван и в срок). Останалото от връщането тече в контекста му, под RLS.
 */
export async function tenantOfState(deps: FlowDeps, currentUrl: URL): Promise<string | null> {
  const state = currentUrl.searchParams.get('state') ?? '';
  if (!STATE.test(state)) return null;
  return tenantBySsoState(deps.db, hashToken(state, deps.pepper));
}

/**
 * Връщането от доставчика: state → записът (еднократно, в срок, същият браузър) → обмяна на кода
 * с PKCE → проверен id_token (подпис, iss, aud, exp/nbf/iat, nonce). `currentUrl` е публичният
 * адрес на callback-а (от него openid-client взима redirect_uri за token endpoint-а).
 */
export async function finishFlow(
  deps: FlowDeps,
  currentUrl: URL,
  binding: string | null,
): Promise<FlowResult> {
  const fail = (
    reason: FlowFailure,
    extra: Partial<Extract<FlowResult, { ok: false }>> = {},
  ): FlowResult => ({ ok: false, reason, purpose: null, actorId: null, config: null, ...extra });
  const state = currentUrl.searchParams.get('state') ?? '';
  if (!STATE.test(state) || !binding) return fail('state');
  const row = await deps.db.ssoLoginState.findUnique({
    where: { stateHash: hashToken(state, deps.pepper) },
  });
  if (!row || !safeEqual(row.bindingHash, hashToken(binding, deps.pepper))) return fail('state');
  const now = new Date();
  const used = await deps.db.ssoLoginState.updateMany({
    where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (used.count !== 1) return fail('state');
  const purpose: FlowPurpose = row.purpose === 'test' ? 'test' : 'login';
  const base = { purpose, actorId: row.actorId };
  const cfg = await deps.db.ssoConfig.findUnique({ where: { id: row.configId } });
  if (!cfg || cfg.tenantId !== row.tenantId || (purpose === 'login' && !cfg.enabled)) {
    return fail('config', base);
  }
  if (currentUrl.searchParams.has('error')) return fail('idp_error', { ...base, config: cfg });
  let claims: Record<string, unknown> | null;
  try {
    const client = await deps.cache.get(cfg, await clientSecretOf(deps, cfg));
    claims = await exchangeCode(client, currentUrl, {
      verifier: derive(deps.pepper, 'pkce', binding, row.id),
      nonce: derive(deps.pepper, 'nonce', binding, row.id),
      state,
    });
  } catch (error) {
    return fail('exchange', { ...base, config: cfg, error });
  }
  if (!claims) return fail('no_id_token', { ...base, config: cfg });
  return { ok: true, ...base, config: cfg, claims };
}

/**
 * Обмяната на кода: отговорът на доставчика (state), token endpoint с PKCE, проверен id_token —
 * подпис (JWKS), iss, aud (+ azp), exp/nbf/iat с толеранс, nonce. Грешка → хвърля (без съдържание
 * в лога — `oidcErrorCode`); без id_token → null.
 */
export async function exchangeCode(
  client: oidc.Configuration,
  currentUrl: URL,
  checks: { verifier: string; nonce: string; state: string },
): Promise<Record<string, unknown> | null> {
  const tokens = await oidc.authorizationCodeGrant(client, currentUrl, {
    pkceCodeVerifier: checks.verifier,
    expectedNonce: checks.nonce,
    expectedState: checks.state,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  return claims ? { ...claims } : null;
}
