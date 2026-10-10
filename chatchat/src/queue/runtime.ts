import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import type { EmbeddingModel } from '../ai/embeddings.js';
import { withTenantIfKnown } from '../db/tenant-context.js';
import type { QueueEnv } from '../config-queue.js';
import { ThreadParser } from '../ingest/isolate.js';
import { PopplerRasterizer, TesseractOcr } from '../ingest/ocr.js';
import { onIngestDead, runIngestJob, runOcrJob, type PipelineDeps } from '../ingest/pipeline.js';
import type { Metrics } from '../observability/catalog.js';
import type { AttachmentStore } from '../storage/attachments.js';
import { embedPending } from '../store/embeddings.js';
import type { JobBus } from './inline.js';
import type { JobHandlers, QueueHooks } from './jobs.js';

/**
 * Сглобяването на обработчиците — ЕДНО място за API-то в процеса (без REDIS_URL) и за worker-а:
 * същият поток, същите тавани, същите метрики.
 */

type IngestEnv = Pick<
  QueueEnv,
  | 'INGEST_TIMEOUT_SECONDS'
  | 'INGEST_THREAD_HEAP_MB'
  | 'INGEST_TMP_DIR'
  | 'OCR_ENGINE'
  | 'OCR_LANGS'
  | 'OCR_MAX_PAGES'
  | 'OCR_PAGE_TIMEOUT_SECONDS'
  | 'OCR_TIMEOUT_SECONDS'
>;

export function pipelineDeps(
  cfg: IngestEnv,
  parts: {
    db: PrismaClient;
    system: PrismaClient;
    store: AttachmentStore;
    bus: Pick<JobBus, 'enqueue'>;
    logger: Logger;
    metrics?: Metrics;
  },
): PipelineDeps {
  const { metrics } = parts;
  return {
    db: parts.db,
    system: parts.system,
    store: parts.store,
    bus: parts.bus,
    parser: new ThreadParser({
      heapMb: cfg.INGEST_THREAD_HEAP_MB,
      timeoutMs: cfg.INGEST_TIMEOUT_SECONDS * 1000,
    }),
    ocr:
      cfg.OCR_ENGINE === 'off'
        ? null
        : { engine: new TesseractOcr(cfg.OCR_LANGS), rasterizer: new PopplerRasterizer() },
    settings: {
      tmpDir: cfg.INGEST_TMP_DIR,
      ocrMaxPages: cfg.OCR_MAX_PAGES,
      ocrPageTimeoutMs: cfg.OCR_PAGE_TIMEOUT_SECONDS * 1000,
      ocrTimeoutMs: cfg.OCR_TIMEOUT_SECONDS * 1000,
      parseTimeoutMs: cfg.INGEST_TIMEOUT_SECONDS * 1000,
    },
    logger: parts.logger,
    ...(metrics
      ? {
          onItem: (format, result) => metrics.ingestItems.inc({ format, result }),
          onOcrPage: (result) => metrics.ocrPages.inc({ result }),
        }
      : {}),
  };
}

/** Векторите на публикуваното знание (worker-ът): само PUBLISHED, грешка → повторен опит. */
export function embedHandler(
  db: PrismaClient,
  embedder: EmbeddingModel | null,
  logger: Pick<Logger, 'info'>,
): JobHandlers['embed'] {
  return async (data, ctx) => {
    if (!embedder) return;
    const result = await embedPending(db, embedder, {
      ...(data.documentId ? { documentId: data.documentId } : {}),
      maxBatches: 50,
      signal: ctx.signal,
    });
    if (result.embedded > 0 || result.remaining) {
      logger.info(
        { embedded: result.embedded, remaining: result.remaining, model: embedder.id },
        'семантичен индекс',
      );
    }
  };
}

/**
 * Задачата носи само id на файла: клиентът му се чете със системната роля (само `tenantId`), а
 * цялата работа по файла тече в контекста на клиента — под RLS. Непознат id → без контекст (базата
 * не връща нищо — задачата приключва без работа, както при изтрит файл).
 */
async function inTenantOfItem<T>(
  pipeline: PipelineDeps,
  itemId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const row = await pipeline.system.ingestItem.findUnique({
    where: { id: itemId },
    select: { tenantId: true },
  });
  return withTenantIfKnown(row?.tenantId ?? null, fn);
}

export function jobHandlers(pipeline: PipelineDeps, embed: JobHandlers['embed']): JobHandlers {
  return {
    ingest: (data, ctx) =>
      inTenantOfItem(pipeline, data.itemId, () => runIngestJob(pipeline, data.itemId, ctx)),
    ocr: (data, ctx) =>
      inTenantOfItem(pipeline, data.itemId, () => runOcrJob(pipeline, data.itemId, ctx)),
    embed,
  };
}

export function queueHooks(pipeline: PipelineDeps, metrics?: Metrics): QueueHooks {
  return {
    onDead: async (letter) => {
      const itemId = (letter.data as { itemId?: unknown }).itemId;
      if (typeof itemId !== 'string') return onIngestDead(pipeline, letter);
      return inTenantOfItem(pipeline, itemId, () => onIngestDead(pipeline, letter));
    },
    ...(metrics
      ? {
          onResult: (queue, result, seconds) => {
            metrics.queueJobs.inc({ queue, result });
            metrics.queueDuration.observe({ queue }, seconds);
          },
        }
      : {}),
  };
}
