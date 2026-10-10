import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { IntegrationDeps } from '../../src/services/integrations/deps.js';
import { FakeHelpdesk } from './helpdesk-fake.js';
import {
  claim,
  configure,
  configureWebhook,
  drain,
  INBOUND,
  localDeps,
  openTicket,
  seedHelpdeskWorld,
  sendInbound,
  ZD_TOKEN,
  type HelpdeskWorld,
} from './helpdesk-world.js';
import { db, resetDb, startApp, type Harness } from './helpers.js';

/**
 * Входящият webhook (обратната синхронизация на статуса): подпис върху суровото тяло, прозорец за
 * печата, защита от повторение, грешен клиент, машината на преходите, източник EXTERNAL без ехо
 * към helpdesk-а, хронология и одит; официалните подписи на Zendesk и Jira; лимит и таван на тялото.
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

const status = async (ticketId: string) =>
  (await db.ticket.findUniqueOrThrow({ where: { id: ticketId } })).status;

/** Печат N секунди напред (в прозореца) — отделно подписано известие със същото тяло. */
const soon = (seconds: number) => Math.floor(Date.now() / 1000) + seconds;

describe('общият webhook (X-ChatChat-Signature)', () => {
  test('подписано „close“ затваря тикета през машината; източник EXTERNAL, без ехо, с хронология и одит', async () => {
    const { inboundUrl } = await configureWebhook(w.adminA, fake);
    const t = await openTicket(w.tech);
    await claim(w.support, t.id);
    await drain(deps);
    const deliveriesBefore = await db.helpdeskDelivery.count();
    const body = { version: 1, ticket: { number: t.number }, action: 'close' };
    const ts = soon(0);
    const res = await sendInbound(h.base, inboundUrl, body, { delivery: 'zd-evt-1', ts });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body, { ok: true, result: 'applied', to: 'CLOSED' });
    assert.equal(await status(t.id), 'CLOSED');
    const c = await db.case.findUniqueOrThrow({ where: { id: t.caseId } });
    assert.deepEqual([c.status, c.outcome], ['RESOLVED', 'RESOLVED']);
    const ev = await db.ticketEvent.findFirstOrThrow({
      where: { ticketId: t.id, type: 'ticket.closed' },
    });
    assert.equal(ev.source, 'EXTERNAL');
    assert.equal(ev.actorId, null);
    assert.equal(await db.helpdeskDelivery.count(), deliveriesBefore, 'без ехо обратно');
    const tl = await db.caseTimelineEvent.findFirstOrThrow({
      where: { caseId: t.caseId, type: 'ticket.closed' },
    });
    assert.equal((tl.payload as Record<string, unknown>).via, 'external');
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: 'ticket.close', objectId: t.id },
    });
    assert.equal(audit.actorId, null);
    assert.equal(audit.tenantId, w.tenantA.id);

    // Повторение на същото известие → „duplicate“, нищо ново.
    const again = await sendInbound(h.base, inboundUrl, body, { delivery: 'zd-evt-1' });
    assert.deepEqual(again.body, { ok: true, result: 'duplicate' });
    assert.equal(
      await db.ticketEvent.count({ where: { ticketId: t.id, type: 'ticket.closed' } }),
      1,
    );
    // Записаното подписано известие, пуснато наново с друг (неподписан) id или без id — пак
    // повторение: отпечатъкът на подписа е общ.
    for (const delivery of ['attacker-id', undefined]) {
      const forged = await sendInbound(h.base, inboundUrl, body, {
        ts,
        ...(delivery ? { delivery } : {}),
      });
      assert.deepEqual(forged.body, { ok: true, result: 'duplicate' });
    }
    // Ново известие за вече затворен (друг печат = друго подписано известие) — пропуснато с код.
    const third = await sendInbound(h.base, inboundUrl, body, {
      delivery: 'zd-evt-2',
      ts: soon(1),
    });
    assert.deepEqual(third.body, { ok: true, result: 'ignored', reason: 'already_closed' });
  });

  test('„reopen“ отваря наново (с отговорника); затваряне на неподет тикет — машината не позволява', async () => {
    const { inboundUrl } = await configureWebhook(w.adminA, fake);
    const open = await openTicket(w.tech);
    const close = { version: 1, ticket: { number: open.number }, action: 'close' };
    const res = await sendInbound(h.base, inboundUrl, close, { delivery: 'evt-1' });
    assert.deepEqual(res.body, { ok: true, result: 'ignored', reason: 'invalid_transition' });
    assert.equal(await status(open.id), 'OPEN');
    await claim(w.support, open.id);
    // Повторение на пропуснатото известие НЕ го прилага по-късно (отпечатъкът е записан).
    const replayed = await sendInbound(h.base, inboundUrl, close, { delivery: 'evt-1' });
    assert.deepEqual(replayed.body, { ok: true, result: 'duplicate' });
    assert.equal(await status(open.id), 'IN_PROGRESS');
    await sendInbound(h.base, inboundUrl, close, { delivery: 'evt-2', ts: soon(1) });
    const reopened = await sendInbound(
      h.base,
      inboundUrl,
      { version: 1, ticket: { number: open.number }, action: 'reopen' },
      { delivery: 'evt-3', ts: soon(2) },
    );
    assert.deepEqual(reopened.body, { ok: true, result: 'applied', to: 'ASSIGNED' });
    const c = await db.case.findUniqueOrThrow({ where: { id: open.caseId } });
    assert.equal(c.status, 'IN_PROGRESS');
    assert.equal(c.assignedToId, w.supportA.id);
  });

  test('грешен подпис, стар печат, непознат адрес, без входяща тайна → 401; лошо тяло → 400', async () => {
    const { inboundUrl } = await configureWebhook(w.adminA, fake);
    const t = await openTicket(w.tech);
    const body = { version: 1, ticket: { number: t.number }, action: 'close' };
    const bad = await sendInbound(h.base, inboundUrl, body, { secret: 'x'.repeat(48) });
    assert.deepEqual([bad.status, bad.body.code], [401, 'invalid_signature']);
    const stale = await sendInbound(h.base, inboundUrl, body, {
      ts: Math.floor(Date.now() / 1000) - 3600,
    });
    assert.deepEqual([stale.status, stale.body.code], [401, 'stale_request']);
    const unknown = await sendInbound(
      h.base,
      `${h.base}/api/v1/integrations/inbound/${'A'.repeat(22)}`,
      body,
    );
    assert.equal(unknown.status, 401);
    const garbage = await sendInbound(h.base, inboundUrl, null, { raw: '{"version":2}' });
    assert.deepEqual([garbage.status, garbage.body.code], [400, 'invalid_payload']);
    // Без входяща тайна обратната синхронизация е изключена.
    const { inboundUrl: noSecretUrl } = await configureWebhook(w.adminA, fake, false);
    await configure(w.adminA, {
      kind: 'WEBHOOK',
      enabled: true,
      settings: { url: `${fake.base}/hook` },
      secrets: { inboundSecret: null },
    });
    assert.equal((await sendInbound(h.base, noSecretUrl, body)).status, 401);
    assert.equal(await status(t.id), 'OPEN');
  });

  test('грешен клиент: тайната на B не стига до тикет на A; подпис на A към адреса на B → 401', async () => {
    const a = await configureWebhook(w.adminA, fake);
    const b = await configureWebhook(w.adminB, fake);
    assert.notEqual(a.inboundUrl, b.inboundUrl);
    const t = await openTicket(w.tech);
    await claim(w.support, t.id);
    const body = { version: 1, ticket: { number: t.number }, action: 'close' };
    const viaB = await sendInbound(h.base, b.inboundUrl, body);
    assert.deepEqual(viaB.body, { ok: true, result: 'ignored', reason: 'unknown_ticket' });
    assert.equal(await status(t.id), 'IN_PROGRESS');
    // Различни тайни за A и B — подпис с тайната на A не минава при B.
    await configure(w.adminB, {
      kind: 'WEBHOOK',
      enabled: true,
      settings: { url: `${fake.base}/hook` },
      secrets: { inboundSecret: 'other-tenant-secret-'.padEnd(48, 'q') },
    });
    assert.equal((await sendInbound(h.base, b.inboundUrl, body)).status, 401);
  });

  test('лимит по адрес (429) и таван на тялото (413)', async () => {
    const { inboundUrl } = await configureWebhook(w.adminA, fake);
    const huge = await sendInbound(h.base, inboundUrl, null, {
      raw: `{"x":"${'a'.repeat(70_000)}"}`,
    });
    assert.equal(huge.status, 413);
    const statuses: number[] = [];
    for (let i = 0; i < 125; i += 1) {
      const r = await sendInbound(
        h.base,
        inboundUrl,
        { version: 1 },
        { secret: 'wrong'.padEnd(40, '!') },
      );
      statuses.push(r.status);
    }
    assert.ok(statuses.includes(429), 'над 120 в минута → 429');
  });
});

