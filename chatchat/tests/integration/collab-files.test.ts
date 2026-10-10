import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import { verifyAuditChain } from '../../src/audit.js';
import { eraseSubject } from '../../src/services/subject.js';
import { runRetention } from '../../src/services/retention.js';
import { EICAR, MAGIC, makePdf } from '../file-fixtures.js';
import { FakeScanner, SpyStore, URL_KEY, signedUrl } from './files.js';
import { db, startApp, type Client, type Harness } from './helpers.js';
import { del, open, resetCollab, say, seedCollab, type CollabWorld } from './collab-world.js';
import { newCase } from './world.js';

/**
 * Прикачени файлове в разговорите (§12.1 „Allegati chat“, §14.1 POST …/messages „allegato“):
 * общият поток (магически байтове, антивирус, частно хранилище, подписан адрес) + правилата на
 * разговора — привързване само на свой CLEAN файл от същия разговор, достъп = достъпът до
 * разговора при всяко сваляне, изтрито съобщение/ретенция/GDPR → файлът преди реда.
 */

let h: Harness;
let w: CollabWorld;
const store = new SpyStore();
const scanner = new FakeScanner();

before(async () => {
  h = await startApp({ diagnose: 'none', attachments: { store, scanner, urlKey: URL_KEY } });
});
after(async () => {
  await h.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetCollab();
  store.reset();
  scanner.mode = 'auto';
  w = await seedCollab(h);
});

const upload = (c: Client, conv: string, kind: string, bytes: Uint8Array, name = 'f.bin') =>
  c.upload(
    `/api/v1/conversations/${conv}/attachments?kind=${kind}&name=${encodeURIComponent(name)}`,
    bytes,
  );

async function clean(c: Client, conv: string, kind: string, bytes: Uint8Array, name?: string) {
  const res = await upload(c, conv, kind, bytes, name);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.attachment.id as string;
}

const post = (c: Client, conv: string, body: Record<string, unknown>) =>
  c.post(`/api/v1/conversations/${conv}/messages`, { clientMessageId: randomUUID(), ...body });

async function download(c: Client, id: string) {
  const url = await signedUrl(c, id);
  return c.download(url);
}

