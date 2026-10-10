import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import { verifyAuditChain } from '../../src/audit.js';
import { RealtimeHub } from '../../src/realtime/hub.js';
import { db, makeUser, signIn, startApp, type Client, type Harness } from './helpers.js';
import {
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
 * Критерии за приемане в работното пространство (docs/acceptance.md): AC-11 (достъпът е изричен —
 * и за ЗАПИС), AC-12 (повторно изпращане/reconnect), AC-13 (резерва при паднал поток), AC-15
 * (бързи отговори), AC-16 (одит на административните действия). Допълват collab-*.test.ts.
 */

let h: Harness;
let w: CollabWorld;
const streams: Stream[] = [];

before(async () => {
  h = await startApp({ diagnose: 'none', hub: new RealtimeHub({ heartbeatMs: 150 }) });
});
after(async () => {
  streams.splice(0).forEach((s) => s.close());
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
const msgs = (id: string, q = '') => `/api/v1/conversations/${id}/messages${q}`;

describe('AC-11 — изричен достъп и за запис: чужд обект е 404 и нищо не се променя', () => {
  test('членове, звезда, предпочитания, прочетено, съобщения, реакции — отвън всичко е 404', async () => {
    const { c, users } = w;
    const priv = await open(c.support, { type: 'CHANNEL', name: 'Urgenze' });
    const portalGroup = await open(c.support, { type: 'GROUP', userIds: [users.portalAlfa.id] });
    const caseId = await newCase(c.portalAlfa);
    const discussion = (await c.support.post(`/api/v1/cases/${caseId}/conversation`)).body
      .conversation.id as string;
    const secret: Record<string, { id: string; text: string }> = {};
    for (const [key, conv] of [
      ['priv', priv],
      ['portalGroup', portalGroup],
      ['discussion', discussion],
    ] as const) {
      const m = await say(c.support, conv, `riservato ${key}`);
      secret[key] = { id: conv, text: m.id };
    }
    const outsiders: Array<[string, Client, string[]]> = [
      ['internal', c.internal, ['priv', 'portalGroup', 'discussion']],
      ['engineering', c.engineering, ['priv', 'portalGroup']],
      ['tenantAdmin', c.tenantAdmin, ['priv', 'portalGroup']],
      ['portalAlfa2', c.portalAlfa2, ['priv', 'portalGroup', 'discussion']],
      ['portalBeta', c.portalBeta, ['priv', 'portalGroup', 'discussion']],
      ['portalAlfa', c.portalAlfa, ['priv', 'discussion']],
      ['supportB', c.supportB, ['priv', 'portalGroup', 'discussion']],
      ['portalB', c.portalB, ['priv', 'portalGroup', 'discussion']],
    ];
    const before = {
      members: await db.conversationMember.count(),
      messages: await db.conversationMessage.count(),
      reactions: await db.messageReaction.count(),
    };
    for (const [who, client, keys] of outsiders) {
      for (const key of keys) {
        const { id, text } = secret[key] ?? { id: '', text: '' };
        const attempts: Array<[string, Promise<{ status: number }>]> = [
          ['GET conv', client.get(`/api/v1/conversations/${id}`)],
          ['GET after', client.get(msgs(id, `?after=${text}`))],
          ['GET thread', client.get(msgs(id, `?threadId=${text}`))],
          [
            'POST msg',
            client.post(msgs(id), { text: 'intrusione', clientMessageId: randomUUID() }),
          ],
          ['POST read', client.post(`/api/v1/conversations/${id}/read`, { messageId: text })],
          ['POST star', client.post(`/api/v1/conversations/${id}/star`, { starred: true })],
          [
            'PATCH prefs',
            client.patch(`/api/v1/conversations/${id}/preferences`, { notificationPref: 'ALL' }),
          ],
          [
            'POST members',
            client.post(`/api/v1/conversations/${id}/members`, { userIds: [users.portalAlfa.id] }),
          ],
          ['DELETE member', client.del(`/api/v1/conversations/${id}/members/${users.support.id}`)],
          ['PATCH msg', client.patch(`/api/v1/messages/${text}`, { text: 'manomesso' })],
          ['DELETE msg', client.del(`/api/v1/messages/${text}`)],
          [
            'POST reaction',
            client.post(`/api/v1/messages/${text}/reactions`, { reaction: 'like' }),
          ],
        ];
        for (const [what, pending] of attempts) {
          assert.equal((await pending).status, 404, `${who} → ${key}: ${what}`);
        }
      }
    }
    assert.equal(await db.conversationMember.count(), before.members);
    assert.equal(await db.conversationMessage.count(), before.messages);
    assert.equal(await db.messageReaction.count(), before.reactions);
    for (const key of ['priv', 'portalGroup', 'discussion']) {
      const row = await db.conversationMessage.findUniqueOrThrow({
        where: { id: secret[key]?.text ?? '' },
      });
      assert.equal(row.deletedAt, null);
      assert.equal(row.editedAt, null);
      assert.equal(row.body, `riservato ${key}`);
    }
  });

  test('списъци, известия и поток на аутсайдер не носят чужди разговори (нито като идентификатор)', async () => {
    const { c, users } = w;
    const priv = await open(c.support, { type: 'CHANNEL', name: 'Urgenze' });
    const dm = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const portalGroup = await open(c.support, { type: 'GROUP', userIds: [users.portalAlfa.id] });
    const outsiders = [c.internal, c.portalBeta, c.supportB, c.portalAlfa2] as const;
    const streamsOf = await Promise.all(outsiders.map((o) => stream(o)));
    const bystander = await stream(c.engineering);

    await say(c.support, portalGroup, 'segreto portale');
    await say(c.support, priv, 'segreto priv');
    await say(c.support, dm, 'segreto dm');
    // Бариера: последното съобщение е стигнало до члена — публикуването на предишните е приключило.
    await bystander.waitFor(created('segreto dm'));
    const hidden = new Set([priv, dm, portalGroup]);

    for (const outsider of outsiders) {
      const list = await outsider.get('/api/v1/conversations');
      assert.deepEqual(
        list.body.conversations.filter((x: { id: string }) => hidden.has(x.id)),
        [],
      );
      const notes = await outsider.get('/api/v1/notifications');
      assert.equal(notes.body.unreadCount, 0);
      assert.equal(JSON.stringify(notes.body).includes('segreto'), false);
    }
    // Каналът е PRIVATE: не се вижда и в общия списък с канали.
    const browse = await c.internal.get('/api/v1/conversations?scope=public');
    assert.equal(
      browse.body.conversations.some((x: { id: string }) => x.id === priv),
      false,
    );
    for (const s of streamsOf) {
      assert.equal(
        s.events.some((e) => JSON.stringify(e.data).includes('segreto')),
        false,
      );
      assert.equal(
        s.events.some((e) => hidden.has(e.data?.conversation_id)),
        false,
      );
    }
  });
});

describe('AC-12 — повторно изпращане и reconnect не дублират', () => {
  test('повторен POST със същия clientMessageId: един запис, едно събитие в потока, едно известие', async () => {
    const { c, users } = w;
    const id = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const s = await stream(c.engineering);
    const clientMessageId = randomUUID();
    const body = { text: 'controllare X3', clientMessageId };
    const first = await c.support.post(msgs(id), body);
    const retry = await c.support.post(msgs(id), body);
    assert.deepEqual([first.status, retry.status], [201, 200]);
    assert.equal(retry.body.message.id, first.body.message.id);
    await say(c.support, id, 'barriera');
    await s.waitFor(created('barriera'));

    assert.equal(s.events.filter(created('controllare X3')).length, 1);
    const unread = await db.notification.findMany({
      where: { userId: users.engineering.id, readAt: null },
    });
    assert.equal(unread.length, 1);
    assert.equal((unread[0]?.payload as { count: number }).count, 2, 'X3 + barriera, не 3');
    assert.equal(await db.conversationMessage.count({ where: { conversationId: id } }), 2);
  });

  test('нова страница / reconnect: същата нишка със същите id; after=курсор връща новото точно веднъж', async () => {
    const { c, users } = w;
    const id = await open(c.support, { type: 'GROUP', userIds: [users.engineering.id] });
    const sent = [await say(c.support, id, 'uno'), await say(c.engineering, id, 'due')];
    const cmid = randomUUID();
    const third = await c.support.post(msgs(id), { text: 'tre', clientMessageId: cmid });

    // „Навигация“: друга сесия на същия човек чете цялата нишка — по ред, без дубли.
    const reopened = await signIn(h, users.support);
    const thread = await reopened.get(msgs(id));
    assert.deepEqual(
      thread.body.messages.map((m: { id: string }) => m.id),
      [sent[0].id, sent[1].id, third.body.message.id],
    );
    // Reconnect: повторение на неизвестно дали стигналото + наваксване по курсора.
    await c.support.post(msgs(id), { text: 'tre', clientMessageId: cmid });
    const four = await say(c.engineering, id, 'quattro');
    const catchUp = await reopened.get(msgs(id, `?after=${third.body.message.id}`));
    assert.deepEqual(
      catchUp.body.messages.map((m: { id: string }) => m.id),
      [four.id],
    );
    const again = await reopened.get(msgs(id, `?after=${four.id}`));
    assert.deepEqual(again.body.messages, []);
  });
});

describe('AC-13 — резерва, когато каналът в реално време падне', () => {
  test('без поток: непрочетени, известия, присъствие и пропуснато идват през REST; новият поток не повтаря', async () => {
    const { c, users } = w;
    const id = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const live = await stream(c.engineering);
    const seen = await say(c.support, id, 'prima');
    await live.waitFor(created('prima'));
    await c.engineering.post(`/api/v1/conversations/${id}/read`, { messageId: seen.id });

    // Потокът пада (мрежа, прокси); хъбът го забравя.
    live.close();
    await live.closed;
    await eventually(() => h.hub.size(users.engineering.id) === 0);
    await say(c.support, id, 'durante la caduta 1');
    const last = await say(c.support, id, 'durante la caduta 2');
    await c.support.post('/api/v1/presence/heartbeat', { status: 'ONLINE' });

    const list = await c.engineering.get('/api/v1/conversations');
    const row = list.body.conversations.find((x: { id: string }) => x.id === id);
    assert.equal(row.unread, 2);
    assert.equal(row.lastMessage.preview, 'durante la caduta 2');
    const notes = await c.engineering.get('/api/v1/notifications');
    assert.equal(notes.body.unreadCount, 1);
    assert.equal(notes.body.notifications[0].payload.count, 2);
    assert.equal(notes.body.notifications[0].objectId, id);
    const missed = await c.engineering.get(msgs(id, `?after=${seen.id}`));
    assert.deepEqual(
      missed.body.messages.map((m: { body: string }) => m.body),
      ['durante la caduta 1', 'durante la caduta 2'],
    );
    const presence = await c.engineering.get(`/api/v1/presence?userIds=${users.support.id}`);
    assert.equal(presence.body.presence[0].status, 'ONLINE');

    // Reconnect: потокът продължава от сега — пропуснатото не се „възпроизвежда“.
    const resumed = await stream(c.engineering);
    await say(c.support, id, 'dopo la riconnessione');
    await resumed.waitFor(created('dopo la riconnessione'));
    assert.equal(resumed.events.filter((e) => e.event === 'message.created').length, 1);

    // Прочитането по REST чисти брояча и известието.
    await c.engineering.post(`/api/v1/conversations/${id}/read`, { messageId: last.id });
    const after = await c.engineering.get('/api/v1/conversations');
    assert.equal(
      after.body.conversations.find((x: { id: string }) => x.id === id).unread,
      1,
      'остава само съобщението след наваксването',
    );
  });
});

describe('AC-15 — бързите отговори: само разрешените роли, редактируеми преди изпращане', () => {
  const template = {
    shortcut: 'reset-e37',
    locale: 'it',
    title: 'Reset E37',
    body: 'Verificare il cavo encoder al morsetto X3 prima del reset.',
    roleScope: ['SUPPORT'],
  };

  test('видимостта следва ролята на момента и клиента; чужд клиент не публикува и не чете чужд шаблон', async () => {
    const { c, users } = w;
    const ownerB = await signIn(
      h,
      await makeUser({ tenantId: w.tenantB.id, role: 'KNOWLEDGE_OWNER' }),
    );
    const id = (await c.owner.post('/api/v1/quick-responses', template)).body.quickResponse
      .id as string;
    // Чернова: никой не я вижда; публикуване: само SUPPORT на клиента.
    assert.deepEqual((await c.support.get('/api/v1/quick-responses')).body.quickResponses, []);
    await c.owner.post(`/api/v1/quick-responses/${id}/publish`);
    assert.equal((await c.support.get('/api/v1/quick-responses')).body.quickResponses.length, 1);
    for (const other of [c.internal, c.engineering, c.tenantAdmin, c.portalAlfa, c.supportB]) {
      assert.deepEqual((await other.get('/api/v1/quick-responses')).body.quickResponses, []);
    }

    // Друг клиент: не вижда, не променя, не публикува, не отписва шаблона на A.
    assert.deepEqual((await ownerB.get('/api/v1/quick-responses/all')).body.quickResponses, []);
    for (const path of ['publish', 'deprecate']) {
      const res = await ownerB.post(`/api/v1/quick-responses/${id}/${path}`);
      assert.equal(res.status, 404, path);
    }
    assert.equal((await ownerB.patch(`/api/v1/quick-responses/${id}`, { title: 'x' })).status, 404);
    const stored = await db.quickResponse.findUniqueOrThrow({ where: { id } });
    assert.deepEqual([stored.status, stored.title], ['PUBLISHED', 'Reset E37']);

    // Същият шаблон за същия shortcut в клиент B е независим.
    const own = await ownerB.post('/api/v1/quick-responses', {
      ...template,
      body: 'Testo del cliente B.',
    });
    assert.equal(own.status, 201);
    await ownerB.post(`/api/v1/quick-responses/${own.body.quickResponse.id}/publish`);
    const seenB = await c.supportB.get('/api/v1/quick-responses');
    assert.deepEqual(
      seenB.body.quickResponses.map((q: { body: string }) => q.body),
      ['Testo del cliente B.'],
    );
    assert.equal(
      (await c.support.get('/api/v1/quick-responses')).body.quickResponses[0].body,
      template.body,
    );

    // Ролята се чете при всяка заявка: смяна на ролята сваля достъпа веднага.
    await db.user.update({ where: { id: users.support.id }, data: { role: 'ENGINEERING' } });
    assert.deepEqual((await c.support.get('/api/v1/quick-responses')).body.quickResponses, []);
  });

  test('преглеждането не изпраща нищо; изпратеният текст е редактираният (и маскиран), шаблонът не се променя', async () => {
    const { c, users } = w;
    const id = (await c.owner.post('/api/v1/quick-responses', template)).body.quickResponse
      .id as string;
    await c.owner.post(`/api/v1/quick-responses/${id}/publish`);
    const conv = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const picked = (await c.support.get('/api/v1/quick-responses')).body.quickResponses[0];
    assert.equal(await db.conversationMessage.count({ where: { conversationId: conv } }), 0);

    const email = ['mario.rossi', 'esempio.it'].join('@');
    const edited = `${picked.body} Scrivere a ${email} per conferma.`;
    const sent = await c.support.post(msgs(conv), { text: edited, clientMessageId: randomUUID() });
    assert.equal(sent.status, 201);
    assert.match(sent.body.message.body, /^Verificare il cavo encoder/);
    assert.equal(sent.body.message.body.includes(email), false);
    assert.notEqual(sent.body.message.body, picked.body, 'редактираният текст, не шаблонът');
    const row = await db.quickResponse.findUniqueOrThrow({ where: { id } });
    assert.equal(row.body, template.body);
    assert.equal(row.version, 1);
    // И неизменен шаблон се изпраща като обикновено съобщение — без специален път.
    assert.equal((await c.support.post(msgs(conv), { text: picked.body })).status, 201);
  });
});

describe('AC-16 — одит на деактивиране, нулиране, отнемане на сесии и смяна на роля', () => {
  const email = ['mario.rossi', 'esempio.it'].join('@');
  const REASON = `Richiesta di ${email}`;

  test('всяко действие е във веригата: кой, над кого, причина (маскирана), промяна; без токени', async () => {
    const { c, users } = w;
    const admin = c.tenantAdmin;
    const target = users.internal.id;
    const patch = (body: object) =>
      admin.patch(`/api/v1/users/${target}/admin`, { ...body, reason: REASON });

    assert.equal((await patch({ role: 'SUPPORT' })).status, 200);
    assert.equal((await patch({ active: false })).status, 200);
    const link = await admin.post(`/api/v1/admin/users/${target}/reset-password`, {
      reason: REASON,
    });
    assert.equal(link.status, 200);
    assert.equal(
      (
        await admin.post(`/api/v1/admin/users/${users.engineering.id}/revoke-sessions`, {
          reason: REASON,
        })
      ).status,
      200,
    );
    assert.equal(
      (await admin.post(`/api/v1/admin/users/${users.support.id}/reset-mfa`, { reason: REASON }))
        .status,
      200,
    );

    const audit = await admin.get('/api/v1/audit');
    assert.equal(audit.status, 200);
    type Ev = {
      action: string;
      actorId: string;
      objectType: string;
      objectId: string;
      detail: { reason?: string; changes?: Record<string, { from: unknown; to: unknown }> };
    };
    const events = (audit.body.events as Ev[]).filter((e) => e.action.startsWith('user.'));
    const byAction = (action: string, objectId: string) =>
      events.filter((e) => e.action === action && e.objectId === objectId);

    const updates = byAction('user.admin_update', target);
    assert.equal(updates.length, 2);
    const roleChange = updates.find((e) => e.detail.changes?.role);
    assert.deepEqual(roleChange?.detail.changes?.role, {
      from: 'INTERNAL_TECHNICIAN',
      to: 'SUPPORT',
    });
    const deactivation = updates.find((e) => e.detail.changes?.active);
    assert.deepEqual(deactivation?.detail.changes?.active, { from: true, to: false });
    for (const e of [
      ...updates,
      ...byAction('user.reset_link', target),
      ...byAction('user.revoke_sessions', users.engineering.id),
      ...byAction('user.mfa_reset', users.support.id),
    ]) {
      assert.equal(e.actorId, users.tenantAdmin.id);
      assert.equal(e.objectType, 'user');
      assert.match(e.detail.reason ?? '', /^Richiesta di \[email\]$/);
    }
    assert.equal(byAction('user.reset_link', target).length, 1);
    assert.equal(byAction('user.revoke_sessions', users.engineering.id).length, 1);
    assert.equal(byAction('user.mfa_reset', users.support.id).length, 1);

    // Нито линкът, нито токенът, нито лични данни са в одита; веригата е цяла.
    const dump = JSON.stringify(await db.auditEvent.findMany());
    assert.equal(dump.includes(link.body.url.split('#')[1]), false);
    assert.equal(dump.includes(email), false);
    assert.equal(await verifyAuditChain(db), null);
  });

  test('отказаните действия не оставят следа като успешни; без право няма и достъп до одита', async () => {
    const { c, users } = w;
    const attempts = [
      c.tenantAdmin.patch(`/api/v1/users/${users.internal.id}/admin`, { active: false }),
      c.tenantAdmin.patch(`/api/v1/users/${users.tenantAdmin.id}/admin`, {
        active: false,
        reason: 'da solo',
      }),
      c.tenantAdmin.post(`/api/v1/admin/users/${users.supportB.id}/reset-mfa`, { reason: 'x y z' }),
      c.support.post(`/api/v1/admin/users/${users.internal.id}/revoke-sessions`, {
        reason: 'x y z',
      }),
      c.internal.patch(`/api/v1/users/${users.support.id}/admin`, {
        active: false,
        reason: 'x y z',
      }),
    ];
    const statuses = (await Promise.all(attempts)).map((r) => r.status);
    assert.deepEqual(statuses, [400, 409, 404, 403, 403]);
    assert.equal(
      await db.auditEvent.count({ where: { action: { startsWith: 'user.' } } }),
      0,
      'отказаните не са одитирани като извършени',
    );
    const stillThere = await db.user.findUniqueOrThrow({ where: { id: users.internal.id } });
    assert.equal(stillThere.active, true);
    for (const reader of [c.support, c.internal, c.portalAlfa, c.engineering]) {
      assert.equal((await reader.get('/api/v1/audit')).status, 403);
    }
  });

  test('директорията: филтрите се комбинират на сървъра и се пазят през страниците', async () => {
    const { c, users } = w;
    for (let i = 0; i < 4; i += 1) {
      await makeUser({
        tenantId: w.tenantA.id,
        role: 'INTERNAL_TECHNICIAN',
        name: `Tecnico Extra ${i}`,
      });
    }
    await makeUser({
      tenantId: w.tenantA.id,
      role: 'INTERNAL_TECHNICIAN',
      name: 'Tecnico Spento',
      active: false,
    });
    const names: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: {
        status: number;
        body: {
          users: Array<{ name: string; role: string; active: boolean }>;
          next: string | null;
        };
      } = await c.tenantAdmin.get(
        `/api/v1/admin/users?role=INTERNAL_TECHNICIAN&active=true&q=tecnico&limit=2${cursor ? `&cursor=${cursor}` : ''}`,
      );
      assert.equal(res.status, 200);
      assert.ok(res.body.users.every((u) => u.role === 'INTERNAL_TECHNICIAN' && u.active));
      names.push(...res.body.users.map((u) => u.name));
      cursor = res.body.next;
      pages += 1;
    } while (cursor && pages < 10);
    assert.deepEqual(names, [
      'Tecnico Extra 0',
      'Tecnico Extra 1',
      'Tecnico Extra 2',
      'Tecnico Extra 3',
    ]);
    assert.equal(names.includes(users.internal.name), false, 'Ivo Interno не съдържа „tecnico“');
  });
});