describe('Zendesk (X-Zendesk-Webhook-Signature) и Jira (X-Hub-Signature)', () => {
  test('Zendesk: „solved“ по официалния подпис затваря свързания тикет', async () => {
    const cfg = await configure(w.adminA, {
      kind: 'ZENDESK',
      enabled: true,
      settings: { subdomain: 'alfa', authMode: 'oauth' },
      secrets: { accessToken: ZD_TOKEN, inboundSecret: INBOUND },
    });
    const inboundUrl = cfg.body.integration.inboundUrl as string;
    const t = await openTicket(w.tech);
    await claim(w.support, t.id);
    await drain(deps);
    const raw = JSON.stringify({ ticket_id: '1', external_id: t.number, status: 'solved' });
    const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const sig = createHmac('sha256', INBOUND)
      .update(ts + raw)
      .digest('base64');
    const res = await fetch(h.base + new URL(inboundUrl).pathname, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-zendesk-webhook-signature': sig,
        'x-zendesk-webhook-signature-timestamp': ts,
        'x-zendesk-webhook-invocation-id': '8350205582',
      },
      body: raw,
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, result: 'applied', to: 'CLOSED' });
    assert.equal(await status(t.id), 'CLOSED');
    assert.equal(
      fake.zendesk.get(1)?.status,
      'open',
      'без ехо: Zendesk не получава „solved“ обратно',
    );
  });

  test('JSM: категория „done“ по X-Hub-Signature затваря; повторът (същият identifier) — duplicate', async () => {
    const cfg = await configure(w.adminA, {
      kind: 'JSM',
      enabled: true,
      settings: { baseUrl: fake.base, serviceDeskId: '10', requestTypeId: '25' },
      secrets: {
        email: 'svc@alfa.example',
        apiToken: 'jsm-token-'.padEnd(30, 'j'),
        inboundSecret: INBOUND,
      },
    });
    const inboundUrl = cfg.body.integration.inboundUrl as string;
    const t = await openTicket(w.tech);
    await claim(w.support, t.id);
    await drain(deps);
    const raw = JSON.stringify({
      timestamp: Date.now(),
      webhookEvent: 'jira:issue_updated',
      issue: { id: '107001', key: 'HD-1', fields: { status: { statusCategory: { key: 'done' } } } },
    });
    const post = () =>
      fetch(h.base + new URL(inboundUrl).pathname, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature': `sha256=${createHmac('sha256', INBOUND).update(raw).digest('hex')}`,
          'x-atlassian-webhook-identifier': 'wh-777',
        },
        body: raw,
      }).then(async (r) => ({ status: r.status, body: (await r.json()) as unknown }));
    assert.deepEqual(await post(), {
      status: 200,
      body: { ok: true, result: 'applied', to: 'CLOSED' },
    });
    assert.deepEqual(await post(), { status: 200, body: { ok: true, result: 'duplicate' } });
    assert.equal(await status(t.id), 'CLOSED');
  });
});
