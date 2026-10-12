import type { SsoConfig, SsoMode, SsoProvider } from '@prisma/client';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../src/app.js';
import { createSession, SESSION_COOKIE, type SessionDeps } from '../../src/auth/sessions.js';
import { withTenant } from '../../src/db/tenant-context.js';
import { createLogger } from '../../src/logger.js';
import { RealtimeHub } from '../../src/realtime/hub.js';
import { SecretBox } from '../../src/services/sso/secret.js';
import { entraIssuer, type SsoDeps } from '../../src/services/sso/types.js';
import { ENTRA_TID, FAKE_CLIENT_ID, FAKE_CLIENT_SECRET, type FakeIdp } from '../sso-fake-idp.js';
import type { User } from '@prisma/client';
import { appDb, Client, db, MFA_KEY, ORIGIN, PEPPER } from './helpers.js';

/**
 * Приложението с включен единен вход срещу локалния фалшив доставчик (http на 127.0.0.1 — само в
 * тестовете `allowInsecureHttp`), доставчик в базата и целият поток като браузъра: start →
 * authorize при доставчика → callback с бисквитката на потока.
 */

export const SSO_KEY = Buffer.alloc(32, 9);

export interface SsoHarness {
  base: string;
  origin: string;
  sessions: SessionDeps;
  close(): Promise<void>;
}

