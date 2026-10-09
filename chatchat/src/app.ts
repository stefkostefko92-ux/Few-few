import type { PrismaClient } from '@prisma/client';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import type { Logger } from 'pino';
import type { DiagnoseInput, DiagnoseOutput } from './ai/orchestrator.js';
import { apiError, requireCapability } from './auth/guards.js';
import { loadPrincipal, onSessionsRevoked, type SessionDeps } from './auth/sessions.js';
import { RealtimeHub } from './realtime/hub.js';
import { eventsRouter } from './realtime/stream.js';
import { adminCatalogRouter } from './routes/admin-catalog.js';
import { adminDocumentsRouter } from './routes/admin-documents.js';
import { adminErrorsRouter, auditRouter } from './routes/admin-errors.js';
import { attachmentUploadRouter } from './routes/attachments.js';
import { authRouter } from './routes/auth.js';
import { casesRouter } from './routes/cases.js';
import { catalogRouter } from './routes/catalog.js';
import { chatRouter } from './routes/chat.js';
import { filesRouter } from './routes/files.js';
import { conversationsRouter } from './routes/conversations.js';
import { messagesRouter } from './routes/messages.js';
import { notificationsRouter } from './routes/notifications.js';
import { presenceRouter } from './routes/presence.js';
import { quickResponsesRouter } from './routes/quick-responses.js';
import { ticketsRouter } from './routes/tickets.js';
import type { AttachmentDeps } from './services/attachments.js';

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
  /** null → AI е изключен (няма GCP проект): /chat/messages връща 503, без резервен доставчик. */
  diagnose: Diagnoser | null;
  /** Сигнал след публикуване на документ (семантичният индекс); не блокира отговора. */
  onDocumentPublished?: (documentId: string) => void;
  /** null → прикачването е изключено (няма ATTACHMENTS_DIR): маршрутите връщат 503. */
  attachments: AttachmentDeps | null;
  /** Хъбът за реално време (SSE) — един на процес; без него createApp прави свой. */
  hub?: RealtimeHub;
}

/** Зависимостите след сглобяване — с хъба, който рутерите на работното пространство ползват. */
export type WiredDeps = AppDeps & { hub: RealtimeHub };

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

export function createApp(appDeps: AppDeps): express.Express {
  const hub =
    appDeps.hub ??
    new RealtimeHub({
      onError: (err) =>
        appDeps.logger.warn(
          { errName: err instanceof Error ? err.name : 'unknown' },
          'поток в реално време',
        ),
    });
  const deps: WiredDeps = { ...appDeps, hub };
  // Изход, деактивиране, отнети сесии → отворените потоци се затварят веднага (§13.3).
  onSessionsRevoked((target) =>
    'userId' in target
      ? hub.disconnectUser(target.userId)
      : hub.disconnectSession(target.sessionId),
  );
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

  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  // Качването на файлове е сурово тяло със собствен таван — само по своите пътища, СЛЕД сесия,
  // CSRF, роля и достъп до случая, и ПРЕДИ JSON парсерите (JSON лог е файл, не заявка).
  app.use('/api/v1', attachmentUploadRouter(deps));
  // Документите с хиляди страници са по-големи — по-високият таван е само за админ пътя и
  // СЛЕД проверката за роля: анонимен или портален потребител не кара сървъра да парсва 8 MB.
  app.use(
    '/api/v1/admin',
    loadPrincipal(deps.sessions),
    requireCapability('kb:manage'),
    express.json({ limit: '8mb' }),
  );
  app.use('/api', express.json({ limit: '64kb' }));
  app.use('/api', loadPrincipal(deps.sessions));

  // Публично: каквото UI трябва да покаже ПРЕДИ вход (информация за поверителност).
  app.get('/api/v1/meta', (_req, res) => {
    res.json({ privacyUrl: deps.privacyPolicyUrl || null });
  });
  app.use('/api/v1/auth', authRouter(deps));
  app.use('/api/v1/admin', adminCatalogRouter(deps));
  app.use('/api/v1/admin', adminDocumentsRouter(deps));
  app.use('/api/v1/admin', adminErrorsRouter(deps));
  app.use('/api/v1', auditRouter(deps));
  app.use('/api/v1', catalogRouter(deps));
  app.use('/api/v1', casesRouter(deps));
  app.use('/api/v1', chatRouter(deps));
  app.use('/api/v1', ticketsRouter(deps));
  app.use('/api/v1', filesRouter(deps));
  // Работното пространство (§12.3): разговори, съобщения, присъствие, известия, бързи отговори, SSE.
  app.use('/api/v1', conversationsRouter(deps));
  app.use('/api/v1', messagesRouter(deps));
  app.use('/api/v1', presenceRouter(deps));
  app.use('/api/v1', notificationsRouter(deps));
  app.use('/api/v1', quickResponsesRouter(deps));
  app.use('/api/v1', eventsRouter(deps));
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
