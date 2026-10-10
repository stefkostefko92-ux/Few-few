import { ThreadParser } from '../../src/ingest/isolate.js';
import type { PipelineDeps } from '../../src/ingest/pipeline.js';
import { InlineJobBus } from '../../src/queue/inline.js';
import type { QueuePolicies } from '../../src/queue/jobs.js';
import { jobHandlers, queueHooks } from '../../src/queue/runtime.js';
import { FakeOcr, FakeRasterizer } from '../fake-ocr.js';
import { db, type Client } from './helpers.js';
import { SpyStore } from './files.js';

/**
 * Приемането през опашката в интеграционните тестове: опашката в процеса (същата политика като
 * BullMQ, кратки забавяния), истинската нишка за разбора, фалшив OCR (истинският — в Docker smoke
 * теста). Хранилището може да „пада“ при четене — за повторните опити и dead-letter.
 */

export class FlakyStore extends SpyStore {
  /** Колко пъти четенето да хвърли (временна грешка на диска). */
  failReads = 0;

  override async get(key: string): Promise<Buffer | null> {
    if (this.failReads > 0) {
      this.failReads -= 1;
      throw Object.assign(new Error('EIO'), { name: 'StorageError' });
    }
    return super.get(key);
  }
}

export const FAST_POLICIES: QueuePolicies = {
  ingest: { attempts: 2, backoffMs: 10, timeoutMs: 60_000, concurrency: 2 },
  ocr: { attempts: 2, backoffMs: 10, timeoutMs: 60_000, concurrency: 1 },
  embed: { attempts: 1, backoffMs: 10, timeoutMs: 60_000, concurrency: 1 },
};

export function ingestRig(store: FlakyStore) {
  const bus = new InlineJobBus(FAST_POLICIES);
  const ocr = { engine: new FakeOcr(), rasterizer: new FakeRasterizer() };
  const pipeline: PipelineDeps = {
    db,
    store,
    bus,
    parser: new ThreadParser({ heapMb: 256, timeoutMs: 60_000 }),
    ocr,
    settings: {
      tmpDir: '',
      ocrMaxPages: 50,
      ocrPageTimeoutMs: 10_000,
      ocrTimeoutMs: 60_000,
      parseTimeoutMs: 30_000,
    },
    logger: { warn: () => undefined, info: () => undefined },
  };
  bus.attach(
    jobHandlers(pipeline, async () => undefined),
    queueHooks(pipeline),
  );
  return { bus, ocr, pipeline };
}

/** Документ за базата знания (антивирус → CLEAN) — id на файла или отговорът при отказ. */
export async function uploadKb(c: Client, bytes: Uint8Array, name: string) {
  return c.upload(`/api/v1/admin/attachments?name=${encodeURIComponent(name)}`, bytes);
}

export async function cleanKb(c: Client, bytes: Uint8Array, name: string): Promise<string> {
  const res = await uploadKb(c, bytes, name);
  if (res.status !== 201)
    throw new Error(`качването не мина: ${res.status} ${JSON.stringify(res.body)}`);
  return (res.body as { attachment: { id: string } }).attachment.id;
}