export async function startSsoApp(
  idp: FakeIdp,
  opts: { port?: number; origin?: string; sso?: boolean } = {},
): Promise<SsoHarness> {
  // Като в продукция: ролята на приложението под RLS (входът с единен вход е тесен път преди клиента).
  const sessions: SessionDeps = { db: appDb, pepper: PEPPER, ttlHours: 12, secureCookies: false };
  const hub = new RealtimeHub();
  const origin = opts.origin ?? ORIGIN;
  const sso: SsoDeps | null =
    opts.sso === false
      ? null
      : {
          box: new SecretBox(SSO_KEY),
          timeoutSeconds: 5,
          entraAuthority: idp.base,
          allowInsecureHttp: true,
          resolveTxt: (host) => idp.resolveTxt(host),
        };
  const app = createApp({
    db: appDb,
    logger: createLogger(process.env.TEST_LOG_LEVEL ?? 'silent'),
    publicOrigin: origin,
    privacyPolicyUrl: '',
    trustProxy: 0,
    sessions,
    mfaKey: MFA_KEY,
    diagnose: null,
    attachments: null,
    hub,
    sso,
  });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(opts.port ?? 0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  idp.redirectUris.add(`${origin}/api/v1/auth/sso/callback`);
  return {
    base: `http://127.0.0.1:${port}`,
    origin,
    sessions,
    close: () =>
      new Promise<void>((resolve, reject) => {
        hub.closeAll();
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export interface ConfigSpec {
  tenantId: string;
  provider?: SsoProvider;
  companyId?: string | null;
  domains: string[];
  mode?: SsoMode;
  trustIdpMfa?: boolean;
  idpLogout?: boolean;
  enabled?: boolean;
  entraTenantId?: string;
  lastTestOk?: boolean | null;
  /** Домейните са доказани (DNS) — по подразбиране да; false → само заявени. */
  verified?: boolean;
}

/** Доставчик направо в базата (секретът — шифрован като в продукцията). */
export async function makeSsoConfig(idp: FakeIdp, spec: ConfigSpec): Promise<SsoConfig> {
  const provider = spec.provider ?? 'ENTRA';
  const id = `ssotest${Math.random().toString(36).slice(2, 12)}`;
  const tid = spec.entraTenantId ?? ENTRA_TID;
  const cfg = await db.ssoConfig.create({
    data: {
      id,
      tenantId: spec.tenantId,
      companyId: spec.companyId ?? null,
      scopeKey: spec.companyId ?? 'internal',
      provider,
      issuer: provider === 'ENTRA' ? entraIssuer(idp.base, tid) : idp.genericIssuer(),
      entraTenantId: provider === 'ENTRA' ? tid : null,
      clientId: FAKE_CLIENT_ID,
      clientSecretEnc: new SecretBox(SSO_KEY).seal(FAKE_CLIENT_SECRET, spec.tenantId, id),
      mode: spec.mode ?? 'OPTIONAL',
      trustIdpMfa: spec.trustIdpMfa ?? false,
      idpLogout: spec.idpLogout ?? false,
      enabled: spec.enabled ?? true,
      lastTestOk: spec.lastTestOk ?? null,
      lastTestAt: spec.lastTestOk ? new Date() : null,
    },
  });
  const verified = spec.verified ?? true;
  await db.ssoDomain.createMany({
    data: spec.domains.map((domain) => ({
      tenantId: spec.tenantId,
      configId: id,
      domain,
      ...(verified ? { verifiedAt: new Date(), verifiedDomain: domain } : {}),
    })),
  });
  return cfg;
}

/** Стойност на бисквитка от Set-Cookie на отговор (или null). */
export function cookieFrom(res: { headers: Headers }, name: string): string | null {
  for (const c of res.headers.getSetCookie()) {
    const m = new RegExp(`^${name}=([^;]*)`).exec(c);
    if (m && m[1]) return m[1];
  }
  return null;
}

export interface SsoAttempt {
  /** Накъде праща callback-ът (`/` или `/?sso_error=…`). */
  location: string | null;
  /** Новата сесия (ако има) — клиент с бисквитката и CSRF токена от /auth/me. */
  client: Client | null;
  /** Адресът на callback-а (за опит за повторение). */
  callback: string;
  binding: string;
}

/** start → доставчикът („вписан“ е `claims`) → callback, като браузъра. */
export async function ssoLogin(
  h: SsoHarness,
  idp: FakeIdp,
  email: string,
  claims: Record<string, unknown>,
): Promise<SsoAttempt> {
  const start = await fetch(`${h.base}/api/v1/auth/sso/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: h.origin },
    body: JSON.stringify({ email }),
  });
  if (start.status !== 200) throw new Error(`start ${start.status}: ${await start.text()}`);
  const { url } = (await start.json()) as { url: string };
  const binding = cookieFrom(start, 'cc_sso') ?? '';
  idp.next = claims;
  const authz = await fetch(url, { redirect: 'manual' });
  const to = new URL(authz.headers.get('location') ?? `${h.origin}/`);
  const callback = `${to.pathname}${to.search}`;
  return { ...(await finishCallback(h, callback, binding)), callback, binding };
}

export async function finishCallback(
  h: SsoHarness,
  callback: string,
  binding: string | null,
): Promise<{ location: string | null; client: Client | null }> {
  const res = await fetch(`${h.base}${callback}`, {
    redirect: 'manual',
    headers: binding ? { cookie: `cc_sso=${binding}` } : {},
  });
  const token = cookieFrom(res, SESSION_COOKIE);
  let client: Client | null = null;
  if (token) {
    const me = await new Client(h.base, token).get('/api/v1/auth/me');
    client = new Client(h.base, token, me.body.csrfToken as string);
  }
  return { location: res.headers.get('location'), client };
}

export async function seedSsoTenant(slug = 'sso-alfa') {
  const tenant = await db.tenant.create({ data: { slug, name: `Tenant ${slug}` } });
  const company = await db.company.create({
    data: { tenantId: tenant.id, name: 'Installatori Srl' },
  });
  return { tenant, company };
}

export interface LinkAttempt {
  /** HTTP статусът на началото (200 → потокът е тръгнал). */
  start: number;
  /** Кодът на грешката на началото (при start ≠ 200). */
  code: string | null;
  /** Накъде праща callback-ът (`/?sso_link=ok|failed|denied`). */
  location: string | null;
}

/** „Свържи“ от сесията на клиента (парола + TOTP): start → доставчикът (`claims`) → callback. */
export async function selfLink(
  h: SsoHarness,
  idp: FakeIdp,
  client: Client,
  claims: Record<string, unknown>,
  opts: { beforeCallback?: () => Promise<void>; binding?: string | null } = {},
): Promise<LinkAttempt> {
  const start = await client.post('/api/v1/auth/sso/link/start');
  if (start.status !== 200) {
    return { start: start.status, code: (start.body?.code as string) ?? null, location: null };
  }
  const binding = cookieFrom(start, 'cc_sso');
  idp.next = claims;
  const authz = await fetch(start.body.url as string, { redirect: 'manual' });
  const to = new URL(authz.headers.get('location') ?? `${h.origin}/`);
  if (opts.beforeCallback) await opts.beforeCallback();
  const done = await finishCallback(
    h,
    `${to.pathname}${to.search}`,
    opts.binding === undefined ? binding : opts.binding,
  );
  return { start: 200, code: null, location: done.location };
}

/** TXT записът във фалшивия DNS + „Провери“ от конзолата (както администраторът). */
export async function verifyDomainViaDns(
  idp: FakeIdp,
  admin: Client,
  configId: string,
  domain: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const view = await admin.get('/api/v1/admin/sso');
  const cfg = (view.body.configs as Array<Record<string, unknown>>).find((c) => c.id === configId);
  const status =
    (cfg?.domainStatus as Array<{ domain: string; txt: { host: string; value: string } | null }>) ??
    [];
  const row = status.find((d) => d.domain === domain);
  if (row?.txt) idp.txt.set(row.txt.host, [[row.txt.value]]);
  const res = await admin.post(
    `/api/v1/admin/sso/configs/${configId}/domains/${encodeURIComponent(domain)}/verify`,
  );
  return { status: res.status, body: res.body as Record<string, unknown> };
}

/** Интерактивният тест на доставчика от конзолата (като браузъра) → накъде води връщането. */
export async function runProviderTest(
  h: SsoHarness,
  idp: FakeIdp,
  admin: Client,
  configId: string,
  claims: Record<string, unknown>,
): Promise<string | null> {
  const t = await admin.post(`/api/v1/admin/sso/configs/${configId}/test`);
  if (t.status !== 200) throw new Error(`test ${t.status}: ${JSON.stringify(t.body)}`);
  idp.next = claims;
  const back = new URL(
    (await fetch(t.body.url as string, { redirect: 'manual' })).headers.get('location') ?? '',
  );
  return (await finishCallback(h, `${back.pathname}${back.search}`, cookieFrom(t, 'cc_sso')))
    .location;
}

/** Сесия с парола (като `signIn` от helpers.ts) срещу приложението с единен вход. */
export async function signInPassword(h: SsoHarness, user: User): Promise<Client> {
  const s = await withTenant(user.tenantId, () => createSession(h.sessions, user.id));
  if (user.totpEnabledAt) {
    await db.session.update({ where: { id: s.id }, data: { mfaPassed: true } });
  }
  return new Client(h.base, s.token, s.csrfToken);
}
