import type { PrismaClient } from '@prisma/client';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import type { Logger } from 'pino';
import type { DiagnoseInput, DiagnoseOutput } from './ai/orchestrator.js';
import { apiError } from './auth/guards.js';
import { loadPrincipal, type SessionDeps } from './auth/sessions.js';
import { adminCatalogRouter } from './routes/admin-catalog.js';
import { adminDocumentsRouter } from './routes/admin-documents.js';
import { adminErrorsRouter, auditRouter } from './routes/admin-errors.js';
import { authRouter } from './routes/auth.js';
import { casesRouter } from './routes/cases.js';
import { catalogRouter } from './routes/catalog.js';
import { chatRouter } from './routes/chat.js';
import { ticketsRouter } from './routes/tickets.js';

export type Diagnoser = (input: DiagnoseInput, signal: AbortSignal) => Promise<DiagnoseOutput>;

export interface AppDeps {
  db: PrismaClient;
  logger: Logger;
  /** https://chatchat.carbonstealth.eu — за проверката на Origin. */
  publicOrigin: string;
  trustProxy: number;
  sessions: SessionDeps;
  /** null → AI е изключен (няма GCP проект): /chat/messages връща 503, без резервен доставчик. */
  diagnose: Diagnoser | null;
}

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', deps.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      referrerPolicy: { policy: 'same-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Жизненост (процесът е жив) и готовност (базата отговаря) — отделно, за Nginx/монитора.
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/readyz', async (_req, res) => {
    try {
      await deps.db.$queryRaw`SELECT 1`;
      res.json({ ok: true, ai: deps.diagnose !== null });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  // Документите с хиляди страници са по-големи — по-високият таван е само за админ пътя.
  app.use('/api/v1/admin', express.json({ limit: '8mb' }));
  app.use('/api', express.json({ limit: '64kb' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', loadPrincipal(deps.sessions));

  app.use('/api/v1/auth', authRouter(deps));
  app.use('/api/v1/admin', adminCatalogRouter(deps));
  app.use('/api/v1/admin', adminDocumentsRouter(deps));
  app.use('/api/v1/admin', adminErrorsRouter(deps));
  app.use('/api/v1', auditRouter(deps));
  app.use('/api/v1', catalogRouter(deps));
  app.use('/api/v1', casesRouter(deps));
  app.use('/api/v1', chatRouter(deps));
  app.use('/api/v1', ticketsRouter(deps));
  app.use('/api', (_req, res) => apiError(res, 404, 'not_found'));

  app.use(
    express.static(PUBLIC_DIR, {
      index: 'index.html',
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    // Невалиден JSON / твърде голямо тяло — грешка на клиента, не на сървъра.
    const status =
      typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number'
        ? err.status
        : 500;
    if (status >= 500) deps.logger.error({ err, path: req.path }, 'необработена грешка');
    if (res.headersSent) return;
    apiError(
      res,
      status,
      status === 413 ? 'payload_too_large' : status < 500 ? 'bad_request' : 'internal',
    );
  });

  return app;
}
