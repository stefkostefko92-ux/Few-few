import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import {
  apiError,
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
} from '../auth/guards.js';
import {
  createConfig,
  deleteConfig,
  updateConfig,
  type AdminResult,
} from '../services/sso/admin.js';
import { CreateInput, UpdateInput } from '../services/sso/admin-input.js';
import { checkMetadata } from '../services/sso/check.js';
import { beginFlow } from '../services/sso/flow.js';
import {
  CONFIG_INCLUDE,
  configView,
  listIdentities,
  unlinkIdentity,
} from '../services/sso/identities.js';
import { oidcErrorCode, type SsoRuntime } from '../services/sso/provider.js';
import { SSO_CALLBACK_PATH } from '../services/sso/types.js';
import { setFlowCookie } from './auth-sso.js';

/**
 * Конзолата за единния вход (`sso:manage` — администраторът на клиента; §12.4 „MFA federata e
 * policy“): доставчик за вътрешните и по избор за фирма, домейни, режим, доверие в MFA на
 * доставчика, проверка на метаданните и интерактивен „Тест на конфигурацията“. Всичко по tenantId
 * (чужд запис = 404); защитите — на всеки маршрут (рутерът е монтиран на /admin заедно с други).
 * Секретът само влиза — в отговорите е `hasSecret`.
 */

const Id = z.string().min(1).max(40);

export function authSsoAdminRouter(deps: AppDeps, runtime: SsoRuntime | null): Router {
  const router = Router();
  const guard = [requireUser, requireCsrf(deps.publicOrigin), requireCapability('sso:manage')];
  const redirectUri = `${deps.publicOrigin}${SSO_CALLBACK_PATH}`;

  /** Контекстът на промените. Без SSO_KEK (runtime = null) промените са 503 `sso_unavailable`. */
  const ctxOf = (req: Request, rt: SsoRuntime) => ({
    db: deps.db,
    sso: rt.sso,
    cache: rt.cache,
    actor: principalOf(req),
  });

  const send = <T>(res: Response, r: AdminResult<T>, ok: (v: T) => unknown, status = 200) =>
    r.ok ? res.status(status).json(ok(r.value)) : apiError(res, r.status, r.code);

  async function viewOf(tenantId: string, id: string) {
    const cfg = await deps.db.ssoConfig.findFirst({
      where: { id, tenantId },
      include: CONFIG_INCLUDE,
    });
    return cfg ? configView(cfg) : null;
  }

  router.get('/sso', ...guard, async (req, res, next) => {
    try {
      const p = principalOf(req);
      const configs = await deps.db.ssoConfig.findMany({
        where: { tenantId: p.user.tenantId },
        include: CONFIG_INCLUDE,
        orderBy: { createdAt: 'asc' },
      });
      res.json({
        available: runtime !== null,
        redirectUri,
        postLogoutRedirectUri: `${deps.publicOrigin}/`,
        configs: configs.map(configView),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/sso/configs', ...guard, async (req, res, next) => {
    try {
      const body = CreateInput.safeParse(req.body);
      if (!body.success) return apiError(res, 400, 'invalid_input');
      if (!runtime) return apiError(res, 503, 'sso_unavailable');
      const ctx = ctxOf(req, runtime);
      const r = await createConfig(ctx, body.data);
      if (!r.ok) return apiError(res, r.status, r.code);
      res.status(201).json({ config: await viewOf(ctx.actor.user.tenantId, r.value.id) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/sso/configs/:id', ...guard, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      const body = UpdateInput.safeParse(req.body);
      if (!id.success || !body.success) return apiError(res, 400, 'invalid_input');
      if (!runtime) return apiError(res, 503, 'sso_unavailable');
      const ctx = ctxOf(req, runtime);
      const r = await updateConfig(ctx, id.data, body.data);
      if (!r.ok) return apiError(res, r.status, r.code);
      res.json({ config: await viewOf(ctx.actor.user.tenantId, id.data) });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/sso/configs/:id', ...guard, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      if (!runtime) return apiError(res, 503, 'sso_unavailable');
      send(res, await deleteConfig(ctxOf(req, runtime), id.data), () => ({ deleted: true }));
    } catch (err) {
      next(err);
    }
  });

  // Проверка на метаданните (discovery, крайни точки, JWKS) — без вход и без секрета.
  router.post('/sso/configs/:id/check', ...guard, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      if (!runtime) return apiError(res, 503, 'sso_unavailable');
      const cfg = await deps.db.ssoConfig.findFirst({
        where: { id: id.data, tenantId: principalOf(req).user.tenantId },
      });
      if (!cfg) return apiError(res, 404, 'not_found');
      runtime.cache.forget(cfg.id);
      res.json({ check: await checkMetadata(runtime.sso, runtime.cache, cfg) });
    } catch (err) {
      next(err);
    }
  });

  // Интерактивният тест: администраторът влиза при доставчика; връщането записва само флагове
  // (без сесия, без свързване) и води обратно в конзолата.
  router.post('/sso/configs/:id/test', ...guard, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      if (!runtime) return apiError(res, 503, 'sso_unavailable');
      const p = principalOf(req);
      const cfg = await deps.db.ssoConfig.findFirst({
        where: { id: id.data, tenantId: p.user.tenantId },
      });
      if (!cfg) return apiError(res, 404, 'not_found');
      const flowDeps = { db: deps.db, pepper: deps.sessions.pepper, ...runtime };
      let flow: { url: string; binding: string };
      try {
        flow = await beginFlow(flowDeps, cfg, { purpose: 'test', redirectUri, actorId: p.user.id });
      } catch (err) {
        deps.logger.warn(oidcErrorCode(err), 'тест на единния вход: доставчикът не отговаря');
        return apiError(res, 502, 'sso_provider_unreachable');
      }
      setFlowCookie(res, deps.sessions, flow.binding);
      res.json({ url: flow.url });
    } catch (err) {
      next(err);
    }
  });

  router.get('/sso/configs/:id/identities', ...guard, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const list = await listIdentities(deps.db, principalOf(req).user.tenantId, id.data);
      if (!list) return apiError(res, 404, 'not_found');
      res.json({ identities: list });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/sso/identities/:userId', ...guard, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.userId);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      send(res, await unlinkIdentity(deps.db, principalOf(req), id.data), () => ({
        unlinked: true,
      }));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
