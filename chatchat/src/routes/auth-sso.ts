import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import * as oidc from 'openid-client';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { sharedStore } from '../auth/rate-limit.js';
import { appendAudit } from '../audit.js';
import { withTenant, withTenantIfKnown } from '../db/tenant-context.js';
import {
  apiError,
  principalOf,
  requireCsrf,
  requireSameOrigin,
  requireSession,
} from '../auth/guards.js';
import {
  clearSessionCookie,
  readCookie,
  revokeSession,
  setSessionCookie,
} from '../auth/sessions.js';
import { handleCallback } from '../services/sso/callback.js';
import { beginFlow, clientSecretOf, SSO_COOKIE, tenantOfState } from '../services/sso/flow.js';
import { configForEmail, tenantForEmailDomain } from '../services/sso/policy.js';
import { oidcErrorCode, type SsoRuntime } from '../services/sso/provider.js';
import { SSO_CALLBACK_PATH } from '../services/sso/types.js';
import { authSsoLinkRouter } from './auth-sso-link.js';
import { clearFlowCookie, setFlowCookie } from './sso-cookie.js';

/**
 * Единният вход (OIDC Authorization Code + PKCE; Microsoft Entra ID и общ OIDC — §14.4, §15.1).
 * Публични пътища (човекът още не е вписан): откриване по ДОКАЗАНИЯ домейн, начало, връщане от
 * доставчика; изходът иска сесия + CSRF; свързването от собственика — `auth-sso-link.ts`.
 * Отговорите не издават дали акаунт съществува: откриването и началото гледат само домейна. CSRF:
 * началото е POST с проверка на Origin; връщането е GET от доставчика — пази го еднократният
 * `state`, вързан към браузъра с бисквитката `cc_sso` (+ PKCE + nonce).
 */

const Email = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

/**
 * Лимит по IP (§15.1): офис зад един NAT влиза наведнъж — по-широк от този на паролата.
 * Откриването е само индексирано търсене по домейн (без потребители) — най-широкото.
 */
function limiter(limit: number, name: string) {
  return rateLimit({
    store: sharedStore(name),
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => apiError(res, 429, 'too_many_attempts'),
  });
}

export function authSsoRouter(deps: AppDeps, runtime: SsoRuntime | null): Router {
  const router = Router();
  const redirectUri = `${deps.publicOrigin}${SSO_CALLBACK_PATH}`;
  const flowDeps = runtime
    ? { db: deps.db, pepper: deps.sessions.pepper, sso: runtime.sso, cache: runtime.cache }
    : null;

  // Кой бутон да покаже входът — само по домейна (еднакво за съществуващ и несъществуващ акаунт).
  router.post(
    '/discover',
    limiter(300, 'sso-discover'),
    requireSameOrigin(deps.publicOrigin),
    async (req, res, next) => {
      try {
        const parsed = Email.safeParse(req.body);
        if (!parsed.success || !runtime) return res.json({ sso: null });
        const { email } = parsed.data;
        const tenantId = await tenantForEmailDomain(deps.db, email);
        const cfg = await withTenantIfKnown(tenantId, () => configForEmail(deps.db, email));
        res.json({
          sso: cfg ? { provider: cfg.provider, label: cfg.displayName || null } : null,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/start',
    limiter(40, 'sso-start'),
    requireSameOrigin(deps.publicOrigin),
    async (req, res, next) => {
      try {
        const parsed = Email.safeParse(req.body);
        if (!parsed.success) return apiError(res, 400, 'invalid_input');
        if (!flowDeps) return apiError(res, 503, 'sso_unavailable');
        const { email } = parsed.data;
        // Доставчикът и записът на започнатия вход — в контекста на клиента му (под RLS).
        const tenantId = await tenantForEmailDomain(deps.db, email);
        const cfg = await withTenantIfKnown(tenantId, () => configForEmail(deps.db, email));
        if (!cfg) return apiError(res, 404, 'sso_not_configured');
        let flow: { url: string; binding: string };
        try {
          flow = await withTenant(cfg.tenantId, () =>
            beginFlow(flowDeps, cfg, { purpose: 'login', redirectUri, loginHint: email }),
          );
        } catch (err) {
          deps.logger.warn(oidcErrorCode(err), 'доставчикът на единния вход не отговаря');
          return apiError(res, 502, 'sso_provider_unreachable');
        }
        setFlowCookie(res, deps.sessions, flow.binding);
        res.json({ url: flow.url });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/callback', limiter(40, 'sso-callback'), async (req, res, next) => {
    try {
      const binding = readCookie(req, SSO_COOKIE);
      clearFlowCookie(res, deps.sessions);
      if (!flowDeps) return res.redirect(303, '/?sso_error=sso_unavailable');
      // Публичният адрес (не Host зад проксито): от него openid-client взима redirect_uri.
      const currentUrl = new URL(req.originalUrl, deps.publicOrigin);
      // Клиентът — по върнатия state (тесният път); входът, сесията и одитът — под RLS в контекста му.
      const tenantId = await tenantOfState(flowDeps, currentUrl);
      const outcome = await withTenantIfKnown(tenantId, () =>
        handleCallback(
          { db: deps.db, logger: deps.logger, sessions: deps.sessions, flow: flowDeps },
          currentUrl,
          binding,
        ),
      );
      if (outcome.session) {
        setSessionCookie(res, deps.sessions, outcome.session.token, outcome.session.expiresAt);
      }
      res.redirect(303, outcome.redirect);
    } catch (err) {
      // Това е навигация на браузъра, не заявка на UI: вместо JSON 500 — екранът за вход.
      deps.logger.error(oidcErrorCode(err), 'единният вход: неочаквана грешка при връщането');
      if (res.headersSent) return next(err);
      res.redirect(303, '/?sso_error=sso_failed');
    }
  });

  // Изход: локален винаги; при SSO сесия и включен „изход при доставчика“ — и адресът за него.
  router.post('/logout', requireSession, requireCsrf(deps.publicOrigin), async (req, res, next) => {
    try {
      const p = principalOf(req);
      const session = await deps.db.session.findUnique({
        where: { id: p.session.id },
        select: { authMethod: true, ssoConfig: true },
      });
      await revokeSession(deps.db, p);
      await appendAudit(deps.db, {
        tenantId: p.user.tenantId,
        actorId: p.user.id,
        action: 'auth.logout',
        detail: { method: session?.authMethod === 'SSO' ? 'sso' : 'password' },
      });
      clearSessionCookie(res, deps.sessions);
      let endSessionUrl: string | null = null;
      const cfg = session?.ssoConfig;
      if (flowDeps && cfg?.idpLogout && cfg.tenantId === p.user.tenantId) {
        try {
          const client = await flowDeps.cache.get(cfg, await clientSecretOf(flowDeps, cfg));
          if (client.serverMetadata().end_session_endpoint) {
            const url = oidc.buildEndSessionUrl(client, {
              post_logout_redirect_uri: `${deps.publicOrigin}/`,
            });
            const secure = url.protocol === 'https:' || flowDeps.sso.allowInsecureHttp;
            endSessionUrl = secure ? url.href : null;
          }
        } catch (err) {
          // Локалният изход вече е факт — доставчикът е само удобство.
          deps.logger.warn(oidcErrorCode(err), 'изход при доставчика — пропуснат');
        }
      }
      res.json({ endSessionUrl });
    } catch (err) {
      next(err);
    }
  });

  // Свързване от собственика (сесия с парола + TOTP) — под същия път (бисквитката на потока).
  router.use(authSsoLinkRouter(deps, runtime));

  return router;
}
