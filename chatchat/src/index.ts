import { PrismaClient } from '@prisma/client';
import type { Server } from 'node:http';
import { diagnose } from './ai/orchestrator.js';
import { VertexDiagnosisModel } from './ai/model.js';
import { createApp, type Diagnoser } from './app.js';
import {
  BreakerDiagnosisModel,
  BreakerEmbeddingModel,
  CircuitBreaker,
  CircuitOpenError,
} from './ai/breaker.js';
import { embeddingModelFrom } from './ai/embeddings.js';
import {
  aiEnabled,
  attachmentsEnabled,
  emailEnabled,
  loadConfig,
  mfaKey,
  redisEnabled,
} from './config.js';
import { createLogger } from './logger.js';
import { instrumentDiagnoser, meteredScanner } from './observability/ai.js';
import { BREAKER_STATE_VALUE, createMetrics, type BreakerName } from './observability/catalog.js';
import { startMetricsServer } from './observability/server.js';
import type { AttachmentDeps } from './services/attachments.js';
import type { MailPolicy } from './services/email/enqueue.js';
import { BrevoMailer } from './services/email/mailer.js';
import { EmailWorker } from './services/email/worker.js';
import { EmbeddingIndexer } from './store/embeddings.js';
import { ClamdScanner } from './storage/antivirus.js';
import { attachmentStoreFrom } from './storage/factory.js';
import { RealtimeHub } from './realtime/hub.js';
import { PrismaKnowledgeStore } from './store/knowledge.js';
import { knowledgeSnapshotId } from './store/snapshot.js';
import { wireScaling } from './scale.js';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const db = new PrismaClient();
// Метриките се събират винаги (евтино, в паметта); изнасят се само с METRICS_PORT.
const metrics = createMetrics();

/** Breaker към Vertex (NFR-07) — преходите в лога и метриките, бързите откази само в метриките. */
function breakerFor(name: BreakerName): CircuitBreaker {
  metrics.breakerState.set({ breaker: name }, BREAKER_STATE_VALUE.closed);
  return new CircuitBreaker({
    name,
    failureThreshold: config.AI_BREAKER_FAILURES,
    cooldownMs: config.AI_BREAKER_COOLDOWN_SECONDS * 1000,
    onTransition: (to, from) => {
      metrics.breakerState.set({ breaker: name }, BREAKER_STATE_VALUE[to]);
      metrics.breakerTransitions.inc({ breaker: name, to });
      const level = to === 'open' ? 'warn' : 'info';
      logger[level]({ breaker: name, from, to }, 'circuit breaker');
    },
    onReject: () => metrics.breakerRejections.inc({ breaker: name }),
  });
}

let diagnoser: Diagnoser | null = null;
let indexer: EmbeddingIndexer | null = null;
let modelBreaker: CircuitBreaker | null = null;
if (aiEnabled(config)) {
  // Семантичното търсене е по избор и fail-open; генерирането остава fail-closed.
  const rawEmbedder = embeddingModelFrom(config);
  const embedder = rawEmbedder
    ? new BreakerEmbeddingModel(rawEmbedder, breakerFor('vertex_embeddings'))
    : null;
  const store = new PrismaKnowledgeStore(db, {
    embedder,
    queryTimeoutMs: config.EMBEDDING_TIMEOUT_MS,
    onError: (err) => {
      // Отвореният breaker е вече в лога (прехода) и в метриките — не пълним лога при всеки въпрос.
      if (err instanceof CircuitOpenError) return;
      logger.warn(
        { err: (err as Error).name, status: (err as { status?: number }).status ?? null },
        'семантичното търсене е пропуснато — точно + пълнотекстово',
      );
    },
  });
  // С Redis векторите са в worker-а (опашка `embed` + периодичен преглед) — не в процеса на API-то.
  if (embedder && !redisEnabled(config)) {
    indexer = new EmbeddingIndexer(db, embedder, logger, config.EMBEDDING_SWEEP_SECONDS);
    indexer.start();
  }
  modelBreaker = breakerFor('vertex_messages');
  const model = new BreakerDiagnosisModel(new VertexDiagnosisModel(config), modelBreaker);
  diagnoser = instrumentDiagnoser(
    (input, signal) =>
      diagnose(
        {
          store,
          model,
          snapshotId: () => knowledgeSnapshotId(db, input.scope.tenantId),
          config,
        },
        input,
        signal,
      ),
    metrics,
  );
} else {
  logger.warn('VERTEX_PROJECT_ID липсва — AI е изключен, /chat/messages връща 503');
}

