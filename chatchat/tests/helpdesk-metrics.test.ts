import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PipelineDeps } from '../src/ingest/pipeline.js';
import { createMetrics } from '../src/observability/catalog.js';
import { helpdeskHooks } from '../src/observability/helpdesk.js';
import { queueHooks } from '../src/queue/runtime.js';
import { OUTBOX_RESULTS, outboxResult } from '../src/services/integrations/outbox-hooks.js';

/**
 * Метриките на фоновите потоци: изпращачът към helpdesk (изход → затворен код, снимка на outbox-а,
 * възраст, смятана при четене) и опашките (сериите съществуват от старта с 0 — иначе първият
 * dead-letter след рестарт е невидим за increase()).
 */

const sample = (text: string, series: string): number | null => {
  const line = text.split('\n').find((l) => l.startsWith(`${series} `));
  return line ? Number(line.slice(series.length + 1)) : null;
};

describe('изпращачът към helpdesk', () => {
  test('изходът е затворен код; ssrf_blocked е отделен от другите dead-letter', () => {
    assert.equal(outboxResult({ status: 'DELIVERED' }), 'delivered');
    assert.equal(outboxResult({ status: 'DELIVERED', note: 'already_linked' }), 'delivered');
    assert.equal(outboxResult({ status: 'SKIPPED', code: 'disabled' }), 'skipped');
    assert.equal(outboxResult({ status: 'RETRY', code: 'http_503', retryAfterMs: 1 }), 'retry');
    assert.equal(outboxResult({ status: 'DEAD', code: 'http_400' }), 'dead');
    assert.equal(outboxResult({ status: 'DEAD', code: 'secret_unknown_key' }), 'dead');
    assert.equal(outboxResult({ status: 'DEAD', code: 'ssrf_blocked' }), 'ssrf_blocked');
    // Кодът от отсрещната страна никога не става етикет — множеството е фиксирано.
    assert.ok(OUTBOX_RESULTS.every((r) => /^[a-z_]{1,16}$/.test(r)));
  });

  test('броячът: всички изходи от старта с 0, после само кодовете; без клиент/id', () => {
    const m = createMetrics();
    const hooks = helpdeskHooks(m);
    let text = m.registry.render();
    for (const r of OUTBOX_RESULTS) {
      assert.equal(sample(text, `chatchat_helpdesk_deliveries_total{result="${r}"}`), 0, r);
    }
    hooks.onResult?.('delivered');
    hooks.onResult?.('delivered');
    hooks.onResult?.('dead');
    assert.equal(m.helpdeskDeliveries.get({ result: 'delivered' }), 2);
    assert.equal(m.helpdeskDeliveries.get({ result: 'dead' }), 1);
    text = m.registry.render();
    assert.doesNotMatch(text, /chatchat_helpdesk_[a-z_]+\{[^}]*(tenant|ticket|id)=/);
  });

  test('снимката: състояния и възраст на най-старата, смятана при всяко четене', () => {
    let now = Date.parse('2026-10-10T10:00:00Z');
    const m = createMetrics();
    const hooks = helpdeskHooks(m, () => now);
    const age = () => sample(m.registry.render(), 'chatchat_helpdesk_oldest_pending_seconds');
    assert.equal(age(), 0, 'преди първата снимка — 0, не липсва');
    hooks.onSnapshot?.({
      pending: 3,
      sending: 1,
      dead: 2,
      oldestPendingAt: new Date(now - 600_000),
    });
    const text = m.registry.render();
    assert.equal(sample(text, 'chatchat_helpdesk_outbox{state="pending"}'), 3);
    assert.equal(sample(text, 'chatchat_helpdesk_outbox{state="sending"}'), 1);
    assert.equal(sample(text, 'chatchat_helpdesk_outbox{state="dead"}'), 2);
    assert.equal(age(), 600);
    // Изпращачът не чете базата → снимка няма, а възрастта продължава да расте.
    now += 1_200_000;
    assert.equal(age(), 1800);
    hooks.onSnapshot?.({ pending: 0, sending: 0, dead: 0, oldestPendingAt: null });
    assert.equal(age(), 0);
    // Часовник назад (NTP) — никога отрицателна възраст.
    hooks.onSnapshot?.({ pending: 1, sending: 0, dead: 0, oldestPendingAt: new Date(now + 5000) });
    assert.equal(age(), 0);
  });

  test('без куки (тестове, CLI) — метриките на helpdesk нямат серии', () => {
    const text = createMetrics().registry.render();
    assert.equal(sample(text, 'chatchat_helpdesk_oldest_pending_seconds'), null);
    assert.doesNotMatch(text, /^chatchat_helpdesk_deliveries_total\{/m);
  });
});

describe('опашките', () => {
  test('сериите на изхода съществуват от старта с 0; onResult брои и мери', () => {
    const m = createMetrics();
    // onDead не се вика в този тест — обработчикът на файловете не е нужен.
    const hooks = queueHooks({} as PipelineDeps, m);
    const text = m.registry.render();
    for (const queue of ['ingest', 'ocr', 'embed']) {
      for (const result of ['completed', 'retried', 'dead']) {
        const series = `chatchat_queue_jobs_total{queue="${queue}",result="${result}"}`;
        assert.equal(sample(text, series), 0, series);
      }
    }
    hooks.onResult?.('ocr', 'dead', 12);
    assert.equal(m.queueJobs.get({ queue: 'ocr', result: 'dead' }), 1);
    assert.equal(m.queueDuration.snapshot({ queue: 'ocr' }).count, 1);
  });

  test('без метрики — без onResult и без серии', () => {
    const m = createMetrics();
    const hooks = queueHooks({} as PipelineDeps);
    assert.equal(hooks.onResult, undefined);
    assert.doesNotMatch(m.registry.render(), /^chatchat_queue_jobs_total\{/m);
  });
});
