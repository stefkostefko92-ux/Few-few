import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { config } from '../config.js';
import { logger } from '../logger.js';
import type { AdminCtx } from './context.js';
import { attachSession, limiter, requireCap, requireCsrf } from './guards.js';
import { adminKeys } from './keys.js';
import { renderAdminError } from './render.js';
import { authRouter } from './routes/auth.js';
import { protectedRoutes } from './routes/index.js';
import { totpRouter } from './routes/totp.js';
import type { AdminDeps } from './types.js';

/**
 * Уеб панелът `/admin` (CONTRACT.md §10). Извън търсачките: `noindex` в заглавието и в
 * `X-Robots-Tag`, нищо в sitemap/llms.txt; `no-store` — страниците с лични данни и резервни кодове
 * не остават в кеша на браузъра. Без APP_ENC_KEY панелът е затворен (503) — сайтът си работи.
 */
const DEFAULT_LIMITS = { login: 20, mfa: 10, post: 60 };

function panelHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
}

/** Панелът, когато не е сглобен (няма ключ или зависимости): ясна 503, нищо друго. */
export function unavailableAdminRouter(): Router {
  const router = Router();
  router.use(panelHeaders);
  router.use((req: Request, res: Response) => renderAdminError(req, res, 'unavailable'));
  return router;
}

export function adminRouter(deps: AdminDeps | undefined): Router {
  const encKey = deps ? adminKeys(config()).encKey : null;
  if (!deps || !encKey) return unavailableAdminRouter();

  const ctx: AdminCtx = {
    db: deps.db,
    live: deps.live,
    bridge: deps.bridge,
    agent: deps.agent,
    encKey,
    steamFetch: deps.steamFetch ?? ((url, init) => fetch(url, init)),
    now: deps.now ?? (() => new Date()),
  };
  const limits = { ...DEFAULT_LIMITS, ...deps.limits };

  const router = Router();
  router.use(panelHeaders);
  // Конфигът на плъгин (CONTRACT §14) е до 32 768 знака JSON — кодиран във формата минава общия таван.
  // Само този път получава по-широк; body-parser не парсва второ тяло, затова общият после го прескача.
  router.use(
    '/plugins/:id/config',
    express.urlencoded({ extended: false, limit: '128kb', parameterLimit: 4 }),
  );
  router.use(express.urlencoded({ extended: false, limit: '16kb', parameterLimit: 60 }));
  // Всяко писане в панела: таван на IP за минута (GET-овете са под общия таван на сайта).
  router.use(limiter(limits.post, 60_000, true));
  router.use(attachSession(ctx.db, ctx.now));

  router.use(authRouter(ctx, limits.login));
  router.use(totpRouter(ctx, limits.mfa));
  for (const route of protectedRoutes(ctx)) {
    router[route.method](
      route.path,
      requireCap(route.cap),
      requireCsrf,
      ...(route.before ?? []),
      route.handle,
    );
  }

  router.use((req: Request, res: Response) => renderAdminError(req, res, 'notFound'));
  router.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    // Тяло над тавана, повредено или с твърде много полета (body-parser) — грешка на заявката.
    const status = (error as { status?: unknown } | null)?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      if (!res.headersSent) renderAdminError(req, res, 'badRequest');
      return;
    }
    logger.error(
      { err: error instanceof Error ? error.message : String(error), path: req.path },
      'панел: необработена грешка',
    );
    if (!res.headersSent) renderAdminError(req, res, 'serverError');
  });
  return router;
}
