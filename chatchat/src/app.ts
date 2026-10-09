import type { PrismaClient } from '@prisma/client';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import type { Logger } from 'pino';
import type { DiagnoseInput, DiagnoseOutput } from './ai/orchestrator.js';
import { apiError, requireCapability } from './auth/guards.js';
import { TotpReplayGuard } from './auth/mfa.js';
import { loadPrincipal, type SessionDeps } from './auth/sessions.js';
import { adminCatalogRouter } from './routes/admin-catalog.js';
import { adminDocumentsRouter } from './routes/admin-documents.js';
import { adminErrorsRouter } from './routes/admin-errors.js';
import { adminSubjectRouter } from './routes/admin-subject.js';
import { adminUserActionsRouter } from './routes/admin-user-actions.js';
import { adminUsersRouter } from './routes/admin-users.js';
import { auditRouter } from './routes/audit.js';
import { authMfaRouter } from './routes/auth-mfa.js';
import { authRouter } from './routes/auth.js';
import { casesRouter } from './routes/cases.js';
import { catalogRouter } from './routes/catalog.js';
import { chatRouter } from './routes/chat.js';
import { savedFiltersRouter } from './routes/saved-filters.js';
import { ticketsRouter } from './routes/tickets.js';
import { QR_TOKEN } from './services/devices.js';

export type Diagnoser = (input: DiagnoseInput, signal: AbortSignal) => Promise<DiagnoseOutput>;

export interface AppDeps {
  db: PrismaClient;
  logger: Logger;
  /** https://chatchat.carbonstealth.eu — за проверката на Origin. */
  publicOrigin: string;
  trustProxy: number;
  /** Информацията за поверителност на администратора (празно → не се показва връзка). */
  privacyPolicyUrl: string;
  sessions: SessionDeps;
  /** AES-256-GCM ключът за TOTP тайните (MFA_ENC_KEY, 32 байта). */
  mfaKey: Buffer;
  /** null → AI е изключен (няма GCP проект): /chat/messages връща 503, без резервен доставчик. */
  diagnose: Diagnoser | null;
}

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

/** Админ пътищата на знанието: големите документи искат по-висок таван на тялото. */
const KB_ADMIN = [
  '/api/v1/admin/documents',
  '/api/v1/admin/products',
  '/api/v1/admin/devices',
  '/api/v1/admin/errors',
];

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  const totpReplay = new TotpReplayGuard();
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

  // Документите с хиляди страници са по-големи — по-високият таван е само за админ пътищата на
  // знанието и СЛЕД проверката за роля (и втори фактор): анонимен или портален потребител не кара
  // сървъра да парсва 8 MB. Директорията (/admin/users) е с обичайния таван и своя способност.
  app.use(
    KB_ADMIN,
    loadPrincipal(deps.sessions),
    requireCapability('kb:manage'),
    express.json({ limit: '8mb' }),
  );
  app.use('/api', express.json({ limit: '64kb' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', loadPrincipal(deps.sessions));

  // Публично: каквото UI трябва да покаже ПРЕДИ вход (информация за поверителност).
  app.get('/api/v1/meta', (_req, res) => {
    res.json({ privacyUrl: deps.privacyPolicyUrl || null });
  });
  app.use('/api/v1/auth/mfa', authMfaRouter(deps, totpReplay));
  app.use('/api/v1/auth', authRouter(deps));
  // Директорията и запазените филтри — преди админ рутерите на знанието: техният `router.use`
  // иска kb:manage за всичко под /admin, а администраторът на клиента го няма.
  app.use('/api/v1', adminUsersRouter(deps));
  app.use('/api/v1', adminUserActionsRouter(deps, totpReplay));
  app.use('/api/v1', adminSubjectRouter(deps, totpReplay));
  app.use('/api/v1', savedFiltersRouter(deps));
  app.use('/api/v1/admin', adminCatalogRouter(deps));
  app.use('/api/v1/admin', adminDocumentsRouter(deps));
  app.use('/api/v1/admin', adminErrorsRouter(deps));
  app.use('/api/v1', auditRouter(deps));
  app.use('/api/v1', catalogRouter(deps));
  app.use('/api/v1', casesRouter(deps));
  app.use('/api/v1', chatRouter(deps));
  app.use('/api/v1', ticketsRouter(deps));
  app.use('/api', (_req, res) => apiError(res, 404, 'not_found'));

  // FR-13: адресът от QR етикета → приложението с токена (вход, после справката по токена).
  // Пренасочването е еднакво за всеки токен с валиден формат — не издава дали съществува.
  app.get('/q/:token', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const token = req.params.token;
    res.redirect(302, QR_TOKEN.test(token) ? `/?qr=${encodeURIComponent(token)}` : '/');
  });
  // Линкът за задаване/нулиране на парола (`/reset#<токен>`): токенът е във фрагмента и не стига
  // до сървъра; страницата е самото приложение.
  app.get('/reset', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile('index.html', { root: PUBLIC_DIR });
  });

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
