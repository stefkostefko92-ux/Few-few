import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { revokeAllSessions } from '../../src/auth/sessions.js';
import { RealtimeHub } from '../../src/realtime/hub.js';
import { Client, db, startApp, type Harness } from './helpers.js';
import {
  del,
  eventually,
  open,
  openStream,
  resetCollab,
  say,
  seedCollab,
  type CollabWorld,
  type SseEvent,
  type Stream,
} from './collab-world.js';
import { newCase } from './world.js';

/**
 * Реално време (§13.3, NFR-11): SSE със сесийната бисквитка; всеки получава само разрешеното
 * в момента на изпращане (членството се проверява наново); монотонни `id:`; изход,
 * `revokeAllSessions` и отнета сесия затварят потока. „Не получи“ се доказва с бариера: след
 * забраненото събитие идва разрешено — щом то е пристигнало, предишното също би било.
 */

let h: Harness;
let w: CollabWorld;
const streams: Stream[] = [];

before(async () => {
  // Кратък heartbeat — за проверката на сесията без чакане от 25 s.
  h = await startApp({ diagnose: 'none', hub: new RealtimeHub({ heartbeatMs: 150 }) });
});
after(async () => {
  await h.close();
  await db.$disconnect();
});
beforeEach(async () => {
  streams.splice(0).forEach((s) => s.close());
  await resetCollab();
  w = await seedCollab(h);
});

async function stream(c: Client): Promise<Stream> {
  const s = await openStream(c);
  assert.equal(s.status, 200);
  streams.push(s);
  return s;
}

const created = (body: string) => (e: SseEvent) =>
  e.event === 'message.created' && e.data.data.message.body === body;

