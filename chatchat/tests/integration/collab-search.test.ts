import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { Prisma } from '@prisma/client';
import {
  canAccessConversation,
  conversationAccessSql,
  type Viewer,
} from '../../src/services/collab/access.js';
import { db, startApp, type Harness } from './helpers.js';
import { del, open, resetCollab, say, seedCollab, type CollabWorld } from './collab-world.js';
import { ask, newCase } from './world.js';

/**
 * Търсене в историята (FR-16) и действията по съобщение (§12.1): само в достъпното (разговори +
 * случаи, по access.ts и caseWhereFor), AI отговор по аудитория, курсор, безопасен откъс,
 * „around“ за отваряне в контекст, „непрочетено“, „da fare“/„preferito“. Кръстосан достъп:
 * друг клиент, портал срещу персонал, нечлен, без `case:readAll`.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Hit = any;
const search = (c: CollabWorld['c'][keyof CollabWorld['c']], q: string, extra = '') =>
  c.get(`/api/v1/search/messages?q=${encodeURIComponent(q)}${extra}`);
const ids = (hits: Hit[]) => hits.map((r) => r.id).sort();
const text = (r: Hit) => r.snippet.map((p: { text: string }) => p.text).join('');

describe('търсене', () => {
  test('намира в разговорите и случаите; ударения/регистър/префикс; откъсът е части, не HTML', async () => {
    const { c, users } = w;
    const dm = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const m1 = await say(c.support, dm, 'Il quadro ha la Città <b>bloccata</b> su E370 da ieri');
    await say(c.support, dm, 'Niente a che vedere');
    const caseId = await newCase(w.c.portalAlfa);
    const asked = await ask(w.c.portalAlfa, caseId, 'Errore E370 ricorrente sul quadro', {
      askAi: false,
    });
    assert.equal(asked.status, 201, JSON.stringify(asked.body));

    const res = await search(c.support, 'citta e37');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(
      res.body.results.map((r: Hit) => r.source),
      ['conversation'],
    );
    const hit = res.body.results[0];
    assert.equal(hit.id, m1.id);
    assert.equal(hit.conversation.id, dm);
    assert.equal(hit.sender.name, 'Sara Supporto');
    // Подчертано: „Città“ (без ударение в заявката) и цялото „E370“ (префикс); HTML е текст.
    const marked = hit.snippet.filter((p: { match: boolean }) => p.match).map((p: Hit) => p.text);
    assert.deepEqual(marked, ['Città', 'E370']);
    assert.ok(text(hit).includes('<b>bloccata</b>'));

    // Случаят: поддръжката вижда всички случаи на клиента (case:readAll).
    const both = await search(c.support, 'E370');
    assert.deepEqual(
      both.body.results.map((r: Hit) => r.source),
      ['case', 'conversation'],
    );
    const caseHit = both.body.results[0];
    assert.equal(caseHit.caseId, caseId);
    assert.match(caseHit.caseNumber, /^CASE-/);
    // Порталният автор се вижда с името си от персонала; заявка без думи — 400.
    assert.equal((await search(c.support, '!!')).status, 400);
    assert.equal((await search(c.support, 'x')).status, 400);
  });

  test('операторите на tsquery от потребителя са текст, не синтаксис', async () => {
    const { c, users } = w;
    const dm = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    await say(c.support, dm, 'contattore K1 bruciato');
    for (const q of ['k1 | !bruciato', 'k1:* & !x', "'k1' <-> b", 'k1\\', '((k1']) {
      const res = await search(c.support, q);
      assert.ok([200, 400].includes(res.status), `${q} → ${res.status}`);
    }
    assert.equal((await search(c.support, 'k1 | bruciato')).body.results.length, 1);
  });

  test('само достъпното: друг клиент, нечлен на частен канал, портал, вътрешна дискусия', async () => {
    const { c, users } = w;
    const engChannel = await open(c.support, { type: 'CHANNEL', name: 'Engineering' });
    await say(c.support, engChannel, 'segreto turbina');
    const pub = await open(c.support, { type: 'CHANNEL', name: 'Generale', visibility: 'PUBLIC' });
    await say(c.support, pub, 'turbina pubblica');
    const portalDm = await open(c.support, { type: 'DIRECT', userId: users.portalAlfa.id });
    await say(c.support, portalDm, 'turbina per Paolo');
    const caseId = await newCase(w.c.portalAlfa);
    const disc = (await c.support.post(`/api/v1/cases/${caseId}/conversation`)).body.conversation
      .id as string;
    await say(c.support, disc, 'turbina interna del caso');
    const bDm = await open(c.supportB, { type: 'DIRECT', userId: users.portalB.id });
    await say(c.supportB, bDm, 'turbina altro cliente');

    const seen = async (who: keyof CollabWorld['c']) =>
      (await search(c[who], 'turbina')).body.results.map((r: Hit) => text(r)).sort();
    // Инженерингът: публичният канал (не е член, но е PUBLIC) + дискусията по случая.
    assert.deepEqual(await seen('engineering'), ['turbina interna del caso', 'turbina pubblica']);
    // Вътрешен техник: без `case:readAll` — без вътрешни дискусии; частният канал — не.
    assert.deepEqual(await seen('internal'), ['turbina pubblica']);
    // Порталът: само поканения портален DM; никога канали/дискусии; друга фирма — нищо.
    assert.deepEqual(await seen('portalAlfa'), ['turbina per Paolo']);
    assert.deepEqual(await seen('portalBeta'), []);
    assert.deepEqual(await seen('supportB'), ['turbina altro cliente']);
    // Изтрито — не се намира.
    const gone = await say(c.support, pub, 'turbina da cancellare');
    assert.equal((await del(c.support, `/api/v1/messages/${gone.id}`)).status, 204);
    assert.equal((await seen('engineering')).includes('turbina da cancellare'), false);
  });

  test('случаи: свои/възложени без case:readAll; AI отговор — само при покрити аудитории', async () => {
    const { c, users } = w;
    const alfaCase = await newCase(w.c.portalAlfa);
    await ask(w.c.portalAlfa, alfaCase, 'Inverter guasto', { askAi: false });
    const internalCase = await newCase(w.c.internal);
    await ask(w.c.internal, internalCase, 'Inverter rumoroso', { askAi: false });
    // AI отговор, търсен с вътрешни документи (INTERNAL) — в непортален случай.
    await db.caseMessage.create({
      data: {
        caseId: internalCase,
        kind: 'AI',
        body: 'Inverter: verificare il ventilatore (manuale interno)',
        audiences: ['PORTAL', 'INTERNAL', 'ENGINEERING'],
      },
    });
    const hits = async (who: keyof CollabWorld['c']) =>
      (await search(c[who], 'inverter')).body.results.map(
        (r: Hit) => r.caseId ?? r.conversation?.id,
      );
    // Порталът — само своя случай; другата фирма — нищо.
    assert.deepEqual(await hits('portalAlfa'), [alfaCase]);
    assert.deepEqual(await hits('portalBeta'), []);
    // Вътрешният техник — своя случай, но не AI отговора с ENGINEERING аудитория.
    const internal = (await search(c.internal, 'ventilatore')).body.results;
    assert.deepEqual(internal, []);
    assert.deepEqual(await hits('internal'), [internalCase]);
    // Инженерингът покрива и трите аудитории — вижда и AI отговора.
    const eng = (await search(c.engineering, 'ventilatore')).body.results;
    assert.equal(eng.length, 1);
    assert.equal(eng[0].kind, 'AI');
    // Администраторът на клиента (аудитория PORTAL) — не; другият клиент — не.
    assert.deepEqual((await search(c.tenantAdmin, 'ventilatore')).body.results, []);
    assert.deepEqual(await hits('supportB'), []);
    // Порталният техник вижда РОЛЯТА на служителя, не името (случаят е поет от поддръжката).
    await c.support.post(`/api/v1/cases/${alfaCase}/assign`);
    await db.caseMessage.create({
      data: { caseId: alfaCase, kind: 'HUMAN', authorId: users.support.id, body: 'Inverter ok' },
    });
    const portal = (await search(c.portalAlfa, 'inverter ok')).body.results[0];
    assert.equal(portal.authorName, null);
    assert.equal(portal.authorRole, 'SUPPORT');
  });

  test('курсор: най-новите първо, без дубли и пропуски', async () => {
    const { c, users } = w;
    const dm = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const sent: string[] = [];
    for (let i = 0; i < 7; i += 1) sent.push((await say(c.support, dm, `allarme ${i}`)).id);
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 5; guard += 1) {
      const extra: string = `&limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const page = await search(c.support, 'allarme', extra);
      assert.equal(page.status, 200);
      seen.push(...page.body.results.map((r: Hit) => r.id));
      cursor = page.body.nextCursor;
      if (!cursor) break;
    }
    assert.deepEqual(seen, [...sent].reverse());
    assert.equal((await search(c.support, 'allarme', '&cursor=xx')).status, 400);
  });

  test('паритет: conversationAccessSql = canAccessConversation за всеки зрител и разговор', async () => {
    const { c, users } = w;
    await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    await open(c.support, { type: 'GROUP', userIds: [users.portalAlfa.id, users.owner.id] });
    await open(c.support, { type: 'CHANNEL', name: 'Engineering' });
    await open(c.support, { type: 'CHANNEL', name: 'Generale', visibility: 'PUBLIC' });
    const caseId = await newCase(w.c.portalAlfa);
    await c.support.post(`/api/v1/cases/${caseId}/conversation`);
    await open(c.supportB, { type: 'DIRECT', userId: users.portalB.id });
    const all = await db.conversation.findMany({ include: { members: true } });
    for (const u of Object.values(users)) {
      const v: Viewer = u;
      const sql = (
        await db.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT c."id" FROM "Conversation" c WHERE ${conversationAccessSql(v)}`,
        )
      )
        .map((r) => r.id)
        .sort();
      const js = all
        .filter((conv) =>
          canAccessConversation(
            v,
            conv,
            conv.members.some((m) => m.userId === u.id),
          ),
        )
        .map((conv) => conv.id)
        .sort();
      assert.deepEqual(sql, js, u.name);
    }
  });
});

describe('действия по съобщение', () => {
  test('„around“: страница около старо съобщение; отговор → около корена', async () => {
    const { c, users } = w;
    const dm = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const all: string[] = [];
    for (let i = 0; i < 12; i += 1) all.push((await say(c.support, dm, `riga ${i}`)).id);
    const reply = await say(c.engineering, dm, 'risposta', { replyToId: all[3] });
    const page = await c.engineering.get(
      `/api/v1/conversations/${dm}/messages?around=${all[3]}&limit=4`,
    );
    assert.equal(page.status, 200, JSON.stringify(page.body));
    assert.deepEqual(
      page.body.messages.map((m: Hit) => m.id),
      all.slice(1, 5),
    );
    assert.equal(page.body.hasMore, true);
    assert.equal(page.body.hasNewer, true);
    assert.equal(page.body.anchorId, all[3]);
    const viaReply = await c.engineering.get(
      `/api/v1/conversations/${dm}/messages?around=${reply.id}&limit=4`,
    );
    assert.equal(viaReply.body.anchorId, all[3]);
    // Чужд разговор — 404; съобщение от друг разговор — 400.
    assert.equal(
      (await c.owner.get(`/api/v1/conversations/${dm}/messages?around=${all[3]}`)).status,
      404,
    );
  });

  test('„отбележи като непрочетено“: курсорът преди съобщението; само член; чуждо — 404', async () => {
    const { c, users } = w;
    const dm = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const a = await say(c.support, dm, 'uno');
    const b = await say(c.support, dm, 'due');
    await say(c.support, dm, 'tre');
    const list = await c.engineering.get(`/api/v1/conversations/${dm}/messages`);
    await c.engineering.post(`/api/v1/conversations/${dm}/read`, {
      messageId: list.body.messages.at(-1).id,
    });
    const res = await c.engineering.post(`/api/v1/messages/${b.id}/unread`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body, { unread: 2, lastReadMessageId: a.id });
    const first = await c.engineering.post(`/api/v1/messages/${a.id}/unread`);
    assert.deepEqual(first.body, { unread: 3, lastReadMessageId: null });
    const convs = await c.engineering.get('/api/v1/conversations');
    assert.equal(convs.body.conversations.find((x: Hit) => x.id === dm).unread, 3);
    assert.equal((await c.owner.post(`/api/v1/messages/${a.id}/unread`)).status, 404);
    assert.equal((await c.supportB.post(`/api/v1/messages/${a.id}/unread`)).status, 404);
  });

  test('„da fare“ и „preferito“: лични, в списъка само при достъп; изтрито изчезва', async () => {
    const { c, users } = w;
    const pub = await open(c.support, { type: 'CHANNEL', name: 'Generale', visibility: 'PUBLIC' });
    const m = await say(c.support, pub, 'controllare il freno');
    const put = await c.engineering.req('PUT', `/api/v1/messages/${m.id}/marks/todo`);
    assert.equal(put.status, 200, JSON.stringify(put.body));
    assert.deepEqual(put.body.marks, ['TODO']);
    await c.engineering.req('PUT', `/api/v1/messages/${m.id}/marks/starred`);
    const page = await c.engineering.get(`/api/v1/conversations/${pub}/messages`);
    assert.deepEqual(page.body.messages[0].marks, ['TODO', 'STARRED']);
    // Маркерите са лични: авторът не ги вижда.
    const own = await c.support.get(`/api/v1/conversations/${pub}/messages`);
    assert.deepEqual(own.body.messages[0].marks, []);

    const todo = await c.engineering.get('/api/v1/messages/marked?kind=TODO');
    assert.equal(todo.status, 200);
    assert.deepEqual(
      todo.body.items.map((x: Hit) => x.messageId),
      [m.id],
    );
    assert.equal(todo.body.items[0].preview, 'controllare il freno');
    assert.equal((await c.engineering.get('/api/v1/messages/marked?kind=NOPE')).status, 400);
    // Без достъп (другият клиент) — 404; портал към вътрешен канал — 404.
    assert.equal((await c.supportB.req('PUT', `/api/v1/messages/${m.id}/marks/todo`)).status, 404);
    assert.equal(
      (await c.portalAlfa.req('PUT', `/api/v1/messages/${m.id}/marks/todo`)).status,
      404,
    );

    // Каналът става частен → маркерът остава в базата, но не се показва.
    await db.conversation.update({ where: { id: pub }, data: { visibility: 'PRIVATE' } });
    assert.deepEqual((await c.engineering.get('/api/v1/messages/marked?kind=TODO')).body.items, []);
    await db.conversation.update({ where: { id: pub }, data: { visibility: 'PUBLIC' } });
    await del(c.support, `/api/v1/messages/${m.id}`);
    assert.deepEqual(
      (await c.engineering.get('/api/v1/messages/marked?kind=STARRED')).body.items,
      [],
    );
    assert.equal(
      (await c.engineering.req('PUT', `/api/v1/messages/${m.id}/marks/todo`)).status,
      409,
    );
    assert.equal(
      (await c.engineering.req('DELETE', `/api/v1/messages/${m.id}/marks/todo`)).status,
      200,
    );
    assert.equal(await db.messageMark.count({ where: { kind: 'TODO' } }), 0);
  });
});
