import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { describe, test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { createMetrics, gateReason } from '../src/observability/catalog.js';
import { Counter, Gauge, Histogram, Registry } from '../src/observability/metrics.js';
import { startMetricsServer } from '../src/observability/server.js';

/**
 * Регистърът (текстов формат 0.0.4), таванът на кардиналността, отделният слушател и настройките
 * METRICS_* (NFR-09). Без мрежа навън — слушателят е на 127.0.0.1 с ефимерен порт.
 */

describe('Регистърът', () => {
  test('брояч, gauge и хистограма в текстовия формат (кумулативни кофи, +Inf, _sum, _count)', () => {
    const reg = new Registry();
    const c = reg.register(
      new Counter<'route'>({ name: 'x_total', help: 'Брояч.', labelNames: ['route'] }),
    );
    const g = reg.register(new Gauge({ name: 'x_open', help: 'Отворени.' }));
    const h = reg.register(
      new Histogram<'outcome'>({
        name: 'x_seconds',
        help: 'Време.',
        labelNames: ['outcome'],
        buckets: [8, 1, 2],
      }),
    );
    c.inc({ route: '/api/v1/cases/:id' });
    c.inc({ route: '/api/v1/cases/:id' }, 2);
    c.inc({ route: '/x' }, -5); // броячът не намалява
    g.set(undefined, 3);
    for (const v of [0.5, 1.5, 7.9, 8, 9]) h.observe({ outcome: 'answered' }, v);
    const text = reg.render();
    assert.match(text, /^# TYPE x_total counter$/m);
    assert.match(text, /^x_total\{route="\/api\/v1\/cases\/:id"\} 3$/m);
    assert.doesNotMatch(text, /route="\/x"/);
    assert.match(text, /^x_open 3$/m);
    assert.match(text, /^x_seconds_bucket\{outcome="answered",le="1"\} 1$/m);
    assert.match(text, /^x_seconds_bucket\{outcome="answered",le="2"\} 2$/m);
    assert.match(text, /^x_seconds_bucket\{outcome="answered",le="8"\} 4$/m);
    assert.match(text, /^x_seconds_bucket\{outcome="answered",le="\+Inf"\} 5$/m);
    assert.match(text, /^x_seconds_sum\{outcome="answered"\} 26\.9$/m);
    assert.match(text, /^x_seconds_count\{outcome="answered"\} 5$/m);
    assert.ok(text.endsWith('\n'));
  });

  test('стойностите на етикетите се екранират; дълга стойност → „invalid“', () => {
    const reg = new Registry();
    const c = reg.register(new Counter<'l'>({ name: 'e_total', help: 'h\nx', labelNames: ['l'] }));
    c.inc({ l: 'a"b\\c\nd' });
    c.inc({ l: 'x'.repeat(65) });
    const text = reg.render();
    assert.match(text, /^# HELP e_total h\\nx$/m);
    assert.ok(text.includes('e_total{l="a\\"b\\\\c\\nd"} 1'));
    assert.ok(text.includes('e_total{l="invalid"} 1'));
  });

  test('таван на сериите: новите се изпускат и се броят, старите продължават', () => {
    const reg = new Registry();
    const c = reg.register(
      new Counter<'id'>({ name: 'boom_total', help: 'h', labelNames: ['id'], maxSeries: 2 }),
    );
    for (const id of ['a', 'b', 'c', 'd']) c.inc({ id });
    c.inc({ id: 'a' });
    const text = reg.render();
    assert.match(text, /^boom_total\{id="a"\} 2$/m);
    assert.doesNotMatch(text, /id="c"/);
    assert.match(text, /^chatchat_metrics_series_dropped_total\{metric="boom_total"\} 2$/m);
  });

  test('невалидни имена и запазеният етикет `le` се отказват при дефиниране', () => {
    assert.throws(() => new Counter({ name: 'bad-name', help: 'h' }));
    assert.throws(
      () => new Histogram<'le'>({ name: 'h', help: 'h', labelNames: ['le'], buckets: [1] }),
    );
    const reg = new Registry();
    reg.register(new Counter({ name: 'dup_total', help: 'h' }));
    assert.throws(() => reg.register(new Counter({ name: 'dup_total', help: 'h' })));
  });

  test('каталогът: кофа точно на 8 s (NFR-02) и на 2 s (NFR-11); процесни метрики', () => {
    const m = createMetrics();
    assert.ok(m.aiDuration.buckets.includes(8));
    assert.ok(m.realtimeDelivery.buckets.includes(2));
    const text = m.registry.render();
    assert.match(text, /^process_resident_memory_bytes \d+$/m);
    assert.match(text, /^process_start_time_seconds \d+$/m);
    assert.match(text, /^# TYPE chatchat_ai_answer_duration_seconds histogram$/m);
  });

  test('причината на Safety Gate е код или „other“ — никога свободен текст', () => {
    assert.equal(gateReason('gate.removed.directCommand'), 'gate.removed.directCommand');
    assert.equal(gateReason('ai.refusal'), 'ai.refusal');
    assert.equal(gateReason('Mario Rossi mario@example.it'), 'other');
    assert.equal(gateReason('gate.' + 'x'.repeat(60)), 'other');
  });
});

describe('Слушателят на /metrics', () => {
  test('само GET/HEAD /metrics; другото — 404/405', async () => {
    const m = createMetrics();
    m.httpRequests.inc({ method: 'GET', route: '/healthz', status: '200' });
    const server = await startMetricsServer(m.registry, { host: '127.0.0.1', port: 0 });
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    try {
      const res = await fetch(`${base}/metrics`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /^text\/plain; version=0\.0\.4/);
      assert.match(
        await res.text(),
        /chatchat_http_requests_total\{method="GET",route="\/healthz",status="200"\} 1/,
      );
      assert.equal((await fetch(`${base}/`)).status, 404);
      assert.equal((await fetch(`${base}/metrics/x`)).status, 404);
      assert.equal((await fetch(`${base}/metrics`, { method: 'POST' })).status, 405);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});

describe('Настройките METRICS_* и празните стойности от compose', () => {
  const base = {
    PUBLIC_BASE_URL: 'https://chatchat.test',
    DATABASE_URL: 'postgresql://x',
    SESSION_PEPPER: 'p'.repeat(32),
    MFA_ENC_KEY: Buffer.alloc(32, 1).toString('base64'),
  };

  test('по подразбиране метриките са изключени и на loopback', () => {
    const cfg = loadConfig(base);
    assert.equal(cfg.METRICS_PORT, 0);
    assert.equal(cfg.METRICS_HOST, '127.0.0.1');
    assert.equal(cfg.AI_BREAKER_FAILURES, 5);
    assert.equal(cfg.AI_BREAKER_COOLDOWN_SECONDS, 30);
  });

  test('празен низ (`${X:-}` в docker-compose.yml) = „не е зададено“', () => {
    const cfg = loadConfig({ ...base, METRICS_PORT: '', EMBEDDING_MODEL: '', AI_MODEL: '' });
    assert.equal(cfg.METRICS_PORT, 0);
    assert.equal(cfg.EMBEDDING_MODEL, 'gemini-embedding-001');
    assert.equal(cfg.AI_MODEL, 'claude-opus-5');
    assert.throws(() => loadConfig({ ...base, PUBLIC_BASE_URL: '' }), /PUBLIC_BASE_URL/);
  });

  test('метриките не може да са на публичния порт', () => {
    assert.throws(() => loadConfig({ ...base, METRICS_PORT: '4330' }), /METRICS_PORT/);
    assert.equal(loadConfig({ ...base, METRICS_PORT: '9464' }).METRICS_PORT, 9464);
  });
});