describe('SSE', () => {
  test('без вход — 401; потокът е text/event-stream', async () => {
    const anon = await openStream(new Client(h.base));
    assert.equal(anon.status, 401);
    const s = await stream(w.c.support);
    assert.match(s.contentType ?? '', /^text\/event-stream/);
  });

  test('член получава message.created с пълния плик; нечлен, порталът и друг клиент — нищо', async () => {
    const { c, users } = w;
    const id = await open(c.support, { type: 'GROUP', userIds: [users.engineering.id] });
    const barrier = await open(c.support, {
      type: 'GROUP',
      userIds: [users.engineering.id, users.internal.id],
    });
    const portalConv = await open(c.support, { type: 'GROUP', userIds: [users.portalAlfa.id] });
    const sEng = await stream(c.engineering);
    const sInt = await stream(c.internal);
    const sPortal = await stream(c.portalAlfa);
    const sB = await stream(c.supportB);

    const m = await say(c.support, id, 'solo per il gruppo');
    const got = await sEng.waitFor(created('solo per il gruppo'));
    assert.equal(got.data.type, 'message.created');
    assert.equal(got.data.schema_version, 1);
    assert.equal(got.data.tenant_id, w.tenantA.id);
    assert.equal(got.data.conversation_id, id);
    assert.equal(got.data.actor_id, users.support.id);
    assert.ok(!Number.isNaN(Date.parse(got.data.timestamp)));
    assert.equal(got.data.data.message.id, m.id);

    await say(c.support, barrier, 'barriera');
    await say(c.support, portalConv, 'barriera portale');
    await sInt.waitFor(created('barriera'));
    await sPortal.waitFor(created('barriera portale'));
    assert.equal(sInt.events.some(created('solo per il gruppo')), false);
    assert.equal(sPortal.events.some(created('solo per il gruppo')), false);
    assert.equal(sPortal.events.some(created('barriera')), false);
    // Бариера за клиент B: неговото събитие идва, чуждите — не.
    const own = await open(c.supportB, { type: 'DIRECT', userId: users.portalB.id });
    await say(c.supportB, own, 'barriera B');
    await sB.waitFor(created('barriera B'));
    // Собственият разговор на B (conversation.updated) + неговото съобщение — нищо от A.
    assert.deepEqual(
      sB.events.filter((e) => e.event === 'message.created').map((e) => e.data.data.message.body),
      ['barriera B'],
    );
    assert.equal(
      sB.events.every((e) => e.data.tenant_id === w.tenantB.id),
      true,
    );

    // `id:` е монотонен в потока.
    const ids = sEng.events.map((e) => e.id);
    assert.deepEqual(
      [...ids].sort((a, b) => a - b),
      ids,
    );
    assert.equal(new Set(ids).size, ids.length);
  });

  test('членството се проверява при изпращане: махнат (или изтрит пряко в базата) член не получава', async () => {
    const { c, users } = w;
    const id = await open(c.support, {
      type: 'GROUP',
      userIds: [users.engineering.id, users.owner.id],
    });
    const sEng = await stream(c.engineering);
    const sOwner = await stream(c.owner);
    await say(c.support, id, 'prima');
    await sEng.waitFor(created('prima'));

    assert.equal(
      (await del(c.support, `/api/v1/conversations/${id}/members/${users.engineering.id}`)).status,
      204,
    );
    const removed = await sEng.waitFor(
      (e) => e.event === 'conversation.updated' && e.data.data.removed === true,
    );
    assert.deepEqual(removed.data.data.conversation, { id });
    await say(c.support, id, 'dopo la rimozione');
    await sOwner.waitFor(created('dopo la rimozione'));

    // Членството изчезва без маршрута (напр. ръчна корекция) — пак нищо не изтича.
    await db.conversationMember.delete({
      where: { conversationId_userId: { conversationId: id, userId: users.owner.id } },
    });
    const sSupport = await stream(c.support);
    await say(c.support, id, 'dopo la cancellazione');
    await sSupport.waitFor(created('dopo la cancellazione'));
    assert.equal(sEng.events.some(created('dopo la rimozione')), false);
    assert.equal(sOwner.events.some(created('dopo la cancellazione')), false);
  });

  test('редакция, триене и реакция → message.updated; триенето не носи текста', async () => {
    const { c, users } = w;
    const id = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const s = await stream(c.engineering);
    const m = await say(c.support, id, 'da correggere');
    await c.support.patch(`/api/v1/messages/${m.id}`, { text: 'corretto' });
    await s.waitFor(
      (e) => e.event === 'message.updated' && e.data.data.message.body === 'corretto',
    );
    await del(c.support, `/api/v1/messages/${m.id}`);
    const gone = await s.waitFor(
      (e) => e.event === 'message.updated' && e.data.data.message.deleted === true,
    );
    assert.equal(gone.data.data.message.body, null);
    assert.equal(JSON.stringify(gone.data).includes('corretto'), false);
  });

  test('notification.created, presence.changed и case.assigned — само до когото трябва', async () => {
    const { c, users } = w;
    const dm = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    await open(c.support, { type: 'GROUP', userIds: [users.portalAlfa.id, users.portalAlfa2.id] });
    const sEng = await stream(c.engineering);
    const sPortal = await stream(c.portalAlfa);
    const sPortal2 = await stream(c.portalAlfa2);

    await say(c.support, dm, 'notifica');
    const n = await sEng.waitFor((e) => e.event === 'notification.created');
    assert.equal(n.data.data.notification.eventType, 'message.created');
    assert.equal(n.data.data.notification.objectId, dm);

    // Присъствието на портален колега не стига до другия портален; персоналът — да.
    await c.portalAlfa2.post('/api/v1/presence/heartbeat', { status: 'ONLINE' });
    await c.support.post('/api/v1/presence/heartbeat', { status: 'ONLINE' });
    const p = await sPortal.waitFor(
      (e) => e.event === 'presence.changed' && e.data.data.userId === users.support.id,
    );
    assert.equal(p.data.data.status, 'ONLINE');
    await sEng.waitFor(
      (e) => e.event === 'presence.changed' && e.data.data.userId === users.support.id,
    );
    assert.equal(
      sPortal.events.some(
        (e) => e.event === 'presence.changed' && e.data.data.userId === users.portalAlfa2.id,
      ),
      false,
    );
    assert.equal(
      sPortal2.events.some(
        (e) => e.event === 'presence.changed' && e.data.data.userId === users.portalAlfa2.id,
      ),
      false,
    );

    const caseId = await newCase(c.portalAlfa);
    await c.support.post(`/api/v1/cases/${caseId}/assign`);
    const assigned = await sPortal.waitFor((e) => e.event === 'case.assigned');
    assert.deepEqual(assigned.data.data, {
      caseId,
      number: assigned.data.data.number,
      assignedTo: { id: users.support.id, name: 'Sara Supporto' },
    });
    assert.equal(
      sPortal2.events.some((e) => e.event === 'case.assigned'),
      false,
    );
    assert.equal(
      sEng.events.some((e) => e.event === 'case.assigned'),
      false,
    );
  });

  test('изход затваря потока на сесията; revokeAllSessions — всички потоци на човека', async () => {
    const { c, users } = w;
    const s1 = await stream(c.engineering);
    assert.equal((await c.engineering.post('/api/v1/auth/logout')).status, 204);
    await s1.closed;
    assert.equal(s1.isClosed(), true);

    const { signIn } = await import('./helpers.js');
    const tab1 = await stream(await signIn(h, users.support));
    const tab2 = await stream(await signIn(h, users.support));
    const other = await stream(c.owner);
    assert.equal(h.hub.size(users.support.id), 2);
    await revokeAllSessions(db, users.support.id);
    await Promise.all([tab1.closed, tab2.closed]);
    assert.equal(h.hub.size(users.support.id), 0);
    assert.equal(other.isClosed(), false);
  });

  test('отнета сесия без кука (пряко в базата) или деактивиран акаунт — затваря се на heartbeat', async () => {
    const { c, users } = w;
    const s = await stream(c.engineering);
    await db.session.updateMany({
      where: { userId: users.engineering.id },
      data: { revokedAt: new Date() },
    });
    await s.closed;
    const s2 = await stream(c.owner);
    await db.user.update({ where: { id: users.owner.id }, data: { active: false } });
    await s2.closed;
    await eventually(() => h.hub.size(users.owner.id) === 0);
  });
});
