import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import { BreakerDiagnosisModel, CircuitBreaker } from '../../src/ai/breaker.js';
import { createMetrics, type Metrics } from '../../src/observability/catalog.js';
import { db, resetDb, startApp, type Harness } from './helpers.js';
import { ask, newCase, seedWorld, type World } from './world.js';

/**
 * F3 (NFR-07, NFR-09) върху живото приложение: circuit breaker към модела в пътя на чата
 * (бърз 503 `ai_unavailable`, човешкото съобщение остава, повторът след затваряне отговаря),
 * /readyz запазва формата си за деплой сондата, а метриките са по шаблон и не са на публичния порт.
 */

let h: Harness;
let w: World;
let metrics: Metrics;
let now = 1_000_000;
const breaker = new CircuitBreaker({
  name: 'vertex_messages',
  failureThreshold: 2,
  cooldownMs: 30_000,
  now: () => now,
});

before(async () => {
  metrics = createMetrics();
  h = await startApp({
    metrics,
    wrapModel: (model) => new BreakerDiagnosisModel(model, breaker),
    aiCircuit: () => breaker.current,
  });
});
after(async () => {
  await h.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  h.model.reset();
  w = await seedWorld(h);
});

const humans = (caseId: string) => db.caseMessage.count({ where: { caseId, kind: 'HUMAN' } });

describe('Наблюдаемост и circuit breaker', () => {
  test('/readyz: ok + app + ai за сондата, плюс състоянието на breaker-а', async () => {
    const res = await fetch(`${h.base}/readyz`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      ok: true,
      app: 'chatchat',
      ai: true,
      aiCircuit: 'closed',
    });
  });

  test('/metrics НЕ е на публичния порт', async () => {
    const res = await fetch(`${h.base}/metrics`);
    assert.equal(res.status, 404);
    assert.doesNotMatch(await res.text(), /chatchat_http_requests_total/);
  });

  test('отворен breaker → бърз 503 без модела; повторът след cooldown отговаря на същото съобщение', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    h.model.plan = () => {
      throw new Error('vertex down');
    };
    for (let i = 0; i < 2; i += 1) {
      const res = await ask(w.portalAlfa, caseId, `Errore E37 #${i}`);
      assert.equal(res.status, 503);
      assert.equal(res.body.code ?? res.body.error, 'ai_unavailable');
    }
    assert.equal(breaker.current, 'open');
    const callsWhenOpened = h.model.calls;

    const clientMessageId = randomUUID();
    const fast = await ask(w.portalAlfa, caseId, 'Errore E37', { clientMessageId });
    assert.equal(fast.status, 503);
    assert.equal(fast.body.code ?? fast.body.error, 'ai_unavailable');
    assert.equal(h.model.calls, callsWhenOpened, 'отвореният breaker не вика модела');
    assert.equal((await db.case.findUniqueOrThrow({ where: { id: caseId } })).status, 'OPEN');
    const audit = await db.auditEvent.findFirst({
      where: { action: 'ai.error', objectId: caseId },
      orderBy: { id: 'desc' },
    });
    assert.deepEqual(audit?.detail, { name: 'CircuitOpenError' });
    const ready = (await (await fetch(`${h.base}/readyz`)).json()) as Record<string, unknown>;
    assert.deepEqual([ready.ok, ready.aiCircuit], [true, 'open'], 'готовността не пада');

    // Доставчикът се е върнал: след cooldown пробата минава и затваря breaker-а.
    h.model.reset();
    now += 30_000;
    const humansBefore = await humans(caseId);
    const retry = await ask(w.portalAlfa, caseId, 'Errore E37', { clientMessageId });
    assert.equal(retry.status, 200);
    assert.ok(retry.body.answer, 'повторът носи AI отговор');
    assert.equal(await humans(caseId), humansBefore, 'без второ човешко съобщение');
    assert.equal(breaker.current, 'closed');

    const text = metrics.registry.render();
    assert.match(
      text,
      /chatchat_http_requests_total\{method="POST",route="\/api\/v1\/chat\/messages",status="503"\} 3/,
    );
    assert.match(text, /chatchat_ai_answers_total\{outcome="ai_unavailable",input="text"\} 1/);
    assert.match(text, /chatchat_ai_answers_total\{outcome="error",input="text"\} 2/);
    assert.match(text, /chatchat_ai_answers_total\{outcome="answered",input="text"\} 1/);
    assert.ok(!text.includes(caseId), 'id на случая не е в етикетите');
    assert.ok(!text.includes(w.tenantA.id), 'tenant не е в етикетите');
    assert.match(text, /route="\/api\/v1\/sessions",status="201"/);
  });
});
