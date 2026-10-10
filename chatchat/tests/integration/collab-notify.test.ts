import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { db, startApp, type Harness } from './helpers.js';
import { open, resetCollab, say, seedCollab, type CollabWorld } from './collab-world.js';
import { ask, newCase } from './world.js';

/**
 * Известия (FR-18) и бързи отговори (FR-20, AC-15). Известията: по `notificationPref`, с
 * дедупликация сред непрочетените, при поемане на случай, AI отговор в собствен случай и тикет.
 * Бързите отговори: само PUBLISHED и само за ролите в `roleScope`; управление с `kb:manage`.
 */

let h: Harness;
let w: CollabWorld;

before(async () => {
  // Истинският оркестратор без знание: отговорът е „не е определено“, без да вика модела.
  h = await startApp();
});
after(async () => {
  await h.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetCollab();
  h.model.reset();
  w = await seedCollab(h);
});

const unread = (userId: string) =>
  db.notification.findMany({ where: { userId, readAt: null }, orderBy: { createdAt: 'asc' } });

describe('известия', () => {
  test('ALL: едно непрочетено на разговор с брояч; MENTIONS — само при @име; NONE — нищо', async () => {
    const { c, users } = w;
    const id = await open(c.support, {
      type: 'GROUP',
      userIds: [users.engineering.id, users.owner.id, users.internal.id],
    });
    await c.owner.patch(`/api/v1/conversations/${id}/preferences`, {
      notificationPref: 'MENTIONS',
    });
    await c.internal.patch(`/api/v1/conversations/${id}/preferences`, { notificationPref: 'NONE' });

    await say(c.support, id, 'primo');
    await say(c.support, id, 'secondo');
    const eng = await unread(users.engineering.id);
    assert.equal(eng.length, 1);
    assert.equal(eng[0]?.eventType, 'message.created');
    assert.equal((eng[0]?.payload as { count: number }).count, 2);
    // Без съдържание на съобщението в известието.
    assert.equal(JSON.stringify(eng[0]?.payload).includes('secondo'), false);
    assert.equal((await unread(users.owner.id)).length, 0);
    assert.equal((await unread(users.support.id)).length, 0);

    await say(c.support, id, 'serve una mano @Olga Owner e @Ivo Interno');
    const owner = await unread(users.owner.id);
    assert.deepEqual(
      owner.map((n) => n.eventType),
      ['message.mention'],
    );
    assert.equal((await unread(users.internal.id)).length, 0);

    // Прочетеният разговор чисти известията за него.
    const last = (await c.engineering.get(`/api/v1/conversations/${id}/messages`)).body.messages.at(
      -1,
    );
    await c.engineering.post(`/api/v1/conversations/${id}/read`, { messageId: last.id });
    assert.equal((await unread(users.engineering.id)).length, 0);
  });

  test('GET: непрочетените първо + брой; POST read: по ids (само свои) или всички', async () => {
    const { c, users } = w;
    const a = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const b = await open(c.owner, { type: 'DIRECT', userId: users.engineering.id });
    await say(c.support, a, 'a');
    await say(c.owner, b, 'b');
    const list = await c.engineering.get('/api/v1/notifications');
    assert.equal(list.body.unreadCount, 2);
    const [first, second] = list.body.notifications;
    // Чужди известия не се маркират.
    const foreign = await c.support.post('/api/v1/notifications/read', { ids: [first.id] });
    assert.equal(foreign.body.updated, 0);
    const one = await c.engineering.post('/api/v1/notifications/read', { ids: [first.id] });
    assert.deepEqual(one.body, { updated: 1, unreadCount: 1 });
    const again = await c.engineering.get('/api/v1/notifications');
    assert.equal(again.body.notifications[0].id, second.id);
    assert.equal(again.body.notifications[0].readAt, null);
    assert.notEqual(again.body.notifications[1].readAt, null);
    assert.equal((await c.engineering.post('/api/v1/notifications/read', {})).status, 400);
    const all = await c.engineering.post('/api/v1/notifications/read', { all: true });
    assert.deepEqual(all.body, { updated: 1, unreadCount: 0 });
  });

  test('поемане на случай, AI отговор в собствен случай и тикет — известяват създателя', async () => {
    const { c, users } = w;
    const caseId = await newCase(c.portalAlfa);
    assert.equal((await c.support.post(`/api/v1/cases/${caseId}/assign`)).status, 200);
    // Операторът пита AI в случая на техника → техникът научава.
    const asked = await ask(c.support, caseId, 'E37 dopo il reset?');
    assert.equal(asked.status, 201, JSON.stringify(asked.body));
    const ticket = await c.support.post('/api/v1/tickets', { caseId, reason: 'serve il tecnico' });
    assert.equal(ticket.status, 201);
    const events = (await unread(users.portalAlfa.id)).map((n) => [n.eventType, n.objectType]);
    assert.deepEqual(events, [
      ['case.assigned', 'case'],
      ['case.ai_answer', 'case'],
      ['ticket.changed', 'ticket'],
    ]);
    // Собственото действие не известява самия автор.
    await ask(c.portalAlfa, caseId, 'e adesso?');
    assert.equal(
      (await unread(users.portalAlfa.id)).filter((n) => n.eventType === 'case.ai_answer').length,
      1,
    );
    assert.equal(
      (await unread(users.support.id)).filter((n) => n.eventType === 'case.ai_answer').length,
      1,
    );
  });
});

