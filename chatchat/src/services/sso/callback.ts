import type { PrismaClient, SsoConfig } from '@prisma/client';
import type { Logger } from 'pino';
import { appendAudit } from '../../audit.js';
import { createSession, type SessionDeps } from '../../auth/sessions.js';
import { readExternalLogin, type ExternalLogin } from './claims.js';
import { finishFlow, type FlowDeps, type FlowResult } from './flow.js';
import { recordTest, type TestReport } from './identities.js';
import { resolveUser } from './login.js';
import { emailDomain } from './policy.js';
import { oidcErrorCode } from './provider.js';

/**
 * Връщането от доставчика → вход или резултат от теста. Към човека отиват само три кода
 * (`sso_failed` — техническо/изтекло, `sso_denied` — акаунтът не може да влезе така,
 * `sso_unavailable`) — никога дали акаунт съществува, неактивен е или е в друг клиент. Причината
 * е в одита (`auth.login_failed`, само за платформения администратор) и в лога (само кодове).
 */

export interface CallbackDeps {
  db: PrismaClient;
  logger: Logger;
  sessions: SessionDeps;
  flow: FlowDeps;
}

export type CallbackOutcome =
  | { redirect: string; session?: undefined }
  | { redirect: string; session: { token: string; expiresAt: Date } };

const LOGIN_ERROR = (code: 'sso_failed' | 'sso_denied') => `/?sso_error=${code}`;
const TEST_RESULT = (ok: boolean) => `/admin.html#sso?test=${ok ? 'ok' : 'failed'}`;

async function domainAllowed(db: PrismaClient, cfg: SsoConfig, email: string | null) {
  const domain = email ? emailDomain(email) : null;
  if (!domain) return false;
  return (await db.ssoDomain.count({ where: { configId: cfg.id, domain } })) > 0;
}

async function finishTest(
  deps: CallbackDeps,
  r: FlowResult & { config: SsoConfig | null },
): Promise<CallbackOutcome> {
  const report: TestReport = {
    ok: false,
    failure: r.ok ? null : r.reason,
    emailVerified: false,
    domainAllowed: false,
    amrPresent: false,
    mfa: false,
  };
  if (r.ok) {
    const read = readExternalLogin(r.config, r.claims);
    if (!read.ok) {
      report.failure = read.reason;
    } else {
      report.emailVerified = read.login.email !== null;
      report.domainAllowed = await domainAllowed(deps.db, r.config, read.login.email);
      report.amrPresent = read.login.amrPresent;
      report.mfa = read.login.idpMfa;
      // Успех = протоколът минава И първото свързване е възможно (проверен имейл в позволен домейн).
      report.ok = report.emailVerified && report.domainAllowed;
      if (!report.ok)
        report.failure = report.emailVerified ? 'domain_not_allowed' : 'email_unverified';
    }
  }
  if (r.config) await recordTest(deps.db, r.config, r.actorId, report);
  return { redirect: TEST_RESULT(report.ok) };
}

async function denied(
  deps: CallbackDeps,
  cfg: SsoConfig,
  reason: string,
  userId: string | null,
): Promise<CallbackOutcome> {
  await appendAudit(deps.db, {
    tenantId: cfg.tenantId,
    actorId: userId,
    action: 'auth.login_failed',
    detail: { method: 'sso', reason },
  });
  return { redirect: LOGIN_ERROR('sso_denied') };
}

export async function handleCallback(
  deps: CallbackDeps,
  currentUrl: URL,
  binding: string | null,
): Promise<CallbackOutcome> {
  const r = await finishFlow(deps.flow, currentUrl, binding);
  if (r.purpose === 'test') return finishTest(deps, r);
  if (!r.ok) {
    deps.logger.warn(
      { sso: r.reason, ...(r.error ? oidcErrorCode(r.error) : {}) },
      'единният вход не мина',
    );
    if (r.config) {
      await appendAudit(deps.db, {
        tenantId: r.config.tenantId,
        actorId: null,
        action: 'auth.login_failed',
        detail: { method: 'sso', reason: r.reason },
      });
    }
    return { redirect: LOGIN_ERROR('sso_failed') };
  }
  const cfg = r.config;
  const read = readExternalLogin(cfg, r.claims);
  if (!read.ok) return denied(deps, cfg, read.reason, null);
  const login: ExternalLogin = read.login;
  const resolved = await resolveUser(deps.db, cfg, login);
  if (!resolved.ok) return denied(deps, cfg, resolved.reason, resolved.userId);
  const user = resolved.user;
  const idpMfa = cfg.trustIdpMfa && login.idpMfa;
  const session = await createSession(deps.sessions, user.id, {
    authMethod: 'SSO',
    ssoConfigId: cfg.id,
    mfaViaIdp: idpMfa,
  });
  await deps.db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await appendAudit(deps.db, {
    tenantId: user.tenantId,
    actorId: user.id,
    action: 'auth.login',
    detail: { method: 'sso', provider: cfg.provider, firstLink: resolved.firstLink, idpMfa },
  });
  return { redirect: '/', session: { token: session.token, expiresAt: session.expiresAt } };
}
