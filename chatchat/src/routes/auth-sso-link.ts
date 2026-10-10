import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AppDeps } from '../app.js';
import { apiError, principalOf, requireCsrf, requireSession } from '../auth/guards.js';
import { sharedStore } from '../auth/rate-limit.js';
import { linkProofOf } from '../auth/sso-proof.js';
import { beginFlow } from '../services/sso/flow.js';
import { covers, ownerLinkRequired, userScopeKey } from '../services/sso/policy.js';
import { oidcErrorCode, type SsoRuntime } from '../services/sso/provider.js';
import { SSO_CALLBACK_PATH } from '../services/sso/types.js';
import { setFlowCookie } from './sso-cookie.js';

/**
 * Свързване от собственика („Свържи с Microsoft/доставчика“): единственият път за акаунт, който не
 * се свързва по имейл при вход (администраторът на клиента, всеки с включен локален TOTP).
 * Достъпно със сесия БЕЗ `requireUser` — сесията само за свързване (REQUIRED) трябва да стигне тук;
 * затова проверките са изрични: сесия с парола, минат локален TOTP, пресен вход, CSRF. Връщането —
 * общият callback (`services/sso/link.ts`).
 */

export function authSsoLinkRouter(deps: AppDeps, runtime: SsoRuntime | null): Router {
  const router = Router();
  const redirectUri = `${deps.publicOrigin}${SSO_CALLBACK_PATH}`;
  const limiter = rateLimit({
    store: sharedStore('sso-link'),
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
    handler: (_req, res) => apiError(res, 429, 'too_many_attempts'),
  });

  /** Доставчикът, който покрива човека (включен), и самият акаунт от базата. */
  async function coverage(userId: string) {
    const user = await deps.db.user.findUniqueOrThrow({ where: { id: userId } });
    const scopeKey = userScopeKey(user);
    const cfg = scopeKey
      ? await deps.db.ssoConfig.findUnique({
          where: { tenantId_scopeKey: { tenantId: user.tenantId, scopeKey } },
        })
      : null;
    return { user, cfg: cfg && cfg.enabled && covers(cfg, user) ? cfg : null };
  }

  // Състоянието за „Акаунт и сигурност“ — без идентификатори при доставчика.
  router.get('/link', requireSession, async (req, res, next) => {
    try {
      const p = principalOf(req);
      const { user, cfg } = await coverage(p.user.id);
      const link = await deps.db.externalIdentity.findUnique({
        where: { userId: user.id },
        select: { configId: true, linkMethod: true, createdAt: true },
      });
      const own = cfg && link?.configId === cfg.id ? link : null;
      res.json({
        available: runtime !== null && cfg !== null && user.role !== 'PLATFORM_ADMIN',
        provider: cfg?.provider ?? null,
        label: cfg?.displayName || null,
        linked: own !== null,
        linkMethod: own?.linkMethod ?? null,
        linkedAt: own?.createdAt ?? null,
        ownerLinkRequired: ownerLinkRequired(user),
        mfaEnabled: user.totpEnabledAt !== null,
        authMethod: p.session.authMethod === 'SSO' ? 'sso' : 'password',
        linkOnly: p.session.ssoLinkOnly === true,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/link/start',
    requireSession,
    requireCsrf(deps.publicOrigin),
    limiter,
    async (req, res, next) => {
      try {
        if (!runtime) return apiError(res, 503, 'sso_unavailable');
        const p = principalOf(req);
        const { user, cfg } = await coverage(p.user.id);
        // Операторът на платформата — никога през доставчик (и не се свързва).
        if (user.role === 'PLATFORM_ADMIN') return apiError(res, 403, 'sso_platform_admin');
        if (!cfg) return apiError(res, 404, 'sso_not_configured');
        // Собственикът доказва себе си с фактора, който само той държи.
        if (user.totpEnabledAt === null) return apiError(res, 409, 'sso_link_mfa_required');
        const proof = await linkProofOf(deps.db, p.session.id);
        if (proof === 'not_password') return apiError(res, 409, 'sso_link_password_required');
        if (proof === 'mfa_missing') return apiError(res, 401, 'mfa_required');
        if (proof === 'stale') return apiError(res, 409, 'sso_link_reauth');
        let flow: { url: string; binding: string };
        try {
          flow = await beginFlow({ db: deps.db, pepper: deps.sessions.pepper, ...runtime }, cfg, {
            purpose: 'link',
            redirectUri,
            loginHint: user.email,
            actorId: user.id,
            sessionId: p.session.id,
          });
        } catch (err) {
          deps.logger.warn(oidcErrorCode(err), 'свързване: доставчикът не отговаря');
          return apiError(res, 502, 'sso_provider_unreachable');
        }
        setFlowCookie(res, deps.sessions, flow.binding);
        res.json({ url: flow.url });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