// Прикачени файлове: без хранилище — изключени; без антивирус — качването е изключено (503),
// а вече проверените файлове остават достъпни.
let attachments: AttachmentDeps | null = null;
if (attachmentsEnabled(config)) {
  attachments = {
    // Шифровано в покой (NFR-03): FILES_KEK е проверен от config.ts — без него процесът не стига дотук.
    store: attachmentStoreFrom(config),
    scanner: config.CLAMAV_HOST
      ? meteredScanner(
          new ClamdScanner({
            host: config.CLAMAV_HOST,
            port: config.CLAMAV_PORT,
            timeoutMs: config.CLAMAV_TIMEOUT_MS,
          }),
          metrics,
        )
      : null,
    urlKey: config.ATTACHMENT_URL_KEY,
  };
  if (!attachments.scanner) logger.warn('CLAMAV_HOST липсва — качването на файлове е изключено');
} else {
  logger.warn('ATTACHMENTS_DIR липсва — прикачените файлове са изключени');
}
// Имейл известия (Brevo, HTTPS): без ключ — изключени, известията в приложението работят (fail-open).
let mail: MailPolicy | null = null;
let emailWorker: EmailWorker | null = null;
if (emailEnabled(config)) {
  mail = { delayMs: config.EMAIL_DELAY_SECONDS * 1000 };
  emailWorker = new EmailWorker(
    {
      db,
      mailer: new BrevoMailer({
        apiKey: config.BREVO_API_KEY,
        apiUrl: config.BREVO_API_URL,
        fromEmail: config.MAIL_FROM_EMAIL,
        fromName: config.MAIL_FROM_NAME,
        timeoutMs: config.EMAIL_TIMEOUT_MS,
      }),
      logger,
      baseUrl: config.PUBLIC_BASE_URL,
      maxAttempts: config.EMAIL_MAX_ATTEMPTS,
      digestHour: config.EMAIL_DIGEST_HOUR,
    },
    config.EMAIL_SWEEP_SECONDS,
  );
  emailWorker.start();
} else {
  logger.warn('BREVO_API_KEY липсва — имейл известията са изключени');
}

// Един хъб за SSE на процес; с REDIS_URL хъбовете на инстанциите си говорят през pub/sub (scale.ts).
const hub = new RealtimeHub({
  onError: (err) =>
    logger.warn({ errName: err instanceof Error ? err.name : 'unknown' }, 'поток в реално време'),
  onPublished: (type, result, seconds) => {
    metrics.realtimeEvents.inc({ type, result });
    if (result === 'delivered') metrics.realtimeDelivery.observe(undefined, seconds);
  },
  onRemoteDelivered: (_type, seconds) => metrics.realtimeDelivery.observe(undefined, seconds),
});
metrics.sseStreams.collect = () => metrics.sseStreams.set(undefined, hub.localSize());

// Опашките, хъбът между инстанциите, общите лимити и TOTP (NFR-06) — Redis или в процеса.
const scale = wireScaling(config, {
  db,
  logger,
  metrics,
  hub,
  store: attachments?.store ?? null,
  indexer,
});

const app = createApp({
  db,
  logger,
  publicOrigin: new URL(config.PUBLIC_BASE_URL).origin,
  trustProxy: config.TRUST_PROXY,
  privacyPolicyUrl: config.PRIVACY_POLICY_URL,
  sessions: {
    db,
    pepper: config.SESSION_PEPPER,
    ttlHours: config.SESSION_TTL_HOURS,
    secureCookies: config.NODE_ENV === 'production',
  },
  mfaKey: mfaKey(config),
  diagnose: diagnoser,
  onDocumentPublished: scale.onDocumentPublished,
  attachments,
  hub,
  evalReportsDir: config.EVAL_REPORTS_DIR,
  metrics,
  aiCircuit: () => modelBreaker?.current ?? null,
  mail,
  ingest: scale.ingest,
  ...(scale.totpReplay ? { totpReplay: scale.totpReplay } : {}),
  rateLimitStore: scale.rateLimitStore,
});

const server = app.listen(config.PORT, config.HOST, () => {
  logger.info(
    {
      host: config.HOST,
      port: config.PORT,
      ai: diagnoser !== null,
      uploads: attachments?.scanner != null,
      email: mail !== null,
      filesEncrypted: attachments ? config.FILES_ENCRYPTION === 'on' : null,
      queue: scale.mode,
    },
    'chatchat слуша',
  );
});
// Хъбът се свързва с другите инстанции (Redis pub/sub); без Redis — нищо.
scale
  .start()
  .catch((err: unknown) =>
    logger.error({ errName: (err as Error).name }, 'реалното време между инстанциите не тръгна'),
  );

// Метриките — отделен слушател (по подразбиране изключен), никога публичният порт.
let metricsServer: Server | null = null;
if (config.METRICS_PORT > 0) {
  startMetricsServer(metrics.registry, {
    host: config.METRICS_HOST,
    port: config.METRICS_PORT,
    onError: (err) => logger.warn({ errName: err.name }, 'слушателят на метриките'),
  })
    .then((s) => {
      metricsServer = s;
      logger.info({ host: config.METRICS_HOST, port: config.METRICS_PORT }, 'метрики');
    })
    // Без метрики приложението работи — наблюдаемостта не сваля услугата.
    .catch((err: unknown) =>
      logger.error(
        { errName: (err as Error).name, code: (err as NodeJS.ErrnoException).code ?? null },
        'метриките не тръгнаха',
      ),
    );
}

function shutdown(signal: string): void {
  logger.info({ signal }, 'спиране');
  indexer?.stop();
  emailWorker?.stop();
  metricsServer?.close();
  // Отворените SSE потоци държат сървъра жив — затваряме ги, клиентите се връщат по REST.
  hub.closeAll();
  server.close(() => {
    scale
      .close()
      .catch(() => undefined)
      .then(() => db.$disconnect())
      .catch((err: unknown) => logger.error({ err }, 'грешка при затваряне на базата'))
      .finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'незаловено отхвърляне');
});
