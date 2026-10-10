import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { Queue } from 'bullmq';
import { ThreadParser } from '../../src/ingest/isolate.js';
import type { PipelineDeps } from '../../src/ingest/pipeline.js';
import { BullJobBus, WorkerHost } from '../../src/queue/bull.js';
import type { DeadLetter, JobHandlers, QueuePolicies } from '../../src/queue/jobs.js';
import { jobHandlers, queueHooks } from '../../src/queue/runtime.js';
import { FakeOcr, FakeRasterizer } from '../fake-ocr.js';
import { makePdf } from '../file-fixtures.js';
import { makeDocx } from '../ingest-fixtures.js';
import { db, resetDb, startApp, type Harness } from './helpers.js';
import { FakeScanner, URL_KEY } from './files.js';
import { cleanKb, FlakyStore } from './ingest-world.js';
import { startRedis, type TestRedis } from './redis.js';
import { EFFECTIVE_FROM, MODEL, seedWorld } from './world.js';

/**
 * Опашките върху Redis 7 + BullMQ 6 (NFR-06/07): задачата се изпълнява в отделен WorkerHost;
 * повторен опит с експоненциално забавяне, dead-letter (опашката `dead` + файлът FAILED),
 * невалидни данни → веднага dead-letter, идемпотентност по id на задачата, плавно спиране; и целият
 * път на файл: API (само слага задачата) → worker (разбор + OCR) → документ-ЧЕРНОВА.
 */

const policies: QueuePolicies = {
  ingest: { attempts: 3, backoffMs: 50, timeoutMs: 30_000, concurrency: 2 },
  ocr: { attempts: 2, backoffMs: 50, timeoutMs: 30_000, concurrency: 1 },
  embed: { attempts: 2, backoffMs: 50, timeoutMs: 30_000, concurrency: 1 },
};

let redis: TestRedis;
before(async () => {
  redis = await startRedis();
});
after(async () => {
  await redis.stop();
  await db.$disconnect();
});

async function until<T>(fn: () => Promise<T | null | undefined | false>, ms = 20_000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error('условието не се изпълни навреме');
    await new Promise((r) => setTimeout(r, 50));
  }
}

function rig(handlers: Partial<JobHandlers>) {
  const prefix = `${redis.prefix}-${Math.random().toString(36).slice(2, 8)}`;
  const conn = redis.client('worker', true);
  const bus = new BullJobBus(conn, policies, prefix);
  const dead: DeadLetter[] = [];
  const results: string[] = [];
  const noop = async () => undefined;
  const host = new WorkerHost(
    conn,
    bus,
    policies,
    { ingest: noop, ocr: noop, embed: noop, ...handlers },
    {
      onDead: async (l) => {
        dead.push(l);
      },
      onResult: (q, r) => results.push(`${q}:${r}`),
    },
    { warn: () => undefined },
  );
  host.start();
  return { bus, host, dead, results, prefix, conn };
}

describe('BullMQ опашки', () => {
  test('задача → обработчикът; същият id втори път не се слага (идемпотентност)', async () => {
    const seen: string[] = [];
    const r = rig({
      ingest: async (d) => {
        seen.push(d.itemId);
      },
    });
    await r.bus.enqueue('ingest', { itemId: 'i1' }, { jobId: 'ingest-i1' });
    await r.bus.enqueue('ingest', { itemId: 'i1' }, { jobId: 'ingest-i1' });
    await until(async () => r.results.includes('ingest:completed'));
    await new Promise((res) => setTimeout(res, 200));
    assert.deepEqual(seen, ['i1']);
    await r.host.close(5_000);
    await r.bus.close();
  });

  test('временна грешка → повторен опит (attempt/final) → успех', async () => {
    const attempts: Array<[number, boolean]> = [];
    const r = rig({
      ingest: async (_d, ctx) => {
        attempts.push([ctx.attempt, ctx.final]);
        if (ctx.attempt < 3) throw new Error('db down');
      },
    });
    await r.bus.enqueue('ingest', { itemId: 'i2' }, { jobId: 'ingest-i2' });
    await until(async () => r.results.includes('ingest:completed'));
    assert.deepEqual(attempts, [
      [1, false],
      [2, false],
      [3, true],
    ]);
    assert.deepEqual(r.results, ['ingest:retried', 'ingest:retried', 'ingest:completed']);
    assert.deepEqual(r.dead, []);
    await r.host.close(5_000);
    await r.bus.close();
  });

  test('изчерпани опити → опашката dead (само id-та и причина) + onDead', async () => {
    class Boom extends Error {
      override name = 'StorageError';
    }
    const r = rig({
      ocr: async () => {
        throw new Boom('секретен път /data');
      },
    });
    await r.bus.enqueue('ocr', { itemId: 'i3' }, { jobId: 'ocr-i3' });
    const [letter] = await until(async () => (r.dead.length > 0 ? r.dead : null));
    assert.deepEqual(letter, {
      queue: 'ocr',
      jobId: 'ocr-i3',
      data: { itemId: 'i3' },
      attempts: 2,
      reason: 'StorageError',
    });
    const deadQueue = new Queue('dead', { connection: redis.client(), prefix: r.prefix });
    const jobs = await deadQueue.getJobs(['wait']);
    assert.equal(jobs.length, 1);
    const stored = JSON.stringify(jobs[0]?.data);
    assert.match(stored, /"jobId":"ocr-i3"/);
    assert.doesNotMatch(stored, /секретен/);
    await deadQueue.close();
    await r.host.close(5_000);
    await r.bus.close();
  });

  test('невалидни данни (чужда задача в опашката) → веднага dead-letter, без обработчика', async () => {
    let called = false;
    const r = rig({
      embed: async () => {
        called = true;
      },
    });
    const raw = new Queue('embed', { connection: redis.client(), prefix: r.prefix });
    await raw.add('embed', { documentId: 42, extra: '<script>' }, { attempts: 3 });
    const [letter] = await until(async () => (r.dead.length > 0 ? r.dead : null));
    assert.deepEqual([letter?.reason, letter?.attempts, called], ['invalid_data', 1, false]);
    await raw.close();
    await r.host.close(5_000);
    await r.bus.close();
  });

  test('плавно спиране: текущата задача довършва, преди close да се върне', async () => {
    let finished = false;
    let started = false;
    const r = rig({
      embed: async () => {
        started = true;
        await new Promise((res) => setTimeout(res, 500));
        finished = true;
      },
    });
    await r.bus.enqueue('embed', { documentId: 'd1' }, { jobId: 'embed-d1', dedupe: true });
    await until(async () => started);
    await r.host.close(10_000);
    assert.equal(finished, true);
    await r.bus.close();
  });

  test('периодичният преглед на векторите е Job Scheduler (идемпотентно, 0 → махнат)', async () => {
    const r = rig({});
    await r.bus.scheduleEmbedSweep(600);
    await r.bus.scheduleEmbedSweep(600);
    const q = new Queue('embed', { connection: redis.client(), prefix: r.prefix });
    assert.equal((await q.getJobSchedulers()).length, 1);
    await r.bus.scheduleEmbedSweep(0);
    assert.equal((await q.getJobSchedulers()).length, 0);
    await q.close();
    await r.host.close(5_000);
    await r.bus.close();
  });
});

