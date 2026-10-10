import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { verifyChatChat } from '../../src/services/integrations/signature.js';
import type { IntegrationDeps } from '../../src/services/integrations/deps.js';
import { FakeHelpdesk } from './helpdesk-fake.js';
import {
  claim,
  closeTicket,
  configure,
  configureWebhook,
  drain,
  later,
  localDeps,
  openTicket,
  SECRET_PHONE,
  seedHelpdeskWorld,
  SIGNING,
  TECH_EMAIL,
  TECH_NAME,
  type HelpdeskWorld,
} from './helpdesk-world.js';
import { db, resetDb, startApp, type Harness } from './helpers.js';

/**
 * Outbox към helpdesk (FR-09, §14.4): доставка в транзакцията на промяната, подредба по тикет,
 * повтор с отстъп и същия ключ за идемпотентност, dead-letter и повторно пускане, минимизация на
 * данните (локален фалшив сървър; Zendesk и JSM — helpdesk-connectors.test.ts).
 */

const fake = new FakeHelpdesk();
let deps: IntegrationDeps;
let h: Harness;
let w: HelpdeskWorld;

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
});

const rows = (ticketId: string) =>
  db.helpdeskDelivery.findMany({ where: { ticketId }, orderBy: { seq: 'asc' } });

describe('запис в outbox-а', () => {
  test('без конектор (или изключен) — нищо не се записва', async () => {
    const t = await openTicket(w.tech);
    await claim(w.support, t.id);
    assert.equal(await db.helpdeskDelivery.count(), 0);
    await configure(w.adminA, {
      kind: 'WEBHOOK',
      enabled: false,
      settings: { url: `${fake.base}/hook` },
      secrets: { signingSecret: SIGNING },
    });
    await closeTicket(w.support, t.id);
    assert.equal(await db.helpdeskDelivery.count(), 0);
  });

  test('всяко събитие → доставка в същата транзакция, `seq` по тикет; друг клиент — нищо', async () => {
    await configureWebhook(w.adminA, fake);
    const t = await openTicket(w.tech);
    await claim(w.support, t.id);
    await closeTicket(w.support, t.id);
    const list = await rows(t.id);
    assert.deepEqual(
      list.map((r) => [r.seq, r.eventType, r.status]),
      [
        [1, 'ticket.created', 'PENDING'],
        [2, 'ticket.claimed', 'PENDING'],
        [3, 'ticket.closed', 'PENDING'],
      ],
    );
    const events = await db.ticketEvent.findMany({ where: { ticketId: t.id } });
    assert.deepEqual(new Set(list.map((r) => r.eventId)), new Set(events.map((e) => e.id)));
    await openTicket(w.techB);
    assert.equal(await db.helpdeskDelivery.count({ where: { tenantId: w.tenantB.id } }), 0);
  });
});

