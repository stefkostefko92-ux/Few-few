import type { PrismaClient } from '@prisma/client';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import type { Logger } from 'pino';
import type { BreakerState } from './ai/breaker.js';
import type { DiagnoseInput, DiagnoseOutput } from './ai/orchestrator.js';
import { mountApiRouters } from './app-routes.js';
import { apiError, requireCapability } from './auth/guards.js';
import { TotpReplayGuard, type TotpReplayStore } from './auth/mfa.js';
import { useRateLimitStores, type RateLimitStoreFactory } from './auth/rate-limit.js';
import { loadPrincipal, onSessionsRevoked, type SessionDeps } from './auth/sessions.js';
import type { Metrics } from './observability/catalog.js';
import { httpMetrics } from './observability/http.js';
import { RealtimeHub } from './realtime/hub.js';
import { attachmentUploadRouter } from './routes/attachments.js';
import { mountPdfjs } from './vendor.js';
import { integrationsInboundRouter } from './routes/integrations-inbound.js';
import type { JobBus } from './queue/inline.js';
import type { AttachmentDeps } from './services/attachments.js';
import { QR_TOKEN } from './services/devices.js';
import type { MailPolicy } from './services/email/enqueue.js';
import type { IntegrationDeps } from './services/integrations/deps.js';
import type { SsoDeps } from './services/sso/types.js';

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
  /** Сигнал след публикуване на документ (семантичният индекс); не блокира отговора. */
  onDocumentPublished?: (documentId: string) => void;
  /** null → прикачването е изключено (няма ATTACHMENTS_DIR): маршрутите връщат 503. */
  attachments: AttachmentDeps | null;
  /** Хъбът за реално време (SSE) — един на процес; без него createApp прави свой. */
  hub?: RealtimeHub;
  /** Отчетите на оценъчния набор за KPI (§16.1); празно/липсва → „изисква оценка“. */
  evalReportsDir?: string;
  /** Метриките (NFR-09); без тях — без инструментиране. Изнасят се на отделен слушател (index.ts). */
  metrics?: Metrics;
  /** Състоянието на circuit breaker-а към Vertex — за /readyz (null → AI е изключен). */
  aiCircuit?: () => BreakerState | null;
  /** Имейл известията (Brevo): null/липсва → изключени, без outbox (fail-open, известията остават). */
  mail?: MailPolicy | null;
  /** Интеграцията с helpdesk (FR-09): null/липсва → изключена (няма INTEGRATION_KEK), админ API 503. */
  integrations?: IntegrationDeps | null;
  /** Единният вход (OIDC / Entra ID): null/липсва (няма SSO_KEK) → 503 `sso_unavailable`. */
  sso?: SsoDeps | null;
  /** Опашката за приемане на документи (в процеса или Redis); null → пакетното качване е 503. */
  ingest?: { bus: JobBus } | null;
  /** Пазачът срещу повторен TOTP код — в Redis при няколко инстанции; без него — в паметта. */
  totpReplay?: TotpReplayStore;
  /** Общите броячи на лимитите (Redis) — без тях всеки лимит е в паметта на инстанцията. */
  rateLimitStore?: RateLimitStoreFactory | null;
}

/** Зависимостите след сглобяване — с хъба, който рутерите на работното пространство ползват. */
export type WiredDeps = AppDeps & { hub: RealtimeHub };

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

/** Админ пътищата на знанието: големите документи искат по-висок таван на тялото. */
const KB_ADMIN = [
  '/api/v1/admin/documents',
  '/api/v1/admin/products',
  '/api/v1/admin/devices',
  '/api/v1/admin/errors',
  '/api/v1/admin/ingest',
];

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
  // Изход, деактивиране, смяна на роля/парола… → отворените потоци се затварят веднага (§13.3) —
  // и в другите инстанции (hub.revoke → pub/sub).
  onSessionsRevoked((event) => hub.revoke(event));
  // Лимитите се създават с рутерите — общото хранилище (Redis) трябва да е зададено преди тях.
  useRateLimitStores(deps.rateLimitStore ?? null);
  const app = express();
  const totpReplay = deps.totpReplay ?? new TotpReplayGuard();
  app.disable('x-powered-by');
  app.set('trust proxy', deps.trustProxy);
  // RED по шаблон на маршрута — първо, за да види и отказите на helmet/лимитите.
  if (deps.metrics) app.use(httpMetrics(deps.metrics));

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
  // Отворен breaker към Vertex НЕ сваля готовността: случаите, разговорите и търсенето работят,
  // само AI отговорът е 503 — затова е отделно поле (`aiCircuit`), а `ok` зависи само от базата.
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/readyz', async (_req, res) => {
    try {
      await deps.db.$queryRaw`SELECT 1`;
      res.json({
        ok: true,
        app: 'chatchat',
        ai: deps.diagnose !== null,
        aiCircuit: deps.aiCircuit?.() ?? null,
      });
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
  // Входящото от helpdesk-а: подпис върху СУРОВОТО тяло, без сесия — преди JSON парсера.
  app.use('/api/v1', integrationsInboundRouter(deps));
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
  app.use('/api', loadPrincipal(deps.sessions));

  // Публично: каквото UI трябва да покаже ПРЕДИ вход (информация за поверителност).
  app.get('/api/v1/meta', (_req, res) => {
    res.json({ privacyUrl: deps.privacyPolicyUrl || null });
  });
  // Рутерите на API — редът им е част от поведението (`app-routes.ts`).
  mountApiRouters(app, deps, totpReplay);
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

  mountPdfjs(app);
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