describe('целият път през Redis: API → worker → ЧЕРНОВА', () => {
  let h: Harness;
  const store = new FlakyStore();
  let worker: ReturnType<typeof rig> | null = null;
  let apiBus: BullJobBus;

  before(async () => {
    const prefix = `${redis.prefix}-flow`;
    apiBus = new BullJobBus(redis.client('api'), policies, prefix);
    h = await startApp({
      attachments: { store, scanner: new FakeScanner(), urlKey: URL_KEY },
      ingest: { bus: apiBus },
    });
    const conn = redis.client('worker', true);
    const workerBus = new BullJobBus(conn, policies, prefix);
    const pipeline: PipelineDeps = {
      db,
      store,
      bus: workerBus,
      parser: new ThreadParser({ heapMb: 256, timeoutMs: 30_000 }),
      ocr: { engine: new FakeOcr(), rasterizer: new FakeRasterizer() },
      settings: {
        tmpDir: '',
        ocrMaxPages: 10,
        ocrPageTimeoutMs: 10_000,
        ocrTimeoutMs: 30_000,
        parseTimeoutMs: 30_000,
      },
      logger: { warn: () => undefined, info: () => undefined },
    };
    const host = new WorkerHost(
      conn,
      workerBus,
      policies,
      jobHandlers(pipeline, async () => undefined),
      queueHooks(pipeline),
      { warn: () => undefined },
    );
    host.start();
    worker = { bus: workerBus, host, dead: [], results: [], prefix, conn };
  });
  after(async () => {
    await worker?.host.close(5_000);
    await worker?.bus.close();
    await apiBus.close();
    await h.close();
  });
  beforeEach(async () => {
    await resetDb();
    store.reset();
  });

  test('DOCX и сканиран PDF (OCR в worker-а) → DONE; API-то само е сложило задачите', async () => {
    const w = await seedWorld(h);
    const created = await w.ownerA1.post('/api/v1/admin/ingest/batches', {
      defaults: {
        type: 'MANUAL',
        language: 'it',
        revision: 'A',
        audience: 'INTERNAL',
        safetyRelevant: false,
        effectiveFrom: EFFECTIVE_FROM,
        applicability: [{ productModel: MODEL, allFirmware: true }],
      },
    });
    const batchId = created.body.batch.id as string;
    for (const [name, bytes] of [
      ['guida.docx', makeDocx([{ style: 'Titolo1', text: 'Capitolo' }, { text: 'Relè K1.' }])],
      ['scan.pdf', makePdf([[], ['Testo pagina due.']])],
    ] as const) {
      const id = await cleanKb(w.ownerA1, bytes, name);
      const res = await w.ownerA1.post(`/api/v1/admin/ingest/batches/${batchId}/items`, {
        attachmentId: id,
      });
      assert.equal(res.status, 202);
    }
    const batch = await until(async () => {
      const res = await w.ownerA1.get(`/api/v1/admin/ingest/batches/${batchId}`);
      return res.body.batch.counts.DONE === 2 ? res.body.batch : null;
    });
    const scan = batch.items.find((i: { fileName: string }) => i.fileName === 'scan.pdf');
    assert.equal(scan.ocrPages, 1);
    const docs = await db.document.findMany({
      where: {
        tenantId: w.tenantA.id,
        status: 'DRAFT',
        sourceFilename: { in: ['guida.docx', 'scan.pdf'] },
      },
    });
    assert.equal(docs.length, 2);
  });
});
