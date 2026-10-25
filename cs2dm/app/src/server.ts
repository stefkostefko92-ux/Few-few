import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { adminRouter } from './admin/index.js';
import type { AdminDeps } from './admin/types.js';
import { config, isProduction } from './config.js';
import type { Repo } from './data/repo.js';
import { LOCALES, isLocale, localeFromHeader, translatorFor, type Locale } from './i18n.js';
import type { LiveSource } from './live.js';
import { httpLogOptions, logger } from './logger.js';
import { healthRouter, type HealthChecks } from './routes/health.js';
import { cupRouter } from './routes/cup.js';
import { matchesRouter } from './routes/matches.js';
import { AVATAR_ORIGINS, pagesRouter } from './routes/pages.js';
import { playerRouter } from './routes/player.js';
import { reportRouter } from './routes/report.js';
import { rootRouter } from './routes/root.js';
import { buildHead, pagePath } from './seo.js';
import { PUBLIC_DIR, renderPage } from './view.js';

const here = dirname(fileURLToPath(import.meta.url));

export interface ServerDeps {
  repo: Repo;
  live: LiveSource;
  health: HealthChecks;
  now?: () => Date;
  /** Таван на заявките на минута от един адрес (тестовете го вдигат). */
  rateLimitPerMinute?: number;
  /** Уеб панелът (етап 2). Без него `/admin` отговаря с 503 — публичната част работи. */
  admin?: AdminDeps;
}

/** Езикът на страница за грешка: от пътя (`/en/…`), иначе от браузъра. */
function errorLocale(req: Request): Locale {
  const prefix = req.path.split('/')[1];
  return isLocale(prefix) ? prefix : localeFromHeader(req.get('accept-language'));
}

type ErrorKind = 'notFound' | 'serverError' | 'tooMany';

function renderError(req: Request, res: Response, kind: ErrorKind, status: number): void {
  const locale = errorLocale(req);
  const t = translatorFor(locale);
  res.locals.locale = locale;
  res.locals.t = t;
  const head = buildHead({
    locale,
    title: t(`meta.${kind}.title`),
    description: t(`meta.${kind}.description`),
    keywords: t('meta.error.keywords'),
    path: req.path,
    pathFor: (code) => pagePath(code, 'home'),
    crumbs: [{ name: t('nav.home'), path: pagePath(locale, 'home') }],
    noindex: true,
    ogImageAlt: t('meta.ogAlt'),
  });
  res.set('X-Robots-Tag', 'noindex');
  renderPage(res, 'error', locale, 'error', head, { kind, status }, status, (error) => {
    logger.error({ err: error.message }, 'страницата за грешка не се рендерира');
    if (!res.headersSent) res.status(status).type('text/plain').send(String(status));
  });
}

export function createServer(deps: ServerDeps): Express {
  const cfg = config();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.TRUST_PROXY);
  app.set('view engine', 'ejs');
  app.set('views', join(here, '..', 'views'));
  app.set('strict routing', false);

  // CSP nonce на заявка — за JSON-LD блока; нашият единствен скрипт е външен файл от 'self'.
  app.use((_req, res, next) => {
    res.locals.cspNonce = randomBytes(16).toString('base64');
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", (_req, res) => `'nonce-${(res as Response).locals.cspNonce}'`],
          styleSrc: ["'self'"],
          // Аватарите на Steam (само когато играчът е влизал в сайта) — и нищо друго отвън.
          imgSrc: ["'self'", 'data:', ...AVATAR_ORIGINS],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          manifestSrc: ["'self'"],
          upgradeInsecureRequests: isProduction() ? [] : null,
        },
      },
      // HSTS го задава nginx-ът на хоста (един източник за заглавието, и за неговите 502/503).
      hsts: false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use((_req, res, next) => {
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
    next();
  });
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/health' },
      ...httpLogOptions,
    }),
  );

  app.use(
    '/static',
    express.static(PUBLIC_DIR, {
      maxAge: isProduction() ? '30d' : 0,
      index: false,
      fallthrough: true,
    }),
  );
  app.use(healthRouter(deps.health));

  // Ограничението държи IP само в паметта за прозореца (1 минута) — нищо не се записва.
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: deps.rateLimitPerMinute ?? 120,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (req, res) => renderError(req, res, 'tooMany', 429),
    }),
  );

  // Публичната част е само GET/HEAD; POST се приема единствено от формите на панела (`/admin`),
  // където всяка минава през сесия, права и CSRF.
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    if (req.method === 'POST' && (req.path === '/admin' || req.path.startsWith('/admin/'))) {
      return next();
    }
    res.set('Allow', 'GET, HEAD').status(405).type('text/plain').send('Method Not Allowed');
  });

  // Един адрес на страница: `/bg/leaderboard/` → `/bg/leaderboard` (началото е `/bg/`).
  app.use((req, res, next) => {
    const path = req.path;
    const isLocaleRoot = LOCALES.some((locale) => path === `/${locale}/`);
    if (path.length > 1 && path.endsWith('/') && !isLocaleRoot && !path.startsWith('//')) {
      const search = req.originalUrl.includes('?')
        ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
        : '';
      res.redirect(301, `${path.replace(/\/+$/, '')}${search}`);
      return;
    }
    next();
  });

  app.use('/admin', adminRouter(deps.admin));
  app.use(rootRouter(deps.repo));
  for (const locale of LOCALES) {
    app.use(`/${locale}`, pagesRouter(locale, { repo: deps.repo, live: deps.live, now: deps.now }));
    app.use(
      `/${locale}`,
      matchesRouter(locale, { repo: deps.repo, live: deps.live, now: deps.now }),
    );
    app.use(
      `/${locale}`,
      playerRouter(locale, { repo: deps.repo, live: deps.live, now: deps.now }),
    );
    app.use(
      `/${locale}`,
      reportRouter(locale, { repo: deps.repo, live: deps.live, now: deps.now }),
    );
    app.use(`/${locale}`, cupRouter(locale, { repo: deps.repo, live: deps.live, now: deps.now }));
  }

  app.use((req, res) => renderError(req, res, 'notFound', 404));

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: message, path: req.path }, 'необработена грешка в маршрут');
    if (res.headersSent) return;
    renderError(req, res, 'serverError', 500);
  });

  return app;
}
