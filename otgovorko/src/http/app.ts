import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import type { OwnerStore } from '../auth/owner-store.js';
import type { AppConfig } from '../config.js';
import type { TicketStore } from '../tickets/types.js';
import { apiRoutes } from './api-routes.js';
import { authRoutes } from './auth-routes.js';
import { requireOwner, sameOrigin } from './guards.js';
import { inboundRoutes } from './inbound-routes.js';

export interface AppDeps {
  config: AppConfig;
  tickets: TicketStore;
  owners: OwnerStore;
  now: () => Date;
  nowSeconds: () => number;
  pingDb: () => Promise<boolean>;
  onError?: (info: { kind: string; status: number }) => void;
}

const PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url));

export function createApp(deps: AppDeps): express.Express {
  const { config } = deps;
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"],
        },
      },
      strictTransportSecurity: { maxAge: 63_072_000, includeSubDomains: true },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    next();
  });

  app.get('/health', async (_req, res) => {
    const db = await deps.pingDb().catch(() => false);
    res.status(db ? 200 : 503).json({ ok: db });
  });
  app.get('/robots.txt', (_req, res) =>
    res.type('text/plain').send('User-agent: *\nDisallow: /\n'),
  );

  // Webhook-ът на Brevo: извън сесията и Origin проверката, със собствен парсер (до 10 MB).
  app.use(
    '/inbound/brevo',
    inboundRoutes({
      store: deps.tickets,
      path: config.inboundPath,
      token: config.inboundToken,
      now: deps.now,
    }),
  );

  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());
  app.use('/api', sameOrigin(config.appOrigin));
  app.use('/api/auth', authRoutes(config, deps.owners, deps.nowSeconds));
  app.use(
    '/api',
    requireOwner(config.jwtSecret, deps.owners),
    apiRoutes({ tickets: deps.tickets, now: deps.now }),
  );
  app.use(express.static(PUBLIC_DIR, { index: 'index.html', maxAge: '1h' }));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status =
      typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number'
        ? err.status
        : 500;
    // Само вид и код — съобщението на JSON.parse и на Prisma може да носи откъс от писмото.
    const kind =
      typeof err === 'object' && err !== null && 'type' in err && typeof err.type === 'string'
        ? err.type
        : err instanceof Error
          ? err.name
          : 'unknown';
    if (status >= 500) deps.onError?.({ kind, status });
    res
      .status(status >= 400 && status < 500 ? status : 500)
      .json({ error: status < 500 ? 'Невалидна заявка.' : 'Грешка при заявката.' });
  });
  return app;
}
