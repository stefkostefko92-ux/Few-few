import express from 'express';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { describe, test } from 'node:test';
import { CircuitOpenError } from '../src/ai/breaker.js';
import type { DiagnoseOutput } from '../src/ai/orchestrator.js';
import type { Diagnoser } from '../src/app.js';
import { failureOutcome, instrumentDiagnoser, meteredScanner } from '../src/observability/ai.js';
import { createMetrics } from '../src/observability/catalog.js';
import { httpMetrics } from '../src/observability/http.js';
import { RealtimeHub, type PublishResult } from '../src/realtime/hub.js';

/**
 * Инструментирането (NFR-09): RED по ШАБЛОН на маршрута (никога суровият път с id), изходите на
 * AI, намесите на Safety Gate, антивирусът и доставката в реално време.
 */

async function serve(app: express.Express) {
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

describe('RED по маршрут', () => {
  test('етикетът е шаблонът (`:id`), не id-то; без маршрут — фиксирани кофи', async () => {
    const m = createMetrics();
    const app = express();
    app.use(httpMetrics(m));
    const api = express.Router();
    api.get('/cases/:id', (_req, res) => {
      res.json({ ok: true });
    });
    api.post('/cases/:id/boom', () => {
      throw new Error('boom');
    });
    app.use('/api/v1', api);
    app.get('/q/:token', (_req, res) => res.redirect(302, '/'));
    app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));
    app.use((_req, res) => res.status(404).end());
    const s = await serve(app);
    try {
      await fetch(`${s.base}/api/v1/cases/c_mario_rossi_42`);
      await fetch(`${s.base}/api/v1/cases/cl9x0secret?x=1`);
      await fetch(`${s.base}/api/v1/cases/c1/boom`, { method: 'POST' });
      await fetch(`${s.base}/q/QRTOKEN123456`, { redirect: 'manual' });
      await fetch(`${s.base}/api/v1/nope/abc`);
      await fetch(`${s.base}/app.js`);
    } finally {
      await s.close();
    }
    const text = m.registry.render();
    assert.match(
      text,
      /chatchat_http_requests_total\{method="GET",route="\/api\/v1\/cases\/:id",status="200"\} 2/,
    );
    assert.match(text, /route="\/api\/v1\/cases\/:id\/boom",status="500"/);
    assert.match(text, /route="\/q\/:token",status="302"/);
    assert.match(text, /route="\(unmatched\)",status="404"/);
    assert.match(text, /route="\(static\)",status="404"/);
    for (const leak of ['mario', 'cl9x0secret', 'QRTOKEN', 'nope', 'x=1']) {
      assert.ok(!text.includes(leak), `суровият път не изтича в етикетите: ${leak}`);
    }
    assert.match(
      text,
      /chatchat_http_request_duration_seconds_count\{method="GET",route="\/api\/v1\/cases\/:id"\} 2/,
    );
  });

  test('SSE потокът се брои, но не влиза в латентността', async () => {
    const m = createMetrics();
    const app = express();
    app.use(httpMetrics(m));
    app.get('/api/v1/events', (_req, res) => {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.end(': bye\n\n');
    });
    const s = await serve(app);
    try {
      await (await fetch(`${s.base}/api/v1/events`)).text();
    } finally {
      await s.close();
    }
    const text = m.registry.render();
    assert.match(text, /route="\/api\/v1\/events",status="200"\} 1/);
    assert.doesNotMatch(text, /duration_seconds_count\{method="GET",route="\/api\/v1\/events"\}/);
  });
});

const output = (modelCalled: boolean, decisions: string[], level = 'standard') =>
  ({
    answer: { gate: { decisions }, safety: { level } },
    evidence: [],
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, toolRounds: 0 },
    modelCalled,
  }) as unknown as DiagnoseOutput;

const input = (files = 0) =>
  ({
    attachments:
      files > 0
        ? { photos: [{ ref: 'P1' }], logs: [], notSent: [] }
        : { photos: [], logs: [], notSent: [] },
  }) as unknown as Parameters<Diagnoser>[0];

