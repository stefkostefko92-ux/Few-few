import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { BRAND } from './brand.js';
import { COMPANY } from './company.js';
import { config, isProduction } from './config.js';
import { errorMessage, logger, safeLogPath } from './logger.js';
import { legalPath, type LegalDocumentId } from './legal/documents.js';
import { ROOT } from './paths.js';
import { isLocale, translator, type Locale } from './i18n.js';
import { assetVersion } from './http/assets.js';
import { SITE_PAGES } from './seo/pages.js';
import { healthRouter } from './routes/health.js';
import { seoRouter } from './routes/seo.js';
import { siteRouter } from './routes/site.js';
import { pwaRouter } from './routes/pwa.js';
import { legalRouter } from './routes/legal.js';
import { mountApp } from './routes/mount.js';
import { newsFeedRouter } from './routes/news.js';

/** Грешките на body-parser носят статус; останалите (и не-Error) са 500. */
function errorStatus(error: unknown): number {
  if (typeof error !== 'object' || error === null) return 500;
  if ('status' in error && typeof error.status === 'number') return error.status;
  if ('statusCode' in error && typeof error.statusCode === 'number') return error.statusCode;
  return 500;
}

/** Езикът на страницата за грешка — по пътя (`/en/...` → английски). */
function localeOfPath(path: string): Locale {
  return path === '/en' || path.startsWith('/en/') ? 'en' : 'bg';
}

function renderError(req: Request, res: Response, status: 404 | 500): void {
  if (res.headersSent) return;
  const locale = localeOfPath(req.path);
  res.locals.lang = locale;
  res.locals.htmlLang = locale;
  res.locals.t = translator(locale, false);
  res.locals.brand = BRAND;
  res.locals.company = COMPANY;
  res.locals.urls = Object.fromEntries(SITE_PAGES.map((page) => [page.id, page.paths[locale]]));
  res.status(status).render(`errors/${status}`);
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
    // Връзките към правните документи — на езика, който изгледът е избрал (`lang`), при извикването.
    res.locals.legalUrl = (id: LegalDocumentId): string =>
      legalPath(id, isLocale(res.locals.lang) ? res.locals.lang : 'bg');
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
      // Само методът, пътят без заявката и без токени, и статусът — без хедъри, IP и тела.
      serializers: {
        req: (req: { method?: string; url?: string }) => ({
          method: req.method,
          url: safeLogPath(req.url ?? ''),
        }),
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      },
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
  app.use(
    express.static(join(ROOT, 'public'), {
      index: false,
      maxAge: isProduction() ? '365d' : 0,
      immutable: isProduction(),
    }),
  );
  app.use(cookieParser());

  app.use(healthRouter());
  app.use(pwaRouter());
  app.use(seoRouter());
  app.use(siteRouter());
  app.use(newsFeedRouter());
  app.use(legalRouter());
  mountApp(app);

  app.use((req, res) => renderError(req, res, 404));
  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const status = errorStatus(error);
    if (status >= 500) logger.error({ err: errorMessage(error) }, 'грешка в заявката');
    if (status === 404 || status === 500) return renderError(req, res, status);
    res.status(status).type('text/plain').send(String(status));
  });
  return app;
}
