import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config, isProduction, mailEnabled } from './config.js';
import { errorMessage, httpLogOptions, logger } from './logger.js';
import { ROOT } from './paths.js';
import { renderError } from './auth/guards.js';
import { can, type Capability } from './auth/roles.js';
import { attachSession } from './auth/sessions.js';
import { readFlash } from './http/flash.js';
import { writeLimiter } from './http/limits.js';
import { applyPrefs, attachPrefs, prefUrl, THEME_PARAM } from './http/prefs.js';
import { DEFAULT_LOCALE, LOCALE_LABEL, LOCALES, isLocale } from './i18n.js';
import { PASSWORD_MIN_LENGTH } from './auth/password.js';
import { accountRouter } from './routes/account.js';
import { auditRouter } from './routes/audit.js';
import { authRouter } from './routes/auth.js';
import { aziendeRouter } from './routes/aziende.js';
import { cestinoRouter } from './routes/cestino.js';
import { ordiniRouter } from './routes/ordini.js';
import { healthRouter } from './routes/health.js';
import { schedeRouter } from './routes/schede.js';
import { usersRouter } from './routes/users.js';

/** Кратък отпечатък на статичните файлове — сменя адреса на CSS/JS при всяка промяна (кешът е дълъг). */
function assetVersion(): string {
  const hash = createHash('sha256');
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (/\.(css|js|svg|woff2)$/.test(name)) hash.update(name).update(readFileSync(file));
    }
  };
  walk(join(ROOT, 'public'));
  return hash.digest('hex').slice(0, 10);
}

/** Грешките на body-parser носят статус; останалите (и не-Error) са 500. */
function errorStatus(error: unknown): number {
  if (typeof error !== 'object' || error === null) return 500;
  if ('status' in error && typeof error.status === 'number') return error.status;
  if ('statusCode' in error && typeof error.statusCode === 'number') return error.statusCode;
  return 500;
}

/** Общото за шаблоните — от middleware-а и от страницата за грешка, паднала преди него. */
function baseLocals(req: Request, res: Response): void {
  const user = req.principal?.user ?? null;
  res.locals.can = (capability: Capability): boolean => (user ? can(user.role, capability) : false);
  res.locals.locales = LOCALES;
  res.locals.localeLabel = LOCALE_LABEL;
  res.locals.themeParam = THEME_PARAM;
  res.locals.mailEnabled = mailEnabled();
  res.locals.passwordMin = PASSWORD_MIN_LENGTH;
  res.locals.path = req.path;
  // Страница след POST (връзката на поканата) не се отваря пак с GET — там превключватели няма.
  res.locals.switchUrl = (key: 'lang' | 'tema', value: string): string | null => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return null;
    if (key === 'lang' && !isLocale(value)) return null;
    return prefUrl(req, key, value);
  };
}

/** Страница за грешка и когато заявката е паднала преди езика (твърде голямо тяло на формата). */
function failRequest(
  req: Request,
  res: Response,
  status: number,
  titleKey: string,
  messageKey: string,
): void {
  if (res.headersSent) return;
  if (!Object.hasOwn(res.locals, 't')) applyPrefs(res, DEFAULT_LOCALE);
  if (!Object.hasOwn(res.locals, 'currentUser')) res.locals.currentUser = null;
  if (!Object.hasOwn(res.locals, 'flash')) res.locals.flash = null;
  if (!Object.hasOwn(res.locals, 'switchUrl')) baseLocals(req, res);
  renderError(res, status, titleKey, messageKey);
}

export function createServer(): Express {
  const cfg = config();
  const app = express();
  const version = assetVersion();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.TRUST_PROXY);
  app.set('view engine', 'ejs');
  app.set('views', join(ROOT, 'views'));

  app.use((_req, res, next) => {
    res.locals.cspNonce = randomBytes(16).toString('base64');
    res.locals.v = version;
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", (_req, res) => `'nonce-${(res as Response).locals.cspNonce}'`],
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
  // Четири бележки по 4000 знака на кирилица са ~100 KB urlencoded, мерките на бутониерите — до 300
  // спирки × 6 полета (~1800 параметъра, ~300 KB). Таванът е над това, не повече.
  app.use(express.urlencoded({ extended: false, limit: '1mb', parameterLimit: 2500 }));
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

  // Всичко отвъд статиката: сесия → език и тема → еднократно съобщение → общото за шаблоните.
  app.use(attachSession);
  app.use(attachPrefs);
  app.use(readFlash);
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Данните са на поканени хора — нито браузърът, нито прокси пазят страниците.
    res.set('Cache-Control', 'no-store');
    baseLocals(req, res);
    next();
  });
  app.use(writeLimiter);
  app.use(authRouter);
  app.use(accountRouter);
  app.use(schedeRouter);
  app.use(cestinoRouter);
  app.use(ordiniRouter);
  app.use(usersRouter);
  app.use(aziendeRouter);
  app.use(auditRouter);

  app.use((req: Request, res: Response) => {
    failRequest(req, res, 404, 'error.notFoundTitle', 'error.notFound');
  });

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    // Грешка на заявката (твърде голямо тяло, счупено кодиране) остава 4xx и не е тревога: без стек.
    const status = errorStatus(error);
    if (status >= 400 && status < 500) {
      logger.warn({ status, path: req.path }, 'отказана заявка');
      failRequest(
        req,
        res,
        status,
        'error.title',
        status === 413 ? 'error.tooLarge' : 'error.badInput',
      );
      return;
    }
    logger.error(
      {
        err: errorMessage(error),
        stack:
          error instanceof Error ? error.stack?.split('\n').slice(0, 4).join(' | ') : undefined,
        path: req.path,
      },
      'необработена грешка',
    );
    failRequest(req, res, 500, 'error.internalTitle', 'error.internal');
  });

  return app;
}