describe('файлове в разговорите', () => {
  test('DM: качване → съобщение с файл → другият участник го сваля; нечлен и друг клиент — 404', async () => {
    const { c, users } = w;
    const dm = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const photo = await clean(c.support, dm, 'PHOTO', MAGIC.png, 'targa.png');
    const pdf = await clean(c.support, dm, 'DOCUMENT', makePdf([['Schema']]), 'schema.pdf');

    // Още непривързан: само качилият го вижда.
    assert.equal((await c.engineering.get(`/api/v1/attachments/${photo}/url`)).status, 404);
    assert.equal((await download(c.support, photo)).status, 200);

    const sent = await post(c.support, dm, { text: '', attachmentIds: [photo, pdf] });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    const files = sent.body.message.attachments;
    assert.deepEqual(
      files.map((f: { id: string; kind: string }) => [f.id, f.kind]),
      [
        [photo, 'PHOTO'],
        [pdf, 'DOCUMENT'],
      ],
    );
    assert.equal(JSON.stringify(sent.body).includes('objectKey'), false);
    const listed = await c.engineering.get(`/api/v1/conversations/${dm}/messages`);
    assert.equal(listed.body.messages[0].attachments.length, 2);

    const got = await download(c.engineering, photo);
    assert.equal(got.status, 200);
    assert.deepEqual(got.bytes, Buffer.from(MAGIC.png));
    assert.equal(got.headers.get('content-security-policy'), 'sandbox');
    assert.equal((await download(c.engineering, pdf)).status, 200);
    // PDF от разговор — без одит на четене (лична кореспонденция, не документ на знанието).
    assert.equal(await db.auditEvent.count({ where: { action: 'attachment.download' } }), 0);

    // Нечлен (персонал), портал, друг клиент — 404; подписан адрес на друг човек — 403.
    for (const other of [c.owner, c.portalAlfa, c.supportB]) {
      assert.equal((await other.get(`/api/v1/attachments/${photo}/url`)).status, 404);
    }
    const url = await signedUrl(c.engineering, photo);
    assert.equal((await c.owner.download(url)).status, 403);
    // Член, който напусне/бъде махнат, губи и файла (тук: групов разговор).
    const group = await open(c.support, {
      type: 'GROUP',
      userIds: [users.engineering.id, users.owner.id],
    });
    const g = await clean(c.support, group, 'LOG', Buffer.from('riga 1\nriga 2\n'));
    await post(c.support, group, { text: 'log', attachmentIds: [g] });
    assert.equal((await download(c.owner, g)).status, 200);
    await del(c.support, `/api/v1/conversations/${group}/members/${users.owner.id}`);
    assert.equal((await c.owner.get(`/api/v1/attachments/${g}/url`)).status, 404);
  });

  test('привързване: само свой, CLEAN, от същия разговор, непривързан; иначе 400 без съобщение', async () => {
    const { c, users } = w;
    const dm = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const other = await open(c.support, { type: 'DIRECT', userId: users.owner.id });
    const mine = await clean(c.support, dm, 'PHOTO', MAGIC.jpeg);
    const foreign = await clean(c.engineering, dm, 'PHOTO', MAGIC.jpeg);
    const elsewhere = await clean(c.support, other, 'PHOTO', MAGIC.jpeg);
    const infected = (await upload(c.support, dm, 'LOG', Buffer.from(EICAR, 'latin1'))).body
      .attachment.id as string;
    const before = await db.conversationMessage.count();
    for (const id of [foreign, elsewhere, infected, 'nope']) {
      const res = await post(c.support, dm, { text: 'x', attachmentIds: [mine, id] });
      assert.equal(res.status, 400, id);
      assert.equal(res.body.code, 'invalid_attachment');
    }
    assert.equal(await db.conversationMessage.count(), before);
    assert.equal(
      (await db.attachment.findUniqueOrThrow({ where: { id: mine } })).conversationMessageId,
      null,
    );
    // Вече привързан файл не се привързва втори път; празно съобщение без файл — 400.
    assert.equal((await post(c.support, dm, { text: 'ok', attachmentIds: [mine] })).status, 201);
    assert.equal(
      (await post(c.support, dm, { text: 'ancora', attachmentIds: [mine] })).status,
      400,
    );
    assert.equal((await post(c.support, dm, { text: '' })).status, 400);
    // Над 5 файла — 400 от схемата.
    const six = Array.from({ length: 6 }, () => mine);
    assert.equal((await post(c.support, dm, { text: 'x', attachmentIds: six })).status, 400);
  });

  test('качване: само с достъп до разговора; типът по съдържанието; без антивирус — 503', async () => {
    const { c, users } = w;
    const engChannel = await open(c.support, { type: 'CHANNEL', name: 'Engineering' });
    const pub = await open(c.support, { type: 'CHANNEL', name: 'Generale', visibility: 'PUBLIC' });
    assert.equal((await upload(c.owner, engChannel, 'PHOTO', MAGIC.png)).status, 404);
    assert.equal((await upload(c.supportB, pub, 'PHOTO', MAGIC.png)).status, 404);
    assert.equal((await upload(c.portalAlfa, pub, 'PHOTO', MAGIC.png)).status, 404);
    // PUBLIC канал: персоналът може да влезе сам → може и да качи.
    assert.equal((await upload(c.owner, pub, 'PHOTO', MAGIC.png)).status, 201);
    // .exe като „снимка“ / PDF като лог — 415; непознат вид — 400.
    assert.equal((await upload(c.support, pub, 'PHOTO', Buffer.from('MZ\x90\x00'))).status, 415);
    assert.equal((await upload(c.support, pub, 'LOG', makePdf([['x']]))).status, 415);
    assert.equal((await upload(c.support, pub, 'EXE', MAGIC.png)).status, 400);
    const portalDm = await open(c.support, { type: 'DIRECT', userId: users.portalAlfa.id });
    assert.equal((await upload(c.portalAlfa, portalDm, 'PHOTO', MAGIC.png)).status, 201);
    const noAv = await startApp({
      diagnose: 'none',
      attachments: { store, scanner: null, urlKey: URL_KEY },
    });
    try {
      const res = await upload(c.support.withBase(noAv.base), pub, 'PHOTO', MAGIC.png);
      assert.equal(res.status, 503);
      assert.equal(res.body.code, 'av_unavailable');
    } finally {
      await noAv.close();
    }
  });

  test('изтрито съобщение: файлът (първо) и редът изчезват; свалянето — 404', async () => {
    const { c, users } = w;
    const dm = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const id = await clean(c.support, dm, 'PHOTO', MAGIC.png);
    const m = (await post(c.support, dm, { text: 'foto', attachmentIds: [id] })).body.message;
    const url = await signedUrl(c.engineering, id);
    const key = (await db.attachment.findUniqueOrThrow({ where: { id } })).objectKey;
    assert.equal((await del(c.support, `/api/v1/messages/${m.id}`)).status, 204);
    assert.equal((await c.engineering.download(url)).status, 404);
    assert.equal(await db.attachment.count({ where: { id } }), 0);
    assert.deepEqual(
      store.deletions.find((d) => d.key === key),
      { key, rowExisted: true },
    );
    const view = (await c.engineering.get(`/api/v1/conversations/${dm}/messages`)).body.messages[0];
    assert.deepEqual(view.attachments, []);
  });

  test('ретенция: непривързан файл от разговор — сирак; файловете на изтеклите DM — преди реда', async () => {
    const { c, users } = w;
    const dm = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const loose = await clean(c.support, dm, 'DOCUMENT', makePdf([['bozza']]));
    const bound = await clean(c.support, dm, 'PHOTO', MAGIC.png);
    const old = (await post(c.support, dm, { text: 'vecchio', attachmentIds: [bound] })).body
      .message;
    const fresh = await say(c.support, dm, 'nuovo');
    const days = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000);
    await db.attachment.update({ where: { id: loose }, data: { createdAt: days(2) } });
    await db.conversationMessage.update({ where: { id: old.id }, data: { createdAt: days(40) } });
    const boundKey = (await db.attachment.findUniqueOrThrow({ where: { id: bound } })).objectKey;
    store.deletions.length = 0;

    const report = await runRetention(db, store, {
      sessionDays: 30,
      caseDays: null,
      directDays: 30,
    });
    assert.equal(report.orphans, 1);
    assert.deepEqual(report.messages.direct, { deleted: 1, tombstoned: 0, files: 1 });
    assert.equal(report.messages.group, null);
    assert.deepEqual(
      (await db.conversationMessage.findMany({ where: { conversationId: dm } })).map((m) => m.id),
      [fresh.id],
    );
    assert.equal(await db.attachment.count(), 0);
    assert.deepEqual(
      store.deletions.find((d) => d.key === boundKey),
      { key: boundKey, rowExisted: true },
    );
  });

  test('GDPR изтриване: личните файлове в разговори — да; файл от дискусия по случай — остава', async () => {
    const { c, users } = w;
    const dm = await open(c.support, { type: 'DIRECT', userId: users.engineering.id });
    const personal = await clean(c.engineering, dm, 'PHOTO', MAGIC.png);
    await post(c.engineering, dm, { text: 'foto', attachmentIds: [personal] });
    const caseId = await newCase(w.c.portalAlfa);
    const disc = (await c.engineering.post(`/api/v1/cases/${caseId}/conversation`)).body
      .conversation.id as string;
    const evidence = await clean(c.engineering, disc, 'PHOTO', MAGIC.jpeg);
    await post(c.engineering, disc, { text: 'prova', attachmentIds: [evidence] });

    const exported = await c.tenantAdmin.get(`/api/v1/admin/users/${users.engineering.id}/export`);
    assert.equal(exported.status, 200);
    assert.deepEqual(
      exported.body.attachments.map((a: { id: string }) => a.id).sort(),
      [personal, evidence].sort(),
    );
    const target = await db.user.findUniqueOrThrow({ where: { id: users.engineering.id } });
    await eraseSubject(db, users.tenantAdmin, target, 'richiesta art. 17', store);
    assert.equal(await db.attachment.count({ where: { id: personal } }), 0);
    assert.equal(await db.attachment.count({ where: { id: evidence } }), 1);
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: 'user.erase' } });
    assert.equal((audit.detail as { files: number }).files, 1);
    assert.equal(await verifyAuditChain(db), null);
  });
});
