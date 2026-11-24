import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import type { OwnerStore } from '../auth/owner-store.js';
import type { AppConfig } from '../config.js';
import type { ComplianceStore } from '../store/types.js';
import { apiRoutes } from './api-routes.js';
import { authRoutes } from './auth-routes.js';
import { requireOwner, sameOrigin } from './guards.js';

export interface AppDeps {
  config: AppConfig;
  store: ComplianceStore;
  owners: OwnerStore;
  now: () => Date;
  nowSeconds: () => number;
  pingDb: () => Promise<boolean>;
  onError?: (err: unknown) => void;
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

  app.use(express.json({ limit: '25mb' }));
  app.use(cookieParser());
  app.use('/api', sameOrigin(config.appOrigin));
  app.use('/api/auth', authRoutes(config, deps.owners, deps.nowSeconds));
  app.use(
    '/api',
    requireOwner(config.jwtSecret, deps.owners),
    apiRoutes({ ...deps, pepper: config.pepper }),
  );
  app.use(express.static(PUBLIC_DIR, { index: 'index.html', maxAge: '1h' }));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    deps.onError?.(err);
    const status =
      typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number'
        ? err.status
        : 500;
    res
      .status(status >= 400 && status < 500 ? status : 500)
      .json({ error: 'Грешка при заявката.' });
  });
  return app;
}
