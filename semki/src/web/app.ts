// Express приложението: сигурност, health, вход и страниците на дашборда.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { createAuth } from './auth.js';
import { WebKit, type WebDeps } from './context.js';
import { createPages } from './pages.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function trustProxyValue(raw: string): string | number | boolean {
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw === 'true' || raw === 'false') return raw === 'true';
  return raw;
}

export function createWebApp(deps: WebDeps): express.Express {
  const kit = new WebKit(deps);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxyValue(deps.trustProxy));
  app.set('view engine', 'ejs');
  app.set('views', path.join(ROOT, 'views'));

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'https://cdn.discordapp.com', 'data:'],
          styleSrc: ["'self'"],
          scriptSrc: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          objectSrc: ["'none'"],
        },
      },
      referrerPolicy: { policy: 'same-origin' },
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });

  // Health: маркер на приложението + базата; Discord се отчита, но не сваля статуса (временно
  // прекъсване на gateway-а не е повод за откат на деплоя).
  app.get('/health', async (_req, res) => {
    const h = await deps.health();
    res
      .status(h.db ? 200 : 503)
      .json({ app: 'semki', status: h.db ? 'ok' : 'error', db: h.db, discord: h.discord });
  });

  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /\n');
  });

  app.use(express.static(path.join(ROOT, 'public'), { index: false, maxAge: '7d' }));
  app.use(cookieParser());
  app.use(express.urlencoded({ extended: false, limit: '20kb', parameterLimit: 50 }));
  app.use(
    rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: 'draft-7', legacyHeaders: false }),
  );

  const auth = createAuth(kit);
  app.use(auth.router);
  app.use(createPages(kit, auth));

  app.use((req: Request, res: Response) => {
    kit.render(
      req,
      res,
      'message',
      { title: 'Няма такава страница', text: 'Провери адреса.' },
      404,
    );
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    deps.log.error({ err, path: req.path }, 'грешка в дашборда');
    if (res.headersSent) return;
    kit.render(
      req,
      res,
      'message',
      {
        title: 'Нещо се обърка',
        text: 'Грешката е записана. Опитай пак след малко.',
      },
      500,
    );
  });

  return app;
}
