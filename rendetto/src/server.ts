import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config, isProduction } from './config.js';
import { logger, httpLogOptions } from './logger.js';
import { ROOT } from './paths.js';
import { attachSession } from './auth/sessions.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './auth/password.js';
import { isStaff } from './auth/rbac.js';
import { renderError } from './auth/guards.js';
import { accountWriteLimiter } from './http/limits.js';
import { readFlash } from './http/flash.js';
import { attachLocale, localeSwitchUrl } from './http/locale.js';
import { LOCALE_LABEL, LOCALES, isLocale } from './i18n.js';
import { planView, TRIAL_DAYS } from './plans/plan.js';
import { accountRouter } from './routes/account.js';
import { adminRouter } from './routes/admin/index.js';
import { appRouter } from './routes/app.js';
import { authRouter } from './routes/auth.js';
import { devRouter } from './routes/dev.js';
import { healthRouter } from './routes/health.js';
import { landingRouter } from './routes/landing.js';
import { seoRouter } from './routes/seo.js';

/** Кратък отпечатък на статичните файлове — сменя адреса на CSS/JS при всяка промяна (кешът е дълъг). */
function assetVersion(): string {
  const hash = createHash('sha256');
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (/\.(css|js|svg|woff2)$/.test(name)) hash.update(name).update(readFileSync(file));
    }
  };
  walk(join(ROOT, 'public'));
  return hash.digest('hex').slice(0, 10);
}

/** Парчетата, които editor.js внася веднага (three.js) — страницата ги зарежда успоредно с него. */
function editorPreload(): string[] {
  const file = join(ROOT, 'public', 'editor', 'preload.json');
  if (!existsSync(file)) return [];
  const list: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return Array.isArray(list)
    ? list.filter((p): p is string => typeof p === 'string' && /^chunks\/[\w-]+\.js$/.test(p))
    : [];
}

/** Грешките на body-parser и http-errors носят статус; останалите са 500. */
type HttpError = Error & { status?: number; statusCode?: number; type?: string };

export function createServer(): Express {
  const cfg = config();
  const app = express();
  const version = assetVersion();
  const preload = editorPreload();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.TRUST_PROXY);
  app.set('view engine', 'ejs');
  app.set('views', join(ROOT, 'views'));

  app.use((_req, res, next) => {
    res.locals.cspNonce = randomBytes(16).toString('base64');
    res.locals.v = version;
    res.locals.editorPreload = preload;
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            (_req, res) => `'nonce-${(res as Response).locals.cspNonce as string}'`,
          ],
          scriptSrcAttr: ["'none'"],
          styleSrc: ["'self'"],
          styleSrcAttr: ["'none'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          manifestSrc: ["'self'"],
          ...(isProduction() ? { upgradeInsecureRequests: [] } : {}),
        },
      },
      hsts: isProduction() ? { maxAge: 63072000, includeSubDomains: true, preload: false } : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      frameguard: { action: 'deny' },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use((_req, res, next) => {
    res.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), browsing-topics=()',
    );
    next();
  });
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) => req.url === '/health' || (req.url ?? '').startsWith('/static/'),
      },
      ...httpLogOptions,
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: '32kb', parameterLimit: 100 }));
  app.use(cookieParser());
  app.use(
    '/static',
    express.static(join(ROOT, 'public'), {
      maxAge: isProduction() ? '30d' : 0,
      immutable: isProduction(),
      setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff'),
    }),
  );

  app.use(healthRouter);
  app.use(seoRouter);
  app.use(landingRouter);

  // Всичко отвъд витрината: сесия → език → еднократно съобщение → общите неща за шаблоните.
  app.use(attachSession);
  app.use(attachLocale);
  app.use(readFlash);
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.locals.locales = LOCALES;
    res.locals.localeLabel = LOCALE_LABEL;
    res.locals.langUrl = (locale: string) =>
      isLocale(locale) ? localeSwitchUrl(req, locale) : req.originalUrl;
    res.locals.path = req.path;
    res.locals.isStaff = isStaff;
    const user = req.principal?.user;
    res.locals.headerPlan = user && req.principal?.session.mfaPassed ? planView(user) : null;
    res.locals.contact = cfg.CONTACT_EMAIL;
    res.locals.trialDays = TRIAL_DAYS;
    res.locals.passwordMin = PASSWORD_MIN_LENGTH;
    res.locals.passwordMax = PASSWORD_MAX_LENGTH;
    next();
  });
  app.use(['/app', '/account', '/admin'], accountWriteLimiter);
  app.use(authRouter);
  app.use(accountRouter);
  app.use(appRouter);
  app.use(adminRouter);
  if (!isProduction() && cfg.RENDETTO_DEV_OUTBOX === '1') app.use(devRouter);

  app.use((req: Request, res: Response) => {
    if (req.path.includes('/api/')) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    renderError(res, 404, 'error.notFoundTitle', 'error.notFoundText');
  });

  app.use((error: HttpError, req: Request, res: Response, _next: NextFunction) => {
    // Грешка на заявката (счупен JSON, твърде голямо тяло…) остава 4xx и не е тревога: без стек.
    const status = error.status ?? error.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      logger.warn({ status, type: error.type, path: req.path }, 'отказана заявка');
      if (res.headersSent) return;
      if (req.path.includes('/api/')) {
        res.status(status).json({ error: status === 413 ? 'too large' : 'bad request' });
        return;
      }
      if (!res.locals.t) attachLocale(req, res, () => undefined);
      renderError(res, status, 'error.title', status === 413 ? 'error.tooLarge' : 'error.badInput');
      return;
    }
    logger.error(
      {
        err: error.message,
        stack: error.stack?.split('\n').slice(0, 4).join(' | '),
        path: req.path,
      },
      'необработена грешка',
    );
    if (res.headersSent) return;
    if (req.path.includes('/api/')) {
      res.status(500).json({ error: 'internal' });
      return;
    }
    if (!res.locals.t) attachLocale(req, res, () => undefined);
    renderError(res, 500, 'error.internalTitle', 'error.internalText');
  });

  return app;
}
