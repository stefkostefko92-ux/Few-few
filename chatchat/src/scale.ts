import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import { RedisTotpReplayGuard, type TotpReplayStore } from './auth/mfa.js';
import { RedisRateLimitStore, type RateLimitStoreFactory } from './auth/rate-limit.js';
import type { Config } from './config.js';
import { redisEnabled } from './config-queue.js';
import type { Metrics } from './observability/catalog.js';
import { BullJobBus } from './queue/bull.js';
import { InlineJobBus, type JobBus } from './queue/inline.js';
import { jobId, queuePolicies } from './queue/jobs.js';
import { closeRedis, createRedis } from './queue/redis.js';
import { jobHandlers, pipelineDeps, queueHooks } from './queue/runtime.js';
import { RealtimeCluster } from './realtime/cluster.js';
import type { RealtimeHub } from './realtime/hub.js';
import { RedisTransport } from './realtime/redis-transport.js';
import type { AttachmentStore } from './storage/attachments.js';
import type { EmbeddingIndexer } from './store/embeddings.js';

/**
 * Мащабирането на API-то (NFR-06, NFR-11) на едно място:
 *  - с REDIS_URL: опашките са в Redis (API-то само слага задачи, тежката работа е в worker-а —
 *    `node dist/worker.js`, включително векторите), хъбът за реално време говори с другите
 *    инстанции през pub/sub, лимитите и пазачът срещу повторен TOTP код са общи;
 *  - без REDIS_URL: същите обработчици в процеса (InlineJobBus), векторите — EmbeddingIndexer,
 *    хъбът, лимитите и TOTP — в паметта. Тогава работи САМО една инстанция.
 */

export interface ScaleWiring {
  mode: 'inline' | 'redis';
  /** null → без хранилище на файлове няма и приемане на файлове. */
  ingest: { bus: JobBus } | null;
  onDocumentPublished?: (documentId: string) => void;
  totpReplay?: TotpReplayStore;
  rateLimitStore: RateLimitStoreFactory | null;
  /** Свързва хъба с другите инстанции (само с Redis). */
  start(): Promise<void>;
  close(): Promise<void>;
}

interface Parts {
  /** Ролята на приложението (под RLS). */
  db: PrismaClient;
  /** Системната роля — само клиентът на файла по id от задачата (`queue/runtime.ts`). */
  system: PrismaClient;
  logger: Logger;
  metrics: Metrics;
  hub: RealtimeHub;
  store: AttachmentStore | null;
  /** Само в процеса (без Redis): фоновото индексиране на векторите. */
  indexer: EmbeddingIndexer | null;
}

function inline(cfg: Config, parts: Parts): ScaleWiring {
  const policies = queuePolicies(cfg);
  let ingest: ScaleWiring['ingest'] = null;
  let bus: InlineJobBus | null = null;
  if (parts.store) {
    bus = new InlineJobBus(policies);
    const pipeline = pipelineDeps(cfg, { ...parts, store: parts.store, bus });
    // Векторите в процеса прави EmbeddingIndexer (както досега) — задачата `embed` само го буди.
    const embed = async () => {
      await parts.indexer?.kick();
    };
    bus.attach(jobHandlers(pipeline, embed), queueHooks(pipeline, parts.metrics));
    ingest = { bus };
  }
  const indexer = parts.indexer;
  return {
    mode: 'inline',
    ingest,
    ...(indexer ? { onDocumentPublished: () => void indexer.kick() } : {}),
    rateLimitStore: null,
    start: async () => undefined,
    close: async () => {
      await bus?.close();
    },
  };
}

function redis(cfg: Config, parts: Parts): ScaleWiring {
  const { logger, metrics } = parts;
  const cmd = createRedis(cfg.REDIS_URL, 'api', logger);
  const sub = createRedis(cfg.REDIS_URL, 'api-sub', logger, { blocking: true });
  const bus = new BullJobBus(cmd, queuePolicies(cfg));
  let lastWarn = 0;
  const onError = (err: unknown) => {
    // Без адреса и без съдържание; не по-често от веднъж на 30 s.
    if (Date.now() - lastWarn < 30_000) return;
    lastWarn = Date.now();
    logger.warn({ errName: err instanceof Error ? err.name : 'unknown' }, 'Redis (резервен режим)');
  };
  const cluster = new RealtimeCluster(new RedisTransport(cmd, sub), {
    snapshotMs: parts.hub.heartbeatMs,
    onError,
    onMessage: (direction, kind) => metrics.realtimeBus.inc({ direction, kind }),
  });
  return {
    mode: 'redis',
    ingest: parts.store ? { bus } : null,
    onDocumentPublished: (documentId) => {
      bus
        .enqueue('embed', { documentId }, { jobId: jobId('embed', documentId), dedupe: true })
        .catch(onError);
    },
    totpReplay: new RedisTotpReplayGuard(cmd, onError),
    rateLimitStore: (name) => new RedisRateLimitStore(cmd, name, onError),
    start: () => parts.hub.joinCluster(cluster),
    close: async () => {
      await cluster.stop().catch(() => undefined);
      await bus.close();
      await Promise.all([closeRedis(sub), closeRedis(cmd)]);
    },
  };
}

export function wireScaling(cfg: Config, parts: Parts): ScaleWiring {
  return redisEnabled(cfg) ? redis(cfg, parts) : inline(cfg, parts);
}