describe('бързи отговори', () => {
  const body = {
    shortcut: 'reset-e37',
    locale: 'it',
    title: 'Reset E37',
    body: 'Verificare il cavo encoder al morsetto X3 prima del reset.',
    roleScope: ['SUPPORT', 'INTERNAL_TECHNICIAN'],
  };

  test('видими само PUBLISHED и само за ролите в roleScope; управлението иска kb:manage', async () => {
    const { c } = w;
    assert.equal((await c.support.post('/api/v1/quick-responses', body)).status, 403);
    const created = await c.owner.post('/api/v1/quick-responses', body);
    assert.equal(created.status, 201);
    assert.equal(created.body.quickResponse.status, 'DRAFT');
    const id = created.body.quickResponse.id as string;
    assert.equal((await c.owner.post('/api/v1/quick-responses', body)).status, 409);
    assert.deepEqual((await c.support.get('/api/v1/quick-responses')).body.quickResponses, []);

    assert.equal((await c.owner.post(`/api/v1/quick-responses/${id}/publish`)).status, 200);
    const seen = await c.support.get('/api/v1/quick-responses?locale=it');
    assert.deepEqual(seen.body.quickResponses, [
      { id, shortcut: 'reset-e37', locale: 'it', title: 'Reset E37', body: body.body, version: 1 },
    ]);
    assert.deepEqual(
      (await c.support.get('/api/v1/quick-responses?locale=en')).body.quickResponses,
      [],
    );
    // Роля извън обхвата и друг клиент — нищо.
    assert.deepEqual((await c.portalAlfa.get('/api/v1/quick-responses')).body.quickResponses, []);
    assert.deepEqual((await c.engineering.get('/api/v1/quick-responses')).body.quickResponses, []);
    assert.deepEqual((await c.supportB.get('/api/v1/quick-responses')).body.quickResponses, []);
    assert.equal((await c.supportB.post(`/api/v1/quick-responses/${id}/deprecate`)).status, 403);
    assert.equal(
      await db.auditEvent.count({ where: { action: { startsWith: 'quick_response.' } } }),
      2,
    );
  });

  test('редакция на публикуван → нова версия-чернова; публикуването ѝ отписва старата', async () => {
    const { c } = w;
    const id = (await c.owner.post('/api/v1/quick-responses', body)).body.quickResponse
      .id as string;
    await c.owner.post(`/api/v1/quick-responses/${id}/publish`);
    const v2 = await c.owner.patch(`/api/v1/quick-responses/${id}`, {
      body: 'Nuovo testo: verificare X3 e X4.',
      roleScope: ['PORTAL_TECHNICIAN'],
    });
    assert.equal(v2.status, 201);
    assert.equal(v2.body.quickResponse.version, 2);
    assert.equal(v2.body.quickResponse.status, 'DRAFT');
    // Докато v2 е чернова, техниците виждат v1.
    assert.equal(
      (await c.support.get('/api/v1/quick-responses')).body.quickResponses[0].version,
      1,
    );
    assert.equal(
      (await c.owner.patch(`/api/v1/quick-responses/${id}`, { title: 'altro' })).status,
      409,
    );
    await c.owner.post(`/api/v1/quick-responses/${v2.body.quickResponse.id}/publish`);
    assert.deepEqual((await c.support.get('/api/v1/quick-responses')).body.quickResponses, []);
    const portal = await c.portalAlfa.get('/api/v1/quick-responses');
    assert.equal(portal.body.quickResponses[0].version, 2);
    const all = await c.owner.get('/api/v1/quick-responses/all');
    assert.deepEqual(
      all.body.quickResponses.map((q: { version: number; status: string }) => [
        q.version,
        q.status,
      ]),
      [
        [2, 'PUBLISHED'],
        [1, 'DEPRECATED'],
      ],
    );
    const dep = await c.owner.post(`/api/v1/quick-responses/${v2.body.quickResponse.id}/deprecate`);
    assert.equal(dep.status, 200);
    assert.equal((await c.owner.post(`/api/v1/quick-responses/${id}/publish`)).status, 409);
    assert.deepEqual((await c.portalAlfa.get('/api/v1/quick-responses')).body.quickResponses, []);
  });
});
