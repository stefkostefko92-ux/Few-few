import type {
  Message,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages/messages';
import type { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  BreakerDiagnosisModel,
  BreakerEmbeddingModel,
  CircuitBreaker,
  CircuitOpenError,
  classifyEmbeddingError,
  classifyModelError,
  type BreakerState,
} from '../src/ai/breaker.js';
import { EmbeddingError, type EmbeddingModel } from '../src/ai/embeddings.js';
import type { DiagnosisModel } from '../src/ai/model.js';
import { PrismaKnowledgeStore } from '../src/store/knowledge.js';

/**
 * Circuit breaker към Vertex (NFR-07) с фалшив часовник: отваряне след N последователни провала,
 * бърз отказ без мрежа, полуотворено състояние с ЕДНА проба, неутрален отказ от викащия.
 */

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

function breaker(opts: { threshold?: number; cooldownMs?: number } = {}) {
  const c = clock();
  const transitions: Array<[BreakerState, BreakerState]> = [];
  let rejects = 0;
  const b = new CircuitBreaker({
    name: 'test',
    failureThreshold: opts.threshold ?? 3,
    cooldownMs: opts.cooldownMs ?? 30_000,
    now: c.now,
    onTransition: (to, from) => transitions.push([from, to]),
    onReject: () => (rejects += 1),
  });
  return { b, c, transitions, rejects: () => rejects };
}

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });
const fail = (err: unknown) => () => Promise.reject(err);
const ok = () => Promise.resolve('ok');
/** Провалът на доставчика за класификатора: 5xx/мрежа = провал, 4xx = доставчикът е жив. */
const classify = (err: unknown) => classifyModelError(err, new AbortController().signal);

describe('CircuitBreaker', () => {
  test('N последователни провала → отворен; отказът е бърз и без извикване', async () => {
    const { b, transitions, rejects } = breaker({ threshold: 3 });
    for (let i = 0; i < 3; i += 1) {
      await assert.rejects(b.run(fail(httpError(503)), classify), /HTTP 503/);
    }
    assert.equal(b.current, 'open');
    assert.deepEqual(transitions, [['closed', 'open']]);
    let called = false;
    await assert.rejects(
      b.run(() => {
        called = true;
        return ok();
      }, classify),
      (err: unknown) => err instanceof CircuitOpenError && err.status === 503,
    );
    assert.equal(called, false, 'отвореният breaker не стига до доставчика');
    assert.equal(rejects(), 1);
  });

  test('успех нулира броя: провалите трябва да са ПОСЛЕДОВАТЕЛНИ', async () => {
    const { b } = breaker({ threshold: 3 });
    await assert.rejects(b.run(fail(httpError(500)), classify));
    await assert.rejects(b.run(fail(httpError(500)), classify));
    assert.equal(await b.run(ok, classify), 'ok');
    await assert.rejects(b.run(fail(httpError(500)), classify));
    await assert.rejects(b.run(fail(httpError(500)), classify));
    assert.equal(b.current, 'closed');
  });

  test('4xx (без 429) не е провал на доставчика; 429 е', async () => {
    const { b } = breaker({ threshold: 2 });
    for (let i = 0; i < 5; i += 1) await assert.rejects(b.run(fail(httpError(400)), classify));
    assert.equal(b.current, 'closed');
    await assert.rejects(b.run(fail(httpError(429)), classify));
    await assert.rejects(b.run(fail(httpError(429)), classify));
    assert.equal(b.current, 'open');
  });

  test('след cooldown — ЕДНА проба; паралелна заявка е отказана; успех → затворен', async () => {
    const { b, c, transitions } = breaker({ threshold: 1, cooldownMs: 30_000 });
    await assert.rejects(b.run(fail(new Error('network')), classify));
    assert.equal(b.current, 'open');
    c.advance(29_999);
    await assert.rejects(b.run(ok, classify), CircuitOpenError);

    c.advance(1);
    let release: (v: string) => void = () => undefined;
    const probe = b.run(() => new Promise<string>((r) => (release = r)), classify);
    assert.equal(b.current, 'half_open');
    await assert.rejects(b.run(ok, classify), CircuitOpenError, 'втора проба не се пуска');
    release('ok');
    assert.equal(await probe, 'ok');
    assert.equal(b.current, 'closed');
    assert.deepEqual(transitions, [
      ['closed', 'open'],
      ['open', 'half_open'],
      ['half_open', 'closed'],
    ]);
  });

  test('провалена проба → отворен наново с нов cooldown', async () => {
    const { b, c } = breaker({ threshold: 1, cooldownMs: 10_000 });
    await assert.rejects(b.run(fail(httpError(502)), classify));
    c.advance(10_000);
    await assert.rejects(b.run(fail(httpError(502)), classify), /HTTP 502/);
    assert.equal(b.current, 'open');
    c.advance(9_999);
    await assert.rejects(b.run(ok, classify), CircuitOpenError);
    c.advance(1);
    assert.equal(await b.run(ok, classify), 'ok');
    assert.equal(b.current, 'closed');
  });

  test('отказ от викащия е неутрален: не брои и освобождава пробата', async () => {
    const { b, c } = breaker({ threshold: 1, cooldownMs: 1_000 });
    const user = new AbortController();
    user.abort();
    const byUser = (err: unknown) => classifyModelError(err, user.signal);
    for (let i = 0; i < 3; i += 1) await assert.rejects(b.run(fail(new Error('abort')), byUser));
    assert.equal(b.current, 'closed');

    await assert.rejects(b.run(fail(httpError(503)), classify));
    c.advance(1_000);
    await assert.rejects(b.run(fail(new Error('abort')), byUser));
    assert.equal(b.current, 'half_open', 'пробата е освободена, не е провал');
    assert.equal(await b.run(ok, classify), 'ok');
    assert.equal(b.current, 'closed');
  });

  test('изтекъл краен срок (AbortSignal.timeout) е провал', async () => {
    const signal = AbortSignal.abort(new DOMException('deadline', 'TimeoutError'));
    assert.equal(classifyModelError(new Error('aborted'), signal), 'failure');
    assert.equal(classifyModelError(new Error('aborted'), AbortSignal.abort()), 'neutral');
  });

  test('остарял резултат (пуснат преди отварянето) не затваря breaker-а', async () => {
    const { b } = breaker({ threshold: 1 });
    let release: (v: string) => void = () => undefined;
    const slow = b.run(() => new Promise<string>((r) => (release = r)), classify);
    await assert.rejects(b.run(fail(httpError(503)), classify));
    assert.equal(b.current, 'open');
    release('ok');
    await slow;
    assert.equal(b.current, 'open');
  });
});

