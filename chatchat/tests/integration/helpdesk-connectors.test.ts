import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
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
  seedHelpdeskWorld,
  TECH_EMAIL,
  ZD_TOKEN,
  type HelpdeskWorld,
} from './helpdesk-world.js';
import { db, resetDb, startApp, type Harness } from './helpers.js';

/**
 * Конекторите към Zendesk (Tickets API) и Jira Service Management (request + comment) по
 * документираните им формати — срещу локален фалшив сървър, през истинския outbox.
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

describe('Zendesk (Tickets API)', () => {
  const setup = async () =>
    configure(w.adminA, {
      kind: 'ZENDESK',
      enabled: true,
      settings: { subdomain: 'alfa', authMode: 'oauth', language: 'it' },
      secrets: { accessToken: ZD_TOKEN },
    });

  test('създаване с Idempotency-Key и external_id, после статус + вътрешни коментари', async () => {
    assert.equal((await setup()).status, 200);
    const t = await openTicket(w.tech);
    await claim(w.support, t.id);
    await closeTicket(w.support, t.id);
    await drain(deps);
    assert.equal(fake.zendesk.size, 1);
    const zt = fake.zendesk.get(1);
    assert.equal(zt?.externalId, t.number);
    assert.equal(zt?.status, 'solved');
    assert.equal(zt?.comments.length, 3);
    assert.match(zt?.comments[2] ?? '', /Causa: Contatto porta ossidato/);
    assert.equal(zt?.comments.join('\n').includes(TECH_EMAIL), false);
    const post = fake.requests.find((r) => r.method === 'POST' && r.path === '/api/v2/tickets');
    assert.equal(post?.headers.authorization, `Bearer ${ZD_TOKEN}`);
    assert.ok(post?.headers['idempotency-key']);
    assert.equal(
      (await db.helpdeskLink.findUniqueOrThrow({ where: { ticketId: t.id } })).externalId,
      '1',
    );
  });

  test('създаден, но отговорът се изгуби → повторът намира тикета по external_id (без дубликат)', async () => {
    await setup();
    await openTicket(w.tech);
    fake.failNext = [{ status: 200 }, { status: 500, afterHandle: true }];
    await drain(deps);
    assert.equal(fake.zendesk.size, 1, 'създаден веднъж');
    await drain(deps, later(5));
    assert.equal(fake.zendesk.size, 1, 'повторът не дублира');
    assert.equal(await db.helpdeskLink.count(), 1);
    assert.equal((await db.helpdeskDelivery.findFirstOrThrow()).status, 'DELIVERED');
  });
});

describe('Jira Service Management (request + comment)', () => {
  test('заявка в service desk-а, после вътрешни коментари по ключа', async () => {
    const res = await configure(w.adminA, {
      kind: 'JSM',
      enabled: true,
      settings: { baseUrl: fake.base, serviceDeskId: '10', requestTypeId: '25', language: 'en' },
      secrets: { email: 'svc@alfa.example', apiToken: 'jsm-token-'.padEnd(30, 'j') },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const t = await openTicket(w.tech);
    await claim(w.support, t.id);
    await drain(deps);
    const req = fake.jsm.get('HD-1');
    assert.match(req?.summary ?? '', new RegExp(t.number));
    assert.match(req?.description ?? '', /Board: LTX-500/);
    assert.equal(req?.comments.length, 1);
    assert.equal(req?.comments[0]?.public, false);
    assert.match(req?.comments[0]?.body ?? '', /Taken in charge/);
    const link = await db.helpdeskLink.findUniqueOrThrow({ where: { ticketId: t.id } });
    assert.deepEqual([link.externalId, link.externalKey], ['107001', 'HD-1']);
  });
});

describe('смяна на конектора', () => {
  test('друг вид/цел → старите връзки се трият, чакащите доставки се пропускат (с одит)', async () => {
    await configureWebhook(w.adminA, fake);
    fake.webhookAck = 'EXT-1';
    const t = await openTicket(w.tech);
    await drain(deps);
    assert.equal(await db.helpdeskLink.count(), 1);
    await claim(w.support, t.id);
    const res = await configure(w.adminA, {
      kind: 'ZENDESK',
      enabled: true,
      settings: { subdomain: 'alfa', authMode: 'oauth' },
      secrets: { accessToken: ZD_TOKEN },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(await db.helpdeskLink.count(), 0, 'връзката към стария helpdesk отпада');
    const pending = await db.helpdeskDelivery.findFirstOrThrow({
      where: { eventType: 'ticket.claimed' },
    });
    assert.deepEqual([pending.status, pending.lastError], ['SKIPPED', 'reconfigured']);
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: 'integration.update' },
      orderBy: { id: 'desc' },
    });
    const detail = audit.detail as Record<string, unknown>;
    assert.equal(detail.targetChanged, true);
    assert.equal(detail.linksCleared, 1);
    assert.equal(detail.skipped, 1);
    // Следващото събитие отива в новия helpdesk: тикетът се създава там наново.
    await closeTicket(w.support, t.id);
    await drain(deps);
    assert.equal(fake.zendesk.size, 1);
    assert.equal(fake.zendesk.get(1)?.status, 'solved');
  });
});
