import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import { db, startApp, type Harness } from './helpers.js';
import { del, open, resetCollab, say, seedCollab, type CollabWorld } from './collab-world.js';

/**
 * Разговори и съобщения (FR-15…FR-17, NFR-12): лява лента с непрочетени по курсора, страници и
 * нишки, идемпотентност (и при паралелни повтори), редакция до 15 мин., меко триене с одит,
 * реакции, членове, звезда, лимит на изпращанията.
 */

let h: Harness;
let w: CollabWorld;

before(async () => {
  h = await startApp({ diagnose: 'none' });
});
after(async () => {
  await h.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetCollab();
  w = await seedCollab(h);
});

const msgs = (id: string, q = '') => `/api/v1/conversations/${id}/messages${q}`;

describe('съобщения', () => {
  test('идемпотентно по clientMessageId — последователно и паралелно, без 500 и без дубли', async () => {
    const { c, users } = w;
    const id = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const clientMessageId = randomUUID();
    const body = { text: 'controllare E37', clientMessageId };
    const first = await c.support.post(msgs(id), body);
    assert.equal(first.status, 201);
    const again = await c.support.post(msgs(id), body);
    assert.equal(again.status, 200);
    assert.equal(again.body.message.id, first.body.message.id);

    const parallelId = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        c.support.post(msgs(id), { text: 'doppio', clientMessageId: parallelId }),
      ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 200, 200, 200, 200, 201]);
    assert.equal(new Set(results.map((r) => r.body.message.id)).size, 1);
    assert.equal(await db.conversationMessage.count({ where: { clientMessageId: parallelId } }), 1);

    // Чужд clientMessageId в същия разговор не връща чуждото съобщение.
    const foreign = await c.engineering.post(msgs(id), body);
    assert.equal(foreign.status, 409);
    assert.equal(foreign.body.message, undefined);
  });

  test('лични данни се маскират; празно и над 4000 знака — 400', async () => {
    const { c, users } = w;
    const id = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const email = ['mario.rossi', 'esempio.it'].join('@');
    const m = await say(c.support, id, `scrivere a ${email} per il ricambio`);
    assert.equal(m.body.includes(email), false);
    assert.match(m.body, /\[email\]/);
    assert.equal((await c.support.post(msgs(id), { text: '   ' })).status, 400);
    assert.equal((await c.support.post(msgs(id), { text: 'x'.repeat(4001) })).status, 400);
    assert.equal((await c.support.post(msgs(id), { text: 'x'.repeat(4000) })).status, 201);
  });

  test('страници по курсор и нишки на едно ниво (отговор на отговор → към корена)', async () => {
    const { c, users } = w;
    const id = await open(c.support, { type: 'GROUP', userIds: [users.engineering.id] });
    const sent = [];
    for (let i = 1; i <= 5; i += 1) sent.push(await say(c.support, id, `m${i}`));
    const r1 = await say(c.engineering, id, 'risposta', { replyToId: sent[1].id });
    const r2 = await say(c.support, id, 'risposta alla risposta', { replyToId: r1.id });
    assert.equal(r2.replyToId, sent[1].id);

    const newest = await c.support.get(msgs(id, '?limit=2'));
    assert.deepEqual(
      newest.body.messages.map((m: { body: string }) => m.body),
      ['m4', 'm5'],
    );
    assert.equal(newest.body.hasMore, true);
    const older = await c.support.get(msgs(id, `?limit=10&before=${newest.body.messages[0].id}`));
    assert.deepEqual(
      older.body.messages.map((m: { body: string }) => m.body),
      ['m1', 'm2', 'm3'],
    );
    assert.equal(older.body.hasMore, false);
    assert.equal(older.body.messages[1].replyCount, 2);
    const catchUp = await c.support.get(msgs(id, `?after=${sent[2].id}`));
    assert.deepEqual(
      catchUp.body.messages.map((m: { body: string }) => m.body),
      ['m4', 'm5'],
    );
    const thread = await c.support.get(msgs(id, `?threadId=${sent[1].id}`));
    assert.deepEqual(
      thread.body.messages.map((m: { body: string }) => m.body),
      ['risposta', 'risposta alla risposta'],
    );
    assert.equal((await c.support.get(msgs(id, `?threadId=${r1.id}`))).status, 404);
    // Курсор от чужд разговор — не се приема.
    const other = await open(c.support, { type: 'DIRECT', userId: users.owner.id });
    const foreign = await say(c.support, other, 'altrove');
    assert.equal((await c.support.get(msgs(id, `?before=${foreign.id}`))).status, 400);
    assert.equal(
      (await c.support.post(msgs(id), { text: 'x', replyToId: foreign.id })).status,
      400,
    );
  });

  test('редакция: само авторът, до 15 минути, с одит; триене: автор или OWNER, меко', async () => {
    const { c, users } = w;
    const id = await open(c.support, {
      type: 'GROUP',
      userIds: [users.engineering.id, users.internal.id],
    });
    const mine = await say(c.engineering, id, 'testo originale');
    assert.equal(
      (await c.internal.patch(`/api/v1/messages/${mine.id}`, { text: 'no' })).status,
      403,
    );
    const edited = await c.engineering.patch(`/api/v1/messages/${mine.id}`, {
      text: 'testo corretto',
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.message.body, 'testo corretto');
    assert.notEqual(edited.body.message.editedAt, null);
    assert.equal(
      await db.auditEvent.count({ where: { action: 'message.edit', objectId: mine.id } }),
      1,
    );

    await db.conversationMessage.update({
      where: { id: mine.id },
      data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) },
    });
    const late = await c.engineering.patch(`/api/v1/messages/${mine.id}`, { text: 'tardi' });
    assert.equal(late.status, 409);
    assert.equal(late.body.code, 'edit_window_expired');

    // Не-OWNER не трие чуждо; OWNER (създателят на групата) — да, като модерация.
    assert.equal((await del(c.internal, `/api/v1/messages/${mine.id}`)).status, 403);
    assert.equal((await del(c.support, `/api/v1/messages/${mine.id}`)).status, 204);
    const row = await db.conversationMessage.findUniqueOrThrow({ where: { id: mine.id } });
    assert.notEqual(row.deletedAt, null);
    assert.equal(row.body, '');
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: 'message.delete' } });
    assert.deepEqual(audit.detail, { conversationId: id, moderated: true });
    const page = await c.internal.get(msgs(id));
    const shown = page.body.messages.find((m: { id: string }) => m.id === mine.id);
    assert.equal(shown.deleted, true);
    assert.equal(shown.body, null);
    // Изтритото не се редактира и не получава реакции; повторно триене е безвредно.
    const editDeleted = await c.engineering.patch(`/api/v1/messages/${mine.id}`, { text: 'x' });
    assert.equal(editDeleted.status, 409);
    assert.equal(editDeleted.body.code, 'message_deleted');
    assert.equal(
      (await c.internal.post(`/api/v1/messages/${mine.id}/reactions`, { reaction: 'like' })).status,
      409,
    );
    assert.equal((await del(c.support, `/api/v1/messages/${mine.id}`)).status, 204);

    // В DIRECT няма модератор: никой не трие чуждо.
    const dm = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const theirs = await say(c.engineering, dm, 'mio');
    assert.equal((await del(c.support, `/api/v1/messages/${theirs.id}`)).status, 403);
  });

  test('реакции: само от позволените, идемпотентни, махат се', async () => {
    const { c, users } = w;
    const id = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const m = await say(c.support, id, 'ok?');
    const path = `/api/v1/messages/${m.id}/reactions`;
    assert.equal((await c.engineering.post(path, { reaction: '<script>' })).status, 400);
    await c.engineering.post(path, { reaction: 'like' });
    const twice = await c.engineering.post(path, { reaction: 'like' });
    assert.deepEqual(twice.body.message.reactions, [
      { reaction: 'like', count: 1, userIds: [users.engineering.id] },
    ]);
    const removed = await c.engineering.req('DELETE', `${path}?reaction=like`);
    assert.equal(removed.status, 200);
    assert.deepEqual(removed.body.message.reactions, []);
  });
});

