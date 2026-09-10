import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config, isProduction } from './config.js';
import { logger } from './logger.js';
import { attachSession } from './auth/sessions.js';
import { can, type Capability } from './auth/rbac.js';
import { agentRouter } from './agent/routes.js';
import type { NonceStore } from './agent/nonce-store.js';
import { iconSprite, renderIcon } from './icons.js';
import * as ui from './admin/presenters.js';
import { sparkline } from './admin/sparkline.js';
import { readFlash } from './admin/helpers.js';
import { accountRouter } from './admin/account-routes.js';
import { auditRouter } from './admin/audit-routes.js';
import { authRouter } from './admin/auth-routes.js';
import { brandRouter } from './admin/brand-routes.js';
import { dashboardRouter } from './admin/dashboard-routes.js';
import { keyRouter } from './admin/key-routes.js';
import { manageRouter } from './admin/manage-routes.js';
import { postRouter } from './admin/post-routes.js';
import { userRouter } from './admin/user-routes.js';
import { healthRouter } from './routes/health.js';

const here = dirname(fileURLToPath(import.meta.url));

export interface ServerDeps {
  nonceStore: NonceStore;
}

export function createServer(deps: ServerDeps): Express {
  const cfg = config();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.TRUST_PROXY);
  app.set('view engine', 'ejs');
  app.set('views', join(here, '..', 'views'));

  // CSP nonce на заявка — нашият единствен скрипт е с nonce, нищо inline без него.
  app.use((req, res, next) => {
    res.locals.cspNonce = randomBytes(16).toString('base64');
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", (_req, res) => `'nonce-${(res as Response).locals.cspNonce}'`],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'", 'https://api.instagram.com'],
          upgradeInsecureRequests: isProduction() ? [] : null,
        },
      },
      hsts: isProduction() ? { maxAge: 63072000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

  // Суровото тяло се пази за HMAC подписа на агента; JSON лимитът е малък нарочно.
  app.use(
    express.json({
      limit: '256kb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: string }).rawBody = buf.toString('utf8');
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: '64kb', parameterLimit: 200 }));
  app.use(cookieParser());
  app.use(
    '/static',
    express.static(join(here, '..', 'public'), { maxAge: isProduction() ? '1d' : 0 }),
  );

  app.use(healthRouter);
  app.use(agentRouter(deps.nonceStore));

  // Човешкият панел: сесия → flash → права в шаблоните.
  app.use(attachSession);
  app.use(readFlash);
  // Спрайтът се чете от диска веднъж — шаблоните получават готовия низ.
  const sprite = iconSprite();
  app.use((_req, res, next) => {
    const role = res.locals.currentRole;
    res.locals.can = (capability: string) => (role ? can(role, capability as Capability) : false);
    res.locals.sprite = sprite;
    res.locals.icon = renderIcon;
    res.locals.ui = ui;
    res.locals.spark = sparkline;
    next();
  });
  app.get('/', (_req, res) => res.redirect('/admin'));
  app.use(authRouter);
  app.use(dashboardRouter);
  app.use(brandRouter);
  app.use(manageRouter);
  app.use(accountRouter);
  app.use(postRouter);
  app.use(userRouter);
  app.use(keyRouter);
  app.use(auditRouter);

  app.use((req, res) => {
    if (req.path.startsWith('/agent/') || req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'Няма такъв маршрут.' });
      return;
    }
    res
      .status(404)
      .render('admin/error', { title: 'Няма такава страница', message: 'Адресът не съществува.' });
  });

  app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err: error.message, path: req.path }, 'необработена грешка в маршрут');
    if (req.path.startsWith('/agent/') || req.path.startsWith('/api/')) {
      res.status(500).json({ error: 'Вътрешна грешка.' });
      return;
    }
    res.status(500).render('admin/error', {
      title: 'Вътрешна грешка',
      message: 'Нещо се обърка. Опитай отново или виж логовете.',
    });
  });

  return app;
}
