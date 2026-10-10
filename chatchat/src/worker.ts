import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BreakerEmbeddingModel, CircuitBreaker } from './ai/breaker.js';
import { embeddingModelFrom } from './ai/embeddings.js';
import { loadWorkerConfig } from './config.js';
import { createDbClients, ensureDbRoles } from './db/clients.js';
import { createLogger } from './logger.js';
import { BREAKER_STATE_VALUE, createMetrics } from './observability/catalog.js';
import { startMetricsServer } from './observability/server.js';
import { BullJobBus, WorkerHost } from './queue/bull.js';
import { queuePolicies } from './queue/jobs.js';
import { closeRedis, createRedis } from './queue/redis.js';
import { embedHandler, jobHandlers, pipelineDeps, queueHooks } from './queue/runtime.js';
import { attachmentStoreFrom } from './storage/factory.js';

/**
 * Worker-ът (NFR-06): отделна услуга `worker` в docker-compose.yml — СЪЩИЯТ образ, `node
 * dist/worker.js`, само за четене, без root. Изпълнява опашките от Redis: приемане/извличане на
 * документи (отделна нишка за разбора), OCR (pdftoppm + tesseract през execFile), вектори
 * (Vertex в ЕС, с circuit breaker). Не обслужва HTTP; „жив съм“ е файл (HEALTHCHECK), метриките —
 * отделен слушател по избор (METRICS_PORT). SIGTERM → текущите задачи довършват (до 90 s), после
 * принудително (задачата е идемпотентна и се поема пак).
 */

const config = loadWorkerConfig();
const logger = createLogger(config.LOG_LEVEL).child({ role: 'worker' });
// Работата по файл — chatchat_app в контекста на клиента му (RLS); клиентът на файла по id и прегледът
// на векторите през всички клиенти — chatchat_system.
const clients = createDbClients(config);
const { db, system } = clients;
await ensureDbRoles(clients, config, logger);
const metrics = createMetrics();
const policies = queuePolicies(config);

const breaker = new CircuitBreaker({
  name: 'vertex_embeddings',
  failureThreshold: config.AI_BREAKER_FAILURES,
  cooldownMs: config.AI_BREAKER_COOLDOWN_SECONDS * 1000,
  onTransition: (to, from) => {
    metrics.breakerState.set({ breaker: 'vertex_embeddings' }, BREAKER_STATE_VALUE[to]);
    metrics.breakerTransitions.inc({ breaker: 'vertex_embeddings', to });
    logger[to === 'open' ? 'warn' : 'info']({ from, to }, 'circuit breaker (вектори)');
  },
  onReject: () => metrics.breakerRejections.inc({ breaker: 'vertex_embeddings' }),
});
const rawEmbedder = embeddingModelFrom(config);
const embedder = rawEmbedder ? new BreakerEmbeddingModel(rawEmbedder, breaker) : null;

const redis = createRedis(config.REDIS_URL, 'worker', logger, { blocking: true });
const bus = new BullJobBus(redis, policies);
const pipeline = pipelineDeps(config, {
  db,
  system,
  store: attachmentStoreFrom(config),
  bus,
  logger,
  metrics,
});
const host = new WorkerHost(
  redis,
  bus,
  policies,
  jobHandlers(pipeline, embedHandler(system, embedder, logger)),
  queueHooks(pipeline, metrics),
  logger,
);
host.start();

// Периодичният преглед за непокрити вектори (BullMQ Job Scheduler — един за всички worker-и).
bus
  .scheduleEmbedSweep(embedder ? config.EMBEDDING_SWEEP_SECONDS : 0)
  .catch((err: unknown) => logger.warn({ errName: (err as Error).name }, 'embed-sweep'));

// Дълбочината на опашките за метриките (на 15 s; грешка → старите стойности).
const depthTimer = setInterval(() => {
  bus
    .counts()
    .then((counts) => {
      for (const [queue, states] of Object.entries(counts)) {
        for (const [state, n] of Object.entries(states))
          metrics.queueDepth.set({ queue, state }, n);
      }
    })
    .catch(() => undefined);
}, 15_000);
depthTimer.unref();

// „Жив съм“: файлът се обновява само ако Redis отговаря (HEALTHCHECK: по-стар от 60 s → нездрав).
const heartbeatFile = config.WORKER_HEARTBEAT_FILE || join(tmpdir(), 'chatchat-worker.alive');
const beat = () =>
  redis
    .ping()
    .then(() => writeFile(heartbeatFile, new Date().toISOString(), { mode: 0o600 }))
    .catch(() => undefined);
void beat();
const beatTimer = setInterval(() => void beat(), 10_000);
beatTimer.unref();

// OCR инструментите — само предупреждение при старт (липсата им е провал на файла, не на worker-а).
if (config.OCR_ENGINE === 'tesseract') {
  for (const [bin, arg] of [
    ['tesseract', '--version'],
    ['pdftoppm', '-v'],
  ] as const) {
    execFile(bin, [arg], { timeout: 10_000 }, (err) => {
      if (err)
        logger.warn({ tool: bin }, 'OCR инструментът липсва — сканираните файлове ще пропадат');
    });
  }
}

let metricsServer: Server | null = null;
if (config.METRICS_PORT > 0) {
  startMetricsServer(metrics.registry, {
    host: config.METRICS_HOST,
    port: config.METRICS_PORT,
    onError: (err) => logger.warn({ errName: err.name }, 'слушателят на метриките'),
  })
    .then((s) => {
      metricsServer = s;
    })
    .catch((err: unknown) =>
      logger.error({ errName: (err as Error).name }, 'метриките на worker-а не тръгнаха'),
    );
}

logger.info(
  {
    queues: Object.fromEntries(Object.entries(policies).map(([q, p]) => [q, p.concurrency])),
    ocr: config.OCR_ENGINE,
    embeddings: embedder !== null,
  },
  'chatchat worker тръгна',
);

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'спиране на worker-а');
  clearInterval(depthTimer);
  clearInterval(beatTimer);
  setTimeout(() => process.exit(1), 110_000).unref();
  await host.close(90_000);
  metricsServer?.close();
  await bus.close();
  await closeRedis(redis);
  await clients.disconnect().catch(() => undefined);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (err) => {
  logger.error({ errName: err instanceof Error ? err.name : 'unknown' }, 'незаловено отхвърляне');
});