describe('Декораторите', () => {
  test('DiagnosisModel: отвореният breaker отказва без да вика Vertex', async () => {
    let calls = 0;
    const inner: DiagnosisModel = {
      create: () => {
        calls += 1;
        return Promise.reject(httpError(503));
      },
    };
    const { b } = breaker({ threshold: 2 });
    const model = new BreakerDiagnosisModel(inner, b);
    const params = {} as MessageCreateParamsNonStreaming;
    const signal = new AbortController().signal;
    await assert.rejects(model.create(params, signal));
    await assert.rejects(model.create(params, signal));
    await assert.rejects(model.create(params, signal), CircuitOpenError);
    assert.equal(calls, 2);

    const fine: DiagnosisModel = { create: () => Promise.resolve({ id: 'm' } as Message) };
    assert.equal(
      (await new BreakerDiagnosisModel(fine, breaker().b).create(params, signal)).id,
      'm',
    );
  });

  test('embeddings: id-то е на истинския модел; 0/429/5xx — провал, 401 — не', () => {
    const inner: EmbeddingModel = {
      id: 'gemini-embedding-001@768',
      embed: () => Promise.resolve([]),
    };
    assert.equal(new BreakerEmbeddingModel(inner, breaker().b).id, 'gemini-embedding-001@768');
    assert.equal(classifyEmbeddingError(new EmbeddingError('мрежа', 0)), 'failure');
    assert.equal(classifyEmbeddingError(new EmbeddingError('квота', 429)), 'failure');
    assert.equal(classifyEmbeddingError(new EmbeddingError('сървър', 503)), 'failure');
    assert.equal(classifyEmbeddingError(new EmbeddingError('токен', 401)), 'success');
  });

  test('отворен breaker при embeddings → търсенето е лексикално (fail-open), нищо не гърми', async () => {
    let calls = 0;
    const inner: EmbeddingModel = {
      id: 'gemini-embedding-001@768',
      embed: () => {
        calls += 1;
        return Promise.reject(new EmbeddingError('Vertex embeddings: HTTP 503', 503));
      },
    };
    const { b } = breaker({ threshold: 1 });
    const errors: unknown[] = [];
    // Базата не трябва да се докосва: векторът липсва още преди SQL-а.
    const store = new PrismaKnowledgeStore({} as PrismaClient, {
      embedder: new BreakerEmbeddingModel(inner, b),
      onError: (err) => errors.push(err),
    });
    const scope = { tenantId: 't1', audiences: ['PORTAL' as const] };
    assert.deepEqual(await store.searchSemantic(scope, 'QM-1', 'porta non chiude', 5), []);
    assert.equal(b.current, 'open');
    assert.deepEqual(await store.searchSemantic(scope, 'QM-1', 'porta non chiude', 5), []);
    assert.equal(calls, 1, 'вторият въпрос не стига до Vertex');
    assert.ok(errors[1] instanceof CircuitOpenError);
  });
});
