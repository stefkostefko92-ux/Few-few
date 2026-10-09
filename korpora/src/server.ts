import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config, isProduction } from './config.js';
import { errorMessage, logger, httpLogOptions } from './logger.js';
import { ROOT } from './paths.js';
import { attachSession } from './auth/sessions.js';
import { LOCK_MINUTES, MAX_FAILED_LOGINS } from './auth/lock.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './auth/password.js';
import { isStaff } from './auth/rbac.js';
import { sendError } from './auth/guards.js';
import { assetVersion } from './http/asset-version.js';
import { accountWriteLimiter } from './http/limits.js';
import { readFlash } from './http/flash.js';
import { attachLocale, localeSwitchUrl } from './http/locale.js';
import { LOCALE_LABEL, LOCALES, isLocale } from './i18n.js';
import { planView, TRIAL_DAYS } from './plans/plan.js';
import { legalPath, PATHS } from './seo/paths.js';
import { isSuccessfulLogin } from './services/login-outcome.js';
import { accountRouter } from './routes/account.js';
import { adminRouter } from './routes/admin/index.js';
import { appRouter } from './routes/app.js';
import { authRouter } from './routes/auth.js';
import { devRouter } from './routes/dev.js';
import { healthRouter } from './routes/health.js';
import { landingRouter } from './routes/landing.js';
import { seoRouter } from './routes/seo.js';

/** Парчетата, които editor.js внася веднага (three.js) — страницата ги зарежда успоредно с него. */
function editorPreload(): string[] {
  const file = join(ROOT, 'public', 'editor', 'preload.json');
  if (!existsSync(file)) return [];
  const list: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return Array.isArray(list)
    ? list.filter((p): p is string => typeof p === 'string' && /^chunks\/[\w-]+\.js$/.test(p))
    : [];
}

/** Грешките на body-parser и http-errors носят статус; останалите (и не-Error) са 500. */
function errorStatus(error: unknown): number {
  if (typeof error !== 'object' || error === null) return 500;
  if ('status' in error && typeof error.status === 'number') return error.status;
  if ('statusCode' in error && typeof error.statusCode === 'number') return error.statusCode;
  return 500;
}

/** Видът грешка на body-parser (`entity.too.large`, `entity.parse.failed`…) — за лога. */
function errorType(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('type' in error)) return undefined;
  return typeof error.type === 'string' ? error.type : undefined;
}

/**
 * Последната линия: JSON по общия договор `{ error, code }` или страница за грешка. Грешка преди
 * `attachLocale` (твърде голямо тяло на формата) още няма език — слага се тук.
 */
function failRequest(
  req: Request,
  res: Response,
  status: number,
  titleKey: string,
  messageKey: string,
): void {
  if (res.headersSent) return;
  if (!Object.hasOwn(res.locals, 't')) attachLocale(req, res, () => undefined);
  sendError(req, res, status, titleKey, messageKey);
}

export function createServer(): Express {
  const cfg = config();
  const app = express();
  const version = assetVersion(join(ROOT, 'public'));
  const preload = editorPreload();
  app.disable('x-powered-by');
  // Всяка страница носи nonce на своя отговор (CSP), затова ETag от тялото е различен при всяка заявка и условната
  // заявка никога не връща 304. 304 със стара страница пък би сблъскал стария nonce с новия CSP. Без ETag: страницата
  // се пази по Cache-Control; статичните файлове имат свой ETag (express.static), каталогът — собствен.
  app.set('etag', false);
  app.set('trust proxy', cfg.TRUST_PROXY);
  app.set('view engine', 'ejs');
  app.set('views', join(ROOT, 'views'));

  app.use((_req, res, next) => {
    res.locals.cspNonce = randomBytes(16).toString('base64');
    res.locals.v = version;
    res.locals.editorPreload = preload;
    // адресите по език — за всяка страница, и за грешката преди сесията
    res.locals.paths = PATHS;
    res.locals.legalPath = legalPath;
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
    // Страница след POST (QR, резервните кодове) или с изразходван токен не се отваря пак с GET —
    // там превключвател няма (null), иначе смяната на езика води към 404 или към „връзката не работи“.
    res.locals.langUrl = (locale: string): string | null => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || res.locals.hideLangs === true)
        return null;
      return isLocale(locale) ? localeSwitchUrl(req, locale) : req.originalUrl;
    };
    res.locals.path = req.path;
    res.locals.isStaff = isStaff;
    res.locals.isGoodLogin = isSuccessfulLogin;
    const user = req.principal?.user;
    res.locals.headerPlan = user && req.principal?.session.mfaPassed ? planView(user) : null;
    res.locals.contact = cfg.CONTACT_EMAIL;
    res.locals.trialDays = TRIAL_DAYS;
    res.locals.passwordMin = PASSWORD_MIN_LENGTH;
    res.locals.passwordMax = PASSWORD_MAX_LENGTH;
    // таванът на грешните опити и заключването — за подсказката на входа (не се пишат на ръка)
    res.locals.lockout = { attempts: MAX_FAILED_LOGINS, minutes: LOCK_MINUTES };
    next();
  });
  app.use(['/app', '/account', '/admin'], accountWriteLimiter);
  app.use(authRouter);
  app.use(accountRouter);
  app.use(appRouter);
  app.use(adminRouter);
  if (!isProduction() && cfg.KORPORA_DEV_OUTBOX === '1') app.use(devRouter);

  app.use((req: Request, res: Response) => {
    failRequest(req, res, 404, 'error.notFoundTitle', 'error.notFoundText');
  });

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    // Грешка на заявката (счупен JSON, твърде голямо тяло…) остава 4xx и не е тревога: без стек.
    const status = errorStatus(error);
    if (status >= 400 && status < 500) {
      logger.warn({ status, type: errorType(error), path: req.path }, 'отказана заявка');
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
    failRequest(req, res, 500, 'error.internalTitle', 'error.internalText');
  });

  return app;
}
