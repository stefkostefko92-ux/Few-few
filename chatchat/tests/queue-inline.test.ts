import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { InlineJobBus } from '../src/queue/inline.js';
import {
  jobId,
  JobTimeout,
  queuePolicies,
  runAttempt,
  type DeadLetter,
  type JobHandlers,
  type QueuePolicies,
} from '../src/queue/jobs.js';

/**
 * Опашката в процеса (без REDIS_URL) има СЪЩАТА политика като BullMQ: повторни опити с
 * експоненциално забавяне, срок на опит, dead-letter след последния, идемпотентност по id на
 * задачата, таван на едновременността. (Същото върху Redis — tests/integration/queue-redis.)
 */

const policies: QueuePolicies = {
  ingest: { attempts: 3, backoffMs: 100, timeoutMs: 1_000, concurrency: 1 },
  ocr: { attempts: 2, backoffMs: 100, timeoutMs: 50, concurrency: 1 },
  embed: { attempts: 1, backoffMs: 100, timeoutMs: 1_000, concurrency: 1 },
};

function setup(handlers: Partial<JobHandlers>) {
  const sleeps: number[] = [];
  const dead: DeadLetter[] = [];
  const results: string[] = [];
  const bus = new InlineJobBus(policies, async (ms) => {
    sleeps.push(ms);
  });
  const noop = async () => undefined;
  bus.attach(
    { ingest: noop, ocr: noop, embed: noop, ...handlers },
    {
      onDead: async (l) => {
        dead.push(l);
      },
      onResult: (q, r) => results.push(`${q}:${r}`),
    },
  );
  return { bus, sleeps, dead, results };
}

describe('InlineJobBus', () => {
  test('временна грешка → нов опит с експоненциално забавяне, после успех', async () => {
    let calls = 0;
    const attempts: Array<[number, boolean]> = [];
    const { bus, sleeps, dead, results } = setup({
      ingest: async (_d, ctx) => {
        attempts.push([ctx.attempt, ctx.final]);
        calls += 1;
        if (calls < 3) throw new Error('db down');
      },
    });
    await bus.enqueue('ingest', { itemId: 'i1' }, { jobId: jobId('ingest', 'i1') });
    await bus.idle();
    assert.deepEqual(attempts, [
      [1, false],
      [2, false],
      [3, true],
    ]);
    assert.deepEqual(sleeps, [100, 200]);
    assert.deepEqual(dead, []);
    assert.deepEqual(results, ['ingest:retried', 'ingest:retried', 'ingest:completed']);
  });

  test('изчерпани опити → dead-letter с причината (име на грешката, без съобщението)', async () => {
    class StorageError extends Error {
      override name = 'StorageError';
    }
    const { bus, dead } = setup({
      ingest: async () => {
        throw new StorageError('/data/attachments/секретен път');
      },
    });
    await bus.enqueue('ingest', { itemId: 'i2' }, { jobId: 'ingest-i2' });
    await bus.idle();
    assert.deepEqual(dead, [
      {
        queue: 'ingest',
        jobId: 'ingest-i2',
        data: { itemId: 'i2' },
        attempts: 3,
        reason: 'StorageError',
      },
    ]);
  });

  test('срок на опита → JobTimeout (сигналът е прекъснат) → dead-letter', async () => {
    let aborted = false;
    const { bus, dead } = setup({
      ocr: (_d, ctx) =>
        new Promise((resolve) => {
          ctx.signal.addEventListener('abort', () => {
            aborted = true;
            resolve();
          });
        }),
    });
    await bus.enqueue('ocr', { itemId: 'i3' }, { jobId: 'ocr-i3' });
    await bus.idle();
    assert.equal(aborted, true);
    assert.equal(dead[0]?.reason, 'JobTimeout');
  });

  test('същият id на задача не се слага втори път, докато първата съществува', async () => {
    let calls = 0;
    const { bus } = setup({
      ingest: async () => {
        calls += 1;
      },
    });
    await Promise.all([
      bus.enqueue('ingest', { itemId: 'x' }, { jobId: 'ingest-x' }),
      bus.enqueue('ingest', { itemId: 'x' }, { jobId: 'ingest-x' }),
    ]);
    await bus.idle();
    assert.equal(calls, 1);
  });

  test('невалидни данни на задачата → dead-letter без обработчик', async () => {
    let calls = 0;
    const { bus, dead } = setup({
      ingest: async () => {
        calls += 1;
      },
    });
    await bus.enqueue('ingest', { itemId: '' } as { itemId: string }, { jobId: 'bad' });
    await bus.idle();
    assert.equal(calls, 0);
    assert.equal(dead[0]?.reason, 'invalid_data');
  });

  test('едновременност: опашката с таван 1 изпълнява по една задача', async () => {
    let running = 0;
    let peak = 0;
    const { bus } = setup({
      ingest: async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 5));
        running -= 1;
      },
    });
    for (const id of ['a', 'b', 'c']) await bus.enqueue('ingest', { itemId: id }, { jobId: id });
    await bus.idle();
    assert.equal(peak, 1);
  });
});

describe('политиката и помощниците', () => {
  test('id на задача: само [A-Za-z0-9_-]; повторен опит → суфикс', () => {
    assert.equal(jobId('ingest', 'ck1:abc'), 'ingest-ck1_abc');
    assert.equal(jobId('ocr', 'id', 2), 'ocr-id-r2');
  });

  test('политиката от средата (OCR има срок за целия документ + извличането)', () => {
    const p = queuePolicies({
      QUEUE_ATTEMPTS: 4,
      INGEST_CONCURRENCY: 2,
      OCR_CONCURRENCY: 1,
      INGEST_TIMEOUT_SECONDS: 60,
      OCR_TIMEOUT_SECONDS: 600,
    });
    assert.deepEqual(
      [p.ingest.attempts, p.ingest.timeoutMs, p.ocr.timeoutMs],
      [4, 60_000, 660_000],
    );
  });

  test('runAttempt: изтекъл срок → JobTimeout; външно прекъсване стига до работата', async () => {
    await assert.rejects(
      runAttempt(10, undefined, () => new Promise(() => undefined)),
      (e: unknown) => e instanceof JobTimeout,
    );
    const outer = new AbortController();
    const seen = runAttempt(
      1_000,
      outer.signal,
      (s) => new Promise((r) => s.addEventListener('abort', () => r(s.aborted))),
    );
    outer.abort();
    assert.equal(await seen, true);
  });
});