describe('разговори', () => {
  test('лява лента: непрочетени по курсора, последно съобщение, звезда, пагинация', async () => {
    const { c, users } = w;
    const a = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const b = await open(c.support, {
      type: 'GROUP',
      userIds: [users.engineering.id],
      name: 'Squadra',
    });
    const ch = await open(c.support, {
      type: 'CHANNEL',
      name: 'LTX-500',
      userIds: [users.engineering.id],
    });
    await say(c.support, a, 'uno');
    const two = await say(c.support, a, 'due');
    await say(c.engineering, a, 'mia');
    await say(c.support, b, 'gruppo');
    await say(c.support, ch, 'canale');

    const list = await c.engineering.get('/api/v1/conversations');
    assert.deepEqual(
      list.body.conversations.map((x: { id: string }) => x.id),
      [ch, b, a],
    );
    const dm = list.body.conversations.find((x: { id: string }) => x.id === a);
    assert.equal(dm.unread, 2);
    assert.equal(dm.lastMessage.preview, 'mia');
    assert.deepEqual(dm.members.map((m: { name: string }) => m.name).sort(), [
      'Enzo Ingegnere',
      'Sara Supporto',
    ]);

    const read = await c.engineering.post(`/api/v1/conversations/${a}/read`, { messageId: two.id });
    assert.deepEqual(read.body, { unread: 0, lastReadMessageId: two.id });
    // Курсорът не се връща назад.
    const first = (await c.engineering.get(msgs(a))).body.messages[0];
    const back = await c.engineering.post(`/api/v1/conversations/${a}/read`, {
      messageId: first.id,
    });
    assert.equal(back.body.lastReadMessageId, two.id);
    await say(c.support, a, 'tre');
    const after1 = await c.engineering.get('/api/v1/conversations');
    assert.equal(after1.body.conversations.find((x: { id: string }) => x.id === a).unread, 1);

    assert.equal(
      (await c.engineering.post(`/api/v1/conversations/${b}/star`, { starred: true })).status,
      200,
    );
    const page1 = await c.engineering.get('/api/v1/conversations?limit=2');
    assert.equal(page1.body.conversations.length, 2);
    assert.ok(page1.body.nextCursor);
    const page2 = await c.engineering.get(
      `/api/v1/conversations?limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`,
    );
    assert.equal(page2.body.conversations.length, 1);
    assert.equal(page2.body.nextCursor, null);
    const starred = [...page1.body.conversations, ...page2.body.conversations].filter(
      (x: { starred: boolean }) => x.starred,
    );
    assert.deepEqual(
      starred.map((x: { id: string }) => x.id),
      [b],
    );
    assert.equal((await c.engineering.get('/api/v1/conversations?cursor=rotto')).status, 400);
  });

  test('DIRECT е един за двойката; канал с повторено име — 409; PRIVATE по подразбиране за Urgenze', async () => {
    const { c, users } = w;
    const one = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const two = await open(c.engineering, { type: 'DIRECT', userId: users.support.id }, 200);
    assert.equal(one, two);
    assert.equal(
      (await c.support.post('/api/v1/conversations', { type: 'DIRECT', userId: users.support.id }))
        .status,
      400,
    );
    const urg = await c.support.post('/api/v1/conversations', { type: 'CHANNEL', name: 'Urgenze' });
    assert.equal(urg.body.conversation.visibility, 'PRIVATE');
    const dup = await c.engineering.post('/api/v1/conversations', {
      type: 'CHANNEL',
      name: 'urgenze',
    });
    assert.equal(dup.status, 409);
    // Техникът не създава канали.
    assert.equal(
      (await c.internal.post('/api/v1/conversations', { type: 'CHANNEL', name: 'Mio' })).status,
      403,
    );
    assert.equal(await db.auditEvent.count({ where: { action: 'conversation.create' } }), 2);
  });

  test('членове: OWNER добавя/маха с одит; сам влиза в PUBLIC канал; без OWNER — най-старият', async () => {
    const { c, users } = w;
    const group = await open(c.support, { type: 'GROUP', userIds: [users.engineering.id] });
    assert.equal(
      (
        await c.engineering.post(`/api/v1/conversations/${group}/members`, {
          userIds: [users.owner.id],
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await c.support.post(`/api/v1/conversations/${group}/members`, {
          userIds: [users.owner.id],
        })
      ).status,
      200,
    );
    assert.equal(await db.auditEvent.count({ where: { action: 'conversation.member_add' } }), 1);
    assert.equal(
      (await del(c.engineering, `/api/v1/conversations/${group}/members/${users.owner.id}`)).status,
      403,
    );
    assert.equal(
      (await del(c.support, `/api/v1/conversations/${group}/members/${users.owner.id}`)).status,
      204,
    );
    assert.equal(await db.auditEvent.count({ where: { action: 'conversation.member_remove' } }), 1);
    // OWNER излиза — най-старият оставащ става OWNER.
    assert.equal(
      (await del(c.support, `/api/v1/conversations/${group}/members/${users.support.id}`)).status,
      204,
    );
    const left = await db.conversationMember.findMany({ where: { conversationId: group } });
    assert.deepEqual(
      left.map((m) => [m.userId, m.role]),
      [[users.engineering.id, 'OWNER']],
    );
    assert.equal((await c.support.get(`/api/v1/conversations/${group}`)).status, 404);

    const dm = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const addDm = await c.support.post(`/api/v1/conversations/${dm}/members`, {
      userIds: [users.owner.id],
    });
    assert.equal(addDm.status, 409);
    assert.equal(addDm.body.code, 'not_allowed_for_type');

    const pub = await open(c.support, { type: 'CHANNEL', name: 'Generale' });
    const peek = await c.internal.get(`/api/v1/conversations/${pub}`);
    assert.equal(peek.body.canJoin, true);
    assert.equal(peek.body.conversation.member, false);
    const join = await c.internal.post(`/api/v1/conversations/${pub}/members`, {
      userIds: [users.internal.id],
    });
    assert.equal(join.status, 200);
    assert.equal(join.body.conversation.member, true);
    // Писането в PUBLIC канал вписва автоматично.
    await say(c.engineering, pub, 'entro');
    assert.equal(await db.conversationMember.count({ where: { conversationId: pub } }), 3);
    // В PRIVATE канал никой не влиза сам.
    const priv = await open(c.support, { type: 'CHANNEL', name: 'Engineering' });
    assert.equal(
      (
        await c.engineering.post(`/api/v1/conversations/${priv}/members`, {
          userIds: [users.engineering.id],
        })
      ).status,
      404,
    );
  });

  test('предпочитания: само член; невалидно — 400', async () => {
    const { c, users } = w;
    const id = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const res = await c.engineering.patch(`/api/v1/conversations/${id}/preferences`, {
      notificationPref: 'MENTIONS',
    });
    assert.equal(res.body.conversation.notificationPref, 'MENTIONS');
    assert.equal(
      (await c.engineering.patch(`/api/v1/conversations/${id}/preferences`, {})).status,
      400,
    );
    const pub = await open(c.support, { type: 'CHANNEL', name: 'Generale' });
    assert.equal(
      (await c.internal.post(`/api/v1/conversations/${pub}/star`, { starred: true })).status,
      403,
    );
  });

  test('лимит на изпращанията на човек: 30 в минута → 429', async () => {
    const { c, users } = w;
    const id = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const statuses = [];
    for (let i = 0; i < 31; i += 1) {
      statuses.push((await c.engineering.post(msgs(id), { text: `n${i}` })).status);
    }
    assert.equal(statuses.filter((s) => s === 201).length, 30);
    assert.equal(statuses.at(-1), 429);
  });
});
