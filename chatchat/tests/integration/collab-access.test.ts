import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { db, startApp, type Client, type Harness } from './helpers.js';
import { del, open, resetCollab, say, seedCollab, type CollabWorld } from './collab-world.js';
import { newCase } from './world.js';

/**
 * Кръстосан достъп в работното пространство (§15, AC-18): вътрешен ↔ портал ↔ друга фирма ↔
 * друг клиент. Всеки чужд обект е 404 (не издаваме, че съществува), порталът никога не вижда
 * канали и вътрешни дискусии, в портален разговор не влиза друга фирма.
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

/** Четене на разговора и съобщенията му + опит за писане. */
async function probe(c: Client, id: string) {
  const conv = await c.get(`/api/v1/conversations/${id}`);
  const list = await c.get(`/api/v1/conversations/${id}/messages`);
  return { conv: conv.status, list: list.status };
}

describe('кръстосан достъп', () => {
  test('матрица: DIRECT, GROUP, PUBLIC/PRIVATE канал, портален разговор, дискусия по случай', async () => {
    const { c, users } = w;
    const direct = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const group = await open(c.support, { type: 'GROUP', userIds: [users.internal.id] });
    const pub = await open(c.support, { type: 'CHANNEL', name: 'Generale' });
    const priv = await open(c.support, { type: 'CHANNEL', name: 'Urgenze' });
    const portalGroup = await open(c.support, {
      type: 'GROUP',
      userIds: [users.portalAlfa.id],
      name: 'Cantiere Alfa',
    });
    const caseId = await newCase(c.portalAlfa);
    const caseConv = await c.support.post(`/api/v1/cases/${caseId}/conversation`);
    assert.equal(caseConv.status, 201);
    const internalDiscussion = caseConv.body.conversation.id as string;
    for (const id of [direct, group, pub, priv, portalGroup, internalDiscussion]) {
      await say(c.support, id, `ciao ${id}`);
    }

    const ok = { conv: 200, list: 200 };
    const hidden = { conv: 404, list: 404 };
    const matrix: Array<[keyof CollabWorld['c'], Record<string, typeof ok>]> = [
      [
        'support',
        { direct: ok, group: ok, pub: ok, priv: ok, portalGroup: ok, internalDiscussion: ok },
      ],
      // Член на DIRECT; PUBLIC канал — без членство; дискусията по случай — с case:readAll.
      [
        'engineering',
        {
          direct: ok,
          group: hidden,
          pub: ok,
          priv: hidden,
          portalGroup: hidden,
          internalDiscussion: ok,
        },
      ],
      // Техникът е член на групата, вижда PUBLIC; няма case:readAll → без вътрешната дискусия.
      [
        'internal',
        {
          direct: hidden,
          group: ok,
          pub: ok,
          priv: hidden,
          portalGroup: hidden,
          internalDiscussion: hidden,
        },
      ],
      [
        'tenantAdmin',
        {
          direct: hidden,
          group: hidden,
          pub: ok,
          priv: hidden,
          portalGroup: hidden,
          internalDiscussion: ok,
        },
      ],
      // Порталът: само порталния разговор, в който е поканен. Никога канали и случая отвътре.
      [
        'portalAlfa',
        {
          direct: hidden,
          group: hidden,
          pub: hidden,
          priv: hidden,
          portalGroup: ok,
          internalDiscussion: hidden,
        },
      ],
      [
        'portalAlfa2',
        {
          direct: hidden,
          group: hidden,
          pub: hidden,
          priv: hidden,
          portalGroup: hidden,
          internalDiscussion: hidden,
        },
      ],
      [
        'portalBeta',
        {
          direct: hidden,
          group: hidden,
          pub: hidden,
          priv: hidden,
          portalGroup: hidden,
          internalDiscussion: hidden,
        },
      ],
      [
        'supportB',
        {
          direct: hidden,
          group: hidden,
          pub: hidden,
          priv: hidden,
          portalGroup: hidden,
          internalDiscussion: hidden,
        },
      ],
      [
        'portalB',
        {
          direct: hidden,
          group: hidden,
          pub: hidden,
          priv: hidden,
          portalGroup: hidden,
          internalDiscussion: hidden,
        },
      ],
    ];
    const ids: Record<string, string> = {
      direct,
      group,
      pub,
      priv,
      portalGroup,
      internalDiscussion,
    };
    for (const [who, expected] of matrix) {
      for (const [key, want] of Object.entries(expected)) {
        assert.deepEqual(await probe(c[who], ids[key] as string), want, `${who} → ${key}`);
      }
    }

    // Писане в чужд разговор — също 404, нищо не е записано.
    const before = await db.conversationMessage.count();
    for (const who of ['portalBeta', 'supportB', 'portalAlfa'] as const) {
      const res = await c[who].post(`/api/v1/conversations/${priv}/messages`, {
        text: 'intrusione',
      });
      assert.equal(res.status, 404, who);
    }
    assert.equal(await db.conversationMessage.count(), before);

    // Списъкът на портала съдържа само порталния разговор; публичните канали — празно.
    const portalList = await c.portalAlfa.get('/api/v1/conversations');
    assert.deepEqual(
      portalList.body.conversations.map((x: { id: string }) => x.id),
      [portalGroup],
    );
    assert.deepEqual(
      (await c.portalAlfa.get('/api/v1/conversations?scope=public')).body.conversations,
      [],
    );
    const browse = await c.internal.get('/api/v1/conversations?scope=public');
    assert.deepEqual(
      browse.body.conversations.map((x: { name: string }) => x.name),
      ['Generale'],
    );
  });

  test('порталът не създава разговори и не влиза в канали; друга фирма не влиза в портален разговор', async () => {
    const { c, users } = w;
    for (const body of [
      { type: 'DIRECT', userId: users.support.id },
      { type: 'GROUP', userIds: [users.support.id] },
      { type: 'CHANNEL', name: 'Portale' },
    ]) {
      assert.equal((await c.portalAlfa.post('/api/v1/conversations', body)).status, 403);
    }
    // Портален човек в канал — никога.
    const channel = await c.support.post('/api/v1/conversations', {
      type: 'CHANNEL',
      name: 'Generale',
      userIds: [users.portalAlfa.id],
    });
    assert.equal(channel.status, 422);
    assert.equal(channel.body.code, 'member_not_allowed');
    // Портални хора от две фирми в един разговор — отказ.
    const mixed = await c.support.post('/api/v1/conversations', {
      type: 'GROUP',
      userIds: [users.portalAlfa.id, users.portalBeta.id],
    });
    assert.equal(mixed.status, 422);

    const portalGroup = await open(c.support, { type: 'GROUP', userIds: [users.portalAlfa.id] });
    const conv = await db.conversation.findUniqueOrThrow({ where: { id: portalGroup } });
    assert.equal(conv.portal, true);
    // Вътрешен член НЕ добавя портален потребител от друга фирма; от същата — да.
    const cross = await c.support.post(`/api/v1/conversations/${portalGroup}/members`, {
      userIds: [users.portalBeta.id],
    });
    assert.equal(cross.status, 422);
    assert.equal(cross.body.code, 'member_not_allowed');
    const same = await c.support.post(`/api/v1/conversations/${portalGroup}/members`, {
      userIds: [users.portalAlfa2.id],
    });
    assert.equal(same.status, 200);
    // Фирмата остава и след като първият портален член е махнат (историята е на Alfa).
    await say(c.portalAlfa, portalGroup, 'messaggio da Alfa');
    assert.equal(
      (await del(c.support, `/api/v1/conversations/${portalGroup}/members/${users.portalAlfa.id}`))
        .status,
      204,
    );
    assert.equal(
      (await del(c.support, `/api/v1/conversations/${portalGroup}/members/${users.portalAlfa2.id}`))
        .status,
      204,
    );
    const later = await c.support.post(`/api/v1/conversations/${portalGroup}/members`, {
      userIds: [users.portalBeta.id],
    });
    assert.equal(later.status, 422);

    // Портален в вътрешна (portal=false) група — не: историята е вътрешна.
    const internalGroup = await open(c.support, { type: 'GROUP', userIds: [users.engineering.id] });
    const leak = await c.support.post(`/api/v1/conversations/${internalGroup}/members`, {
      userIds: [users.portalAlfa.id],
    });
    assert.equal(leak.status, 422);
  });

  test('друг клиент: потребител от B не се добавя (unknown_user); B не вижда нищо от A', async () => {
    const { c, users } = w;
    const res = await c.support.post('/api/v1/conversations', {
      type: 'DIRECT',
      userId: users.supportB.id,
    });
    assert.equal(res.status, 422);
    assert.equal(res.body.code, 'unknown_user');
    const group = await open(c.support, { type: 'GROUP', userIds: [users.engineering.id] });
    const add = await c.support.post(`/api/v1/conversations/${group}/members`, {
      userIds: [users.supportB.id],
    });
    assert.equal(add.status, 422);
    const listB = await c.supportB.get('/api/v1/conversations');
    assert.deepEqual(listB.body.conversations, []);
    const msg = await say(c.support, group, 'riservato A');
    for (const path of [`/api/v1/messages/${msg.id}`, `/api/v1/messages/${msg.id}/reactions`]) {
      assert.equal((await c.supportB.req('DELETE', path, { reaction: 'like' })).status, 404, path);
    }
    assert.equal((await c.supportB.patch(`/api/v1/messages/${msg.id}`, { text: 'x' })).status, 404);
  });

  test('дискусия по случай: само персонал с case:readAll; хронологията на портала не я издава', async () => {
    const { c } = w;
    const caseId = await newCase(c.portalAlfa);
    assert.equal((await c.portalAlfa.post(`/api/v1/cases/${caseId}/conversation`)).status, 403);
    assert.equal((await c.internal.post(`/api/v1/cases/${caseId}/conversation`)).status, 403);
    assert.equal((await c.supportB.post(`/api/v1/cases/${caseId}/conversation`)).status, 404);
    const first = await c.support.post(`/api/v1/cases/${caseId}/conversation`);
    assert.equal(first.status, 201);
    const again = await c.engineering.post(`/api/v1/cases/${caseId}/conversation`);
    assert.equal(again.status, 200);
    assert.equal(again.body.conversation.id, first.body.conversation.id);
    assert.equal(again.body.conversation.type, 'CASE');
    assert.equal(again.body.conversation.portal, false);
    const convId = first.body.conversation.id as string;
    const msg = await say(c.engineering, convId, 'verificare scheda');

    // FR-24: съобщението е в хронологията на случая — само идентификатори, без текст.
    const staffTimeline = await c.support.get(`/api/v1/cases/${caseId}/timeline`);
    const internal = staffTimeline.body.events.filter((e: { type: string }) =>
      e.type.startsWith('internal.'),
    );
    assert.deepEqual(
      internal.map((e: { type: string }) => e.type),
      ['internal.discussion_opened', 'internal.message'],
    );
    assert.equal(internal[1].payload.messageId, msg.id);
    assert.equal(JSON.stringify(staffTimeline.body).includes('verificare scheda'), false);
    const portalTimeline = await c.portalAlfa.get(`/api/v1/cases/${caseId}/timeline`);
    assert.equal(portalTimeline.status, 200);
    assert.equal(
      portalTimeline.body.events.some((e: { type: string }) => e.type.startsWith('internal.')),
      false,
    );
  });

  test('присъствие: само хора, с които делиш разговор; порталът вижда само персонала', async () => {
    const { c, users } = w;
    await open(c.support, { type: 'GROUP', userIds: [users.portalAlfa.id, users.portalAlfa2.id] });
    await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    for (const who of [
      'support',
      'engineering',
      'portalAlfa',
      'portalAlfa2',
      'internal',
    ] as const) {
      assert.equal(
        (await c[who].post('/api/v1/presence/heartbeat', { status: 'ONLINE' })).status,
        200,
      );
    }
    const all = [
      users.support.id,
      users.engineering.id,
      users.portalAlfa.id,
      users.portalAlfa2.id,
      users.internal.id,
      users.supportB.id,
    ].join(',');
    const seen = async (who: keyof CollabWorld['c']) =>
      (
        (await c[who].get(`/api/v1/presence?userIds=${all}`)).body.presence as Array<{
          userId: string;
        }>
      )
        .map((p) => p.userId)
        .sort();
    assert.deepEqual(
      await seen('support'),
      [users.support.id, users.engineering.id, users.portalAlfa.id, users.portalAlfa2.id].sort(),
    );
    // Порталът: персоналът в своя разговор и себе си — не колегата портален, не другите.
    assert.deepEqual(await seen('portalAlfa'), [users.support.id, users.portalAlfa.id].sort());
    assert.deepEqual(await seen('internal'), [users.internal.id]);
    // Друг клиент — само себе си (никой от A).
    assert.deepEqual(await seen('supportB'), [users.supportB.id]);

    // showLastSeen=false: статусът остава, „последно видян“ — не.
    assert.equal(
      (await c.support.patch('/api/v1/presence/me', { showLastSeen: false })).status,
      200,
    );
    const fromPortal = await c.portalAlfa.get(`/api/v1/presence?userIds=${users.support.id}`);
    assert.equal(fromPortal.body.presence[0].status, 'ONLINE');
    assert.equal(fromPortal.body.presence[0].lastSeenAt, null);
    const own = await c.support.get(`/api/v1/presence?userIds=${users.support.id}`);
    assert.notEqual(own.body.presence[0].lastSeenAt, null);

    // OFFLINE след 3 мин без heartbeat — изчислено при четене.
    await db.userPresence.update({
      where: { userId: users.engineering.id },
      data: { lastSeenAt: new Date(Date.now() - 4 * 60 * 1000) },
    });
    const stale = await c.support.get(`/api/v1/presence?userIds=${users.engineering.id}`);
    assert.equal(stale.body.presence[0].status, 'OFFLINE');
  });

  test('OWNER излиза: порталът не наследява правата — не трие, не кани, не маха персонала', async () => {
    const { c, users } = w;
    const id = await open(c.support, {
      type: 'GROUP',
      userIds: [users.portalAlfa.id, users.internal.id],
      name: 'Cantiere Alfa',
    });
    const staffMsg = await say(c.internal, id, 'verifica il quadro');
    // Порталният член е добавен преди вътрешния — по стария ред той щеше да наследи OWNER.
    assert.equal(
      (await del(c.support, `/api/v1/conversations/${id}/members/${users.support.id}`)).status,
      204,
    );
    const members = await db.conversationMember.findMany({
      where: { conversationId: id },
      select: { userId: true, role: true },
    });
    const roleOf = (userId: string) => members.find((m) => m.userId === userId)?.role;
    assert.equal(roleOf(users.portalAlfa.id), 'MEMBER');
    assert.equal(roleOf(users.internal.id), 'OWNER');

    // Дори стар ред да води портала OWNER — правата са само за персонала.
    await db.conversationMember.update({
      where: { conversationId_userId: { conversationId: id, userId: users.portalAlfa.id } },
      data: { role: 'OWNER' },
    });
    assert.equal((await del(c.portalAlfa, `/api/v1/messages/${staffMsg.id}`)).status, 403);
    const invite = await c.portalAlfa.post(`/api/v1/conversations/${id}/members`, {
      userIds: [users.engineering.id],
    });
    assert.equal(invite.status, 403);
    const kick = await del(
      c.portalAlfa,
      `/api/v1/conversations/${id}/members/${users.internal.id}`,
    );
    assert.equal(kick.status, 403);
  });

  test('операторът на платформата няма работно пространство', async () => {
    const { makeUser, signIn } = await import('./helpers.js');
    const platform = await makeUser({ tenantId: w.tenantA.id, role: 'PLATFORM_ADMIN' });
    const client = await signIn(h, platform);
    assert.equal((await client.get('/api/v1/conversations')).status, 403);
    assert.equal((await client.get('/api/v1/events')).status, 403);
    assert.equal((await client.get('/api/v1/notifications')).status, 403);
  });
});
