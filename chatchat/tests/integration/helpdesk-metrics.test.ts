import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { createMetrics, type Metrics } from '../../src/observability/catalog.js';
import { helpdeskHooks } from '../../src/observability/helpdesk.js';
import type { IntegrationDeps } from '../../src/services/integrations/deps.js';
import { outboxSnapshot } from '../../src/services/integrations/outbox-hooks.js';
import { IntegrationWorker } from '../../src/services/integrations/worker.js';
import { FakeHelpdesk } from './helpdesk-fake.js';
import {
  claim,
  configure,
  configureWebhook,
  later,
  localDeps,
  openTicket,
  seedHelpdeskWorld,
  SIGNING,
  strictDeps,
  type HelpdeskWorld,
} from './helpdesk-world.js';
import { appDb, db, resetDb, startApp, systemDb, type Harness } from './helpers.js';

/**
 * Метриките на изпращача към helpdesk върху живата база: изходът на всеки опит като код, снимката
 * на outbox-а с ЕДНА агрегатна заявка по всички клиенти (без tenant етикет), dead-letter само на
 * включен конектор, редовете зад dead-letter не влизат във възрастта (отделна аларма), SSRF отказът
 * е отделен изход. Алармите: deploy/monitoring/alerts.yml, docs/runbook.md.
 */

const fake = new FakeHelpdesk();
const silent = { info: () => undefined, warn: () => undefined };
let deps: IntegrationDeps;
let h: Harness;
let w: HelpdeskWorld;
let m: Metrics;

before(async () => {
  await fake.start();
  deps = localDeps(fake);
  h = await startApp({ diagnose: 'none', integrations: deps });
});
after(async () => {
  await h.close();
  await fake.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  fake.reset();
  w = await seedHelpdeskWorld(h);
  m = createMetrics();
});

function worker(over: IntegrationDeps = deps): IntegrationWorker {
  return new IntegrationWorker(
    // Като в продукция: доставката под RLS, взимането и агрегатът — системната роля.
    { db: appDb, system: systemDb, integrations: over, logger: silent, hooks: helpdeskHooks(m) },
    0,
  );
}
const outbox = (state: string) => m.helpdeskOutbox.get({ state });
const result = (r: string) => m.helpdeskDeliveries.get({ result: r });
const age = () => {
  const line = m.registry
    .render()
    .split('\n')
    .find((l) => l.startsWith('chatchat_helpdesk_oldest_pending_seconds '));
  return Number(line?.split(' ')[1]);
};

describe('изпращачът към helpdesk: метрики', () => {
  test('доставките на два клиента — броят се заедно, outbox-ът е празен, без tenant/id в етикетите', async () => {
    await configureWebhook(w.adminA, fake);
    await configureWebhook(w.adminB, fake);
    const a = await openTicket(w.tech);
    await claim(w.support, a.id);
    await openTicket(w.techB);
    await worker().kick();
    assert.equal(result('delivered'), 3);
    assert.equal(result('dead'), 0);
    assert.deepEqual(['pending', 'sending', 'dead'].map(outbox), [0, 0, 0]);
    assert.equal(age(), 0);
    const text = m.registry.render();
    for (const id of [w.tenantA.id, w.tenantB.id, a.id, a.number]) {
      assert.equal(text.includes(id), false, `не изтича в метриките: ${id}`);
    }
  });

  test('повтор (503): чакащите и възрастта на главата; след доставката — нула', async () => {
    await configureWebhook(w.adminA, fake);
    const t = await openTicket(w.tech);
    await claim(w.support, t.id);
    fake.failNext = [{ status: 503 }];
    await worker().kick();
    assert.equal(result('retry'), 1);
    assert.equal(outbox('pending'), 2, 'главата + чакащото зад нея');
    assert.ok(age() < 60, `пресни редове: ${age()}`);
    // Главата е създадена преди 40 мин — алармата ChatchatHelpdeskBacklog гледа точно това.
    await db.helpdeskDelivery.updateMany({
      where: { ticketId: t.id, seq: 1 },
      data: { createdAt: new Date(Date.now() - 40 * 60_000) },
    });
    const snap = await outboxSnapshot(db);
    assert.ok(snap.oldestPendingAt, 'има най-стара');
    await worker().kick(later(5));
    assert.equal(result('delivered'), 2);
    assert.deepEqual([outbox('pending'), age()], [0, 0]);
    const ageThen = Math.round((Date.now() - (snap.oldestPendingAt?.getTime() ?? 0)) / 1000);
    assert.ok(Math.abs(ageThen - 2400) <= 5, `възрастта от базата е в UTC: ${ageThen}`);
  });

  test('dead-letter: брои се само на включен конектор; редовете зад него не влизат във възрастта', async () => {
    await configureWebhook(w.adminA, fake);
    const t = await openTicket(w.tech);
    await claim(w.support, t.id);
    fake.failNext = [{ status: 400 }];
    const run = worker();
    await run.kick();
    assert.equal(result('dead'), 1);
    assert.deepEqual(
      [outbox('dead'), outbox('pending')],
      [1, 1],
      'главата е DEAD, следващото събитие чака зад нея',
    );
    await db.helpdeskDelivery.updateMany({
      where: { ticketId: t.id },
      data: { createdAt: new Date(Date.now() - 3 * 3_600_000) },
    });
    await run.kick();
    assert.equal(
      age(),
      0,
      'блокираното чака човек, не изпращача — само ChatchatHelpdeskDeadLetters',
    );
    // Изключен конектор: „Пусни наново“ е невъзможно (409) — нищо за алармиране.
    await configure(w.adminA, {
      kind: 'WEBHOOK',
      enabled: false,
      settings: { url: `${fake.base}/hook` },
      secrets: { signingSecret: SIGNING },
    });
    await run.kick();
    assert.equal(outbox('dead'), 0);
  });

  test('SSRF отказ при доставка (DNS → частен адрес) е отделен изход, не просто dead', async () => {
    const res = await configure(w.adminA, {
      kind: 'WEBHOOK',
      enabled: true,
      settings: { url: 'https://private.example/hook' },
      secrets: { signingSecret: SIGNING },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    await openTicket(w.tech);
    const strict = strictDeps({
      resolve: async () => [{ address: '10.0.0.7', family: 4 }],
      timeoutMs: 500,
    });
    await worker(strict).kick();
    assert.deepEqual([result('ssrf_blocked'), result('dead')], [1, 0]);
    assert.equal(outbox('dead'), 1, 'в outbox-а е dead-letter като всеки друг');
  });
});