describe('AI изход и Safety Gate', () => {
  test('answered / no_evidence + намесите по причина (дедупликирани, само кодове)', async () => {
    const m = createMetrics();
    const plan: DiagnoseOutput[] = [
      output(
        true,
        ['gate.removed.directCommand', 'gate.removed.directCommand', 'ai.refusal'],
        'blocked',
      ),
      output(false, ['gate.noApplicableSource']),
      output(true, ['Mario Rossi ha chiamato']),
    ];
    const d = instrumentDiagnoser(() => Promise.resolve(plan.shift() as DiagnoseOutput), m);
    const signal = new AbortController().signal;
    await d(input(), signal);
    await d(input(), signal);
    await d(input(1), signal);
    assert.equal(m.aiAnswers.get({ outcome: 'answered', input: 'text' }), 1);
    assert.equal(m.aiAnswers.get({ outcome: 'no_evidence', input: 'text' }), 1);
    assert.equal(m.aiAnswers.get({ outcome: 'answered', input: 'files' }), 1);
    assert.equal(m.gateInterventions.get({ reason: 'gate.removed.directCommand' }), 1);
    assert.equal(m.gateInterventions.get({ reason: 'ai.refusal' }), 1);
    assert.equal(m.gateInterventions.get({ reason: 'other' }), 1);
    assert.equal(m.gateLevels.get({ level: 'blocked' }), 1);
    assert.ok(!m.registry.render().includes('Mario'));
    assert.equal(m.aiDuration.snapshot({ outcome: 'answered', input: 'text' }).count, 1);
  });

  test('провалите: breaker → ai_unavailable, краен срок → timeout, затворен браузър → cancelled', async () => {
    const live = new AbortController().signal;
    const cancelled = AbortSignal.abort();
    assert.equal(failureOutcome(new CircuitOpenError('vertex_messages'), live), 'ai_unavailable');
    const userAbort = Object.assign(new Error('aborted'), { name: 'APIUserAbortError' });
    assert.equal(failureOutcome(userAbort, live), 'timeout');
    assert.equal(failureOutcome(userAbort, cancelled), 'cancelled');
    assert.equal(failureOutcome(Object.assign(new Error('x'), { status: 500 }), live), 'error');

    const m = createMetrics();
    const d = instrumentDiagnoser(() => Promise.reject(new CircuitOpenError('v')), m);
    await assert.rejects(
      d(input(), live),
      CircuitOpenError,
      'грешката стига до рутера непроменена',
    );
    assert.equal(m.aiAnswers.get({ outcome: 'ai_unavailable', input: 'text' }), 1);
  });
});

describe('Антивирус и реално време', () => {
  test('присъдата и причината за FAILED; нищо от файла', async () => {
    const m = createMetrics();
    const verdicts = [
      { status: 'CLEAN' as const },
      { status: 'INFECTED' as const, signature: 'Eicar-Test-Signature' },
      { status: 'FAILED' as const, reason: 'timeout' as const },
    ];
    const scanner = meteredScanner({ scan: () => Promise.resolve(verdicts.shift()!) }, m);
    for (let i = 0; i < 3; i += 1) await scanner.scan(new Uint8Array([1]));
    assert.equal(m.avScans.get({ verdict: 'CLEAN', reason: '' }), 1);
    assert.equal(m.avScans.get({ verdict: 'INFECTED', reason: '' }), 1);
    assert.equal(m.avScans.get({ verdict: 'FAILED', reason: 'timeout' }), 1);
    assert.equal(m.avDuration.snapshot().count, 3);
    assert.ok(!m.registry.render().includes('Eicar'), 'сигнатурата не е етикет');
  });

  test('хъбът съобщава изхода и закъснението на доставката', async () => {
    const seen: Array<[string, PublishResult, number]> = [];
    const hub = new RealtimeHub({ onPublished: (type, result, s) => seen.push([type, result, s]) });
    const event = { type: 'message.created' as const, tenantId: 't1', actorId: 'u0' };
    await hub.publish(event, ['u1'], () => Promise.resolve(new Map()));
    hub.attach({
      userId: 'u1',
      sessionId: 's1',
      tenantId: 't1',
      write: () => undefined,
      end: () => undefined,
    });
    await hub.publish(event, ['u1'], (ids) => Promise.resolve(new Map(ids.map((id) => [id, {}]))));
    await assert.rejects(hub.publish(event, ['u1'], () => Promise.reject(new Error('db'))));
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(
      seen.map(([t, r]) => [t, r]),
      [
        ['message.created', 'no_recipients'],
        ['message.created', 'delivered'],
        ['message.created', 'error'],
      ],
    );
    assert.ok(seen.every(([, , s]) => s >= 0 && s < 2));
  });
});