describe('общият webhook: доставка, подпис, минимизация', () => {
  test('по реда на събитията, подписано, с връзка от получателя; без лични данни и файлове', async () => {
    await configureWebhook(w.adminA, fake);
    fake.webhookAck = 'EXT-42';
    const t = await openTicket(w.tech);
    await claim(w.support, t.id);
    await closeTicket(w.support, t.id);
    await drain(deps);
    const sent = fake.to('/hook');
    assert.deepEqual(
      sent.map((r) => (JSON.parse(r.body) as { type: string }).type),
      ['ticket.created', 'ticket.claimed', 'ticket.closed'],
    );
    for (const r of sent) {
      const ts = Number(r.headers['x-chatchat-timestamp']) * 1000;
      assert.equal(
        verifyChatChat(SIGNING, r.headers, r.body, ts, 300).ok,
        true,
        'подписът е верен',
      );
      assert.equal(r.headers['idempotency-key'], r.headers['x-chatchat-delivery']);
      for (const forbidden of [
        TECH_NAME,
        TECH_EMAIL,
        SECRET_PHONE,
        'Sara',
        w.techA.id,
        w.supportA.id,
      ]) {
        assert.equal(r.body.includes(forbidden), false, `не изтича: ${forbidden}`);
      }
    }
    const last = JSON.parse(sent[2]?.body ?? '{}') as {
      version: number;
      externalId: string;
      change: { to: string; assigneeRole: string | null };
      ticket: {
        board: { serial: string };
        attachments: { count: number };
        resolution: { rootCause: string };
        case: { link: string };
      };
    };
    assert.equal(last.version, 1);
    assert.equal(last.externalId, 'EXT-42', 'връзката от първия отговор се връща');
    assert.equal(last.change.to, 'CLOSED');
    assert.equal(last.ticket.board.serial, 'SN-ALFA-77');
    assert.equal(last.ticket.attachments.count, 0);
    assert.equal(last.ticket.resolution.rootCause, 'Contatto porta ossidato');
    assert.match(last.ticket.case.link, /#case=/);
    const claimed = JSON.parse(sent[1]?.body ?? '{}') as { change: { assigneeRole: string } };
    assert.equal(claimed.change.assigneeRole, 'SUPPORT', 'роля, не име');
    assert.equal(
      (await db.helpdeskLink.findUniqueOrThrow({ where: { ticketId: t.id } })).externalId,
      'EXT-42',
    );
    assert.ok((await rows(t.id)).every((r) => r.status === 'DELIVERED' && r.deliveredAt));
  });

  test('повтор: 503 → отстъп, същият Idempotency-Key; следващото събитие НЕ изпреварва', async () => {
    await configureWebhook(w.adminA, fake);
    const t = await openTicket(w.tech);
    await claim(w.support, t.id);
    fake.failNext = [{ status: 503, headers: { 'retry-after': '120' } }];
    await drain(deps);
    let list = await rows(t.id);
    assert.deepEqual(
      list.map((r) => r.status),
      ['PENDING', 'PENDING'],
    );
    assert.equal(list[0]?.attempts, 1);
    assert.equal(list[0]?.lastError, 'http_503');
    assert.ok((list[0]?.notBefore.getTime() ?? 0) >= Date.now() + 110_000, 'Retry-After е уважен');
    assert.equal(fake.to('/hook').length, 1, 'второто събитие чака първото');
    await drain(deps, later(5));
    list = await rows(t.id);
    assert.deepEqual(
      list.map((r) => r.status),
      ['DELIVERED', 'DELIVERED'],
    );
    const sent = fake.to('/hook');
    assert.deepEqual(
      sent.map((r) => (JSON.parse(r.body) as { type: string }).type),
      ['ticket.created', 'ticket.created', 'ticket.claimed'],
    );
    assert.equal(sent[0]?.headers['idempotency-key'], sent[1]?.headers['idempotency-key']);
    assert.equal(sent[0]?.headers['idempotency-key'], list[0]?.id);
  });

  test('dead-letter: окончателна грешка спира тикета; повторното пускане го отключва (с одит)', async () => {
    await configureWebhook(w.adminA, fake);
    const t = await openTicket(w.tech);
    await claim(w.support, t.id);
    fake.failNext = [{ status: 400 }];
    await drain(deps);
    const log = await w.adminA.get('/api/v1/admin/integrations/deliveries');
    assert.equal(log.status, 200);
    const mine = (log.body.items as Array<Record<string, unknown>>).filter(
      (i) => i.ticketNumber === t.number,
    );
    assert.deepEqual(
      mine.map((i) => [i.eventType, i.status, i.lastError, i.blocked]),
      [
        ['ticket.claimed', 'PENDING', null, true],
        ['ticket.created', 'DEAD', 'http_400', false],
      ],
    );
    assert.equal(log.body.counts.DEAD, 1);
    const dead = mine[1]?.id as string;
    assert.equal(
      (await w.adminB.post(`/api/v1/admin/integrations/deliveries/${dead}/replay`)).status,
      404,
    );
    assert.equal(
      (await w.support.post(`/api/v1/admin/integrations/deliveries/${dead}/replay`)).status,
      403,
    );
    const replay = await w.adminA.post(`/api/v1/admin/integrations/deliveries/${dead}/replay`);
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.equal(
      (await w.adminA.post(`/api/v1/admin/integrations/deliveries/${dead}/replay`)).status,
      409,
    );
    await drain(deps);
    assert.deepEqual(
      (await rows(t.id)).map((r) => r.status),
      ['DELIVERED', 'DELIVERED'],
    );
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: 'integration.delivery.replay' },
    });
    assert.equal(audit.objectId, dead);
    assert.equal(audit.tenantId, w.tenantA.id);
  });

  test('наем: в полет при друг процес — не се взима; изтекъл (срив) — взима се отново', async () => {
    await configureWebhook(w.adminA, fake);
    const t = await openTicket(w.tech);
    await claim(w.support, t.id);
    const [head] = await rows(t.id);
    const lease = (ms: number) =>
      db.helpdeskDelivery.update({
        where: { id: head?.id ?? '' },
        data: { status: 'SENDING', attempts: 1, lockedUntil: new Date(Date.now() + ms) },
      });
    await lease(60_000);
    await drain(deps);
    assert.equal(fake.to('/hook').length, 0, 'чужд наем и подредбата спират и двете');
    await lease(-1_000);
    await drain(deps);
    const list = await rows(t.id);
    assert.deepEqual(
      list.map((r) => [r.status, r.attempts]),
      [
        ['DELIVERED', 2],
        ['DELIVERED', 1],
      ],
    );
  });

  test('изчерпани опити (5xx) → DEAD след maxAttempts', async () => {
    await configureWebhook(w.adminA, fake);
    const t = await openTicket(w.tech);
    fake.failNext = [{ status: 502 }, { status: 502 }, { status: 502 }];
    await drain(deps);
    await drain(deps, later(10));
    await drain(deps, later(30));
    const [row] = await rows(t.id);
    assert.equal(row?.status, 'DEAD');
    assert.equal(row?.attempts, 3);
    assert.equal(row?.lastError, 'http_502');
  });
});
