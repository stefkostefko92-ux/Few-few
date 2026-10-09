import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { signFileUrl } from '../../src/services/signed-url.js';
import { EICAR, MAGIC } from '../file-fixtures.js';
import { db, resetDb, startApp, type Harness } from './helpers.js';
import { cleanUpload, FakeScanner, signedUrl, SpyStore, uploadTo, URL_KEY } from './files.js';
import { ask, newCase, seedWorld, type World } from './world.js';

/**
 * Прикачени файлове през HTTP (FR-06, §13.3, §15): качване → тип по съдържание → антивирус →
 * подписан адрес → сваляне с повторна проверка на достъпа. Антивирусът е фалшив (EICAR →
 * INFECTED), хранилището — в паметта; базата е истинската.
 */

let h: Harness;
let w: World;
const store = new SpyStore();
const scanner = new FakeScanner();

before(async () => {
  h = await startApp({ attachments: { store, scanner, urlKey: URL_KEY } });
});
after(async () => {
  await h.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  store.reset();
  scanner.mode = 'auto';
  scanner.scanned = 0;
  h.model.reset();
  w = await seedWorld(h);
});

const email = ['mario.rossi', 'esempio.it'].join('@');

describe('качване и антивирус', () => {
  test('снимка към своя случай → 201 CLEAN; типът е по съдържанието; одитът е без името', async () => {
    const caseId = await newCase(w.portalAlfa);
    const res = await uploadTo(
      w.portalAlfa,
      caseId,
      'PHOTO',
      MAGIC.png,
      `../${email} quadro.pdf`,
      'application/pdf',
    );
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const a = res.body.attachment;
    assert.deepEqual(Object.keys(a).sort(), [
      'createdAt',
      'id',
      'kind',
      'mime',
      'originalName',
      'scanStatus',
      'sizeBytes',
    ]);
    assert.equal(a.kind, 'PHOTO');
    assert.equal(a.mime, 'image/png', 'по магическите байтове, не по .pdf/Content-Type');
    assert.equal(a.sizeBytes, MAGIC.png.length);
    assert.equal(a.scanStatus, 'CLEAN');
    assert.equal(a.originalName.includes(email), false);
    assert.equal(a.originalName.includes('/'), false);

    const row = await db.attachment.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(row.caseId, caseId);
    assert.ok(row.objectKey.startsWith(`${w.tenantA.id}/`));
    assert.ok(store.files.has(row.objectKey));

    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: 'attachment.upload' } });
    assert.equal(audit.objectId, a.id);
    assert.deepEqual(audit.detail, {
      kind: 'PHOTO',
      sizeBytes: MAGIC.png.length,
      scanStatus: 'CLEAN',
      caseId,
    });
    const timeline = await db.caseTimelineEvent.findFirst({
      where: { caseId, type: 'attachment.uploaded' },
    });
    assert.ok(timeline);
  });

  test('JSON лог с Content-Type application/json е файл (и над 64 KB), не заявка', async () => {
    const caseId = await newCase(w.portalAlfa);
    const big = JSON.stringify({ log: Array.from({ length: 8000 }, (_, i) => `E37 #${i}`) });
    assert.ok(big.length > 64 * 1024);
    const res = await uploadTo(
      w.portalAlfa,
      caseId,
      'LOG',
      Buffer.from(big),
      'log.json',
      'application/json',
    );
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.attachment.mime, 'application/json');
  });

  test('грешен формат → 415; над тавана → 413; празно/непознат вид → 400; нищо не е записано', async () => {
    const caseId = await newCase(w.portalAlfa);
    const send = (kind: 'PHOTO' | 'LOG', bytes: Buffer) =>
      uploadTo(w.portalAlfa, caseId, kind, bytes, 'x.jpg');
    assert.equal(
      (await send('PHOTO', Buffer.from('<svg onload=alert(1)>'))).body.code,
      'unsupported_type',
    );
    assert.equal((await send('LOG', MAGIC.exe)).status, 415);
    assert.equal((await send('LOG', MAGIC.png)).status, 415);
    const tooBig = await send('LOG', Buffer.alloc(2 * 1024 * 1024 + 1, 0x41));
    assert.equal(tooBig.status, 413);
    assert.equal(tooBig.body.code, 'payload_too_large');
    assert.equal((await send('LOG', Buffer.alloc(0))).status, 400);
    const doc = await w.portalAlfa.upload(
      `/api/v1/cases/${caseId}/attachments?kind=DOCUMENT`,
      MAGIC.png,
    );
    assert.equal(doc.status, 400);
    assert.equal(await db.attachment.count(), 0);
    assert.equal(store.files.size, 0);
    assert.equal(scanner.scanned, 0, 'отказаното не стига до антивируса');
  });

  test('EICAR → 422 attachment_infected: файлът е изтрит веднага, остават редът и одитът', async () => {
    const caseId = await newCase(w.portalAlfa);
    const res = await uploadTo(w.portalAlfa, caseId, 'LOG', Buffer.from(EICAR, 'latin1'), 'a.txt');
    assert.equal(res.status, 422);
    assert.equal(res.body.code, 'attachment_infected');
    assert.equal(res.body.attachment.scanStatus, 'INFECTED');
    assert.equal(store.files.size, 0);
    const row = await db.attachment.findUniqueOrThrow({ where: { id: res.body.attachment.id } });
    assert.equal(row.scanStatus, 'INFECTED');
    assert.ok(row.scannedAt);
    const infected = await db.auditEvent.findFirstOrThrow({
      where: { action: 'attachment.infected' },
    });
    assert.deepEqual(infected.detail, {
      kind: 'LOG',
      sizeBytes: EICAR.length,
      signature: 'Eicar-Test-Signature',
    });
    const url = await w.portalAlfa.get(`/api/v1/attachments/${row.id}/url`);
    assert.equal(url.status, 404);
  });

  test('антивирусът не потвърждава → 503 av_scan_failed; файлът е изтрит, редът е FAILED', async () => {
    const caseId = await newCase(w.portalAlfa);
    scanner.mode = 'failed';
    const res = await uploadTo(w.portalAlfa, caseId, 'PHOTO', MAGIC.jpeg);
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'av_scan_failed');
    assert.equal(res.body.attachment.scanStatus, 'FAILED');
    assert.equal(store.files.size, 0);
  });

  test('без антивирус → 503 av_unavailable; без хранилище → 503 attachments_unavailable', async () => {
    const noAv = await startApp({ attachments: { store, scanner: null, urlKey: URL_KEY } });
    const off = await startApp({ attachments: null });
    try {
      const caseId = await newCase(w.portalAlfa);
      for (const [app, code] of [
        [noAv, 'av_unavailable'],
        [off, 'attachments_unavailable'],
      ] as const) {
        const client = w.portalAlfa.withBase(app.base);
        const res = await uploadTo(client, caseId, 'PHOTO', MAGIC.png);
        assert.equal(res.status, 503);
        assert.equal(res.body.code, code);
      }
      assert.equal(await db.attachment.count(), 0);
    } finally {
      await noAv.close();
      await off.close();
    }
  });

  test('достъп: чужд случай → 404; затворен → 409; без CSRF → 403; без chat:ask → 403', async () => {
    const caseId = await newCase(w.portalAlfa);
    const up = (c: typeof w.portalAlfa, opts = {}) =>
      c.upload(`/api/v1/cases/${caseId}/attachments?kind=PHOTO`, MAGIC.png, 'image/png', opts);
    assert.equal((await up(w.portalBeta)).status, 404, 'друга фирма');
    assert.equal((await up(w.portalB)).status, 404, 'друг клиент');
    assert.equal((await up(w.tenantAdmin)).status, 403, 'само четене');
    const csrf = await up(w.portalAlfa, { csrf: null });
    assert.equal(csrf.status, 403);
    assert.equal(csrf.body.code, 'csrf');
    assert.equal((await up(w.support)).status, 201, 'поддръжката вижда всички случаи');
    await w.portalAlfa.post(`/api/v1/cases/${caseId}/outcome`, { outcome: 'RESOLVED' });
    const closed = await up(w.portalAlfa);
    assert.equal(closed.status, 409);
    assert.equal(closed.body.code, 'case_closed');
    assert.equal(await db.attachment.count(), 1);
  });

  test('лимит на качванията на потребител → 429', async () => {
    const caseId = await newCase(w.internal);
    for (let i = 0; i < 30; i += 1) {
      const res = await uploadTo(w.internal, caseId, 'LOG', Buffer.from(`riga ${i}`));
      assert.equal(res.status, 201);
    }
    const res = await uploadTo(w.internal, caseId, 'LOG', Buffer.from('troppo'));
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'too_many_requests');
  });
});

describe('сваляне: подписан адрес и повторна проверка на достъпа', () => {
  test('собственикът: адрес → файлът; nosniff, CSP sandbox, inline снимка, private no-store', async () => {
    const caseId = await newCase(w.portalAlfa);
    const photo = await cleanUpload(w.portalAlfa, caseId, 'PHOTO', MAGIC.png, 'quadro è.png');
    const res = await w.portalAlfa.get(`/api/v1/attachments/${photo}/url`);
    assert.equal(res.status, 200);
    assert.match(res.body.url, new RegExp(`^/api/v1/files/${photo}\\?exp=\\d+&sig=`));
    const expiresIn = new Date(res.body.expiresAt).getTime() - Date.now();
    assert.ok(expiresIn > 4 * 60 * 1000 && expiresIn <= 5 * 60 * 1000);

    const file = await w.portalAlfa.download(res.body.url);
    assert.equal(file.status, 200);
    assert.ok(file.bytes.equals(MAGIC.png));
    assert.equal(file.headers.get('content-type'), 'image/png');
    assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(file.headers.get('content-security-policy'), 'sandbox');
    assert.equal(file.headers.get('cache-control'), 'private, no-store');
    assert.match(
      file.headers.get('content-disposition') ?? '',
      /^inline; filename="quadro _\.png"/,
    );

    const log = await cleanUpload(w.portalAlfa, caseId, 'LOG', Buffer.from('E37 10:01\n'));
    const logFile = await w.portalAlfa.download(await signedUrl(w.portalAlfa, log));
    assert.equal(logFile.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.match(logFile.headers.get('content-disposition') ?? '', /^attachment;/);
  });

  test('чужд потребител с валиден подпис → 403; изтекъл → 403 link_expired; подправен → 403; без сесия → 401', async () => {
    const caseId = await newCase(w.portalAlfa);
    const id = await cleanUpload(w.portalAlfa, caseId, 'PHOTO', MAGIC.jpeg);
    await ask(w.portalAlfa, caseId, 'Foto del quadro', { askAi: false, attachmentIds: [id] });
    const url = await signedUrl(w.portalAlfa, id);

    const foreign = await w.support.download(url);
    assert.equal(foreign.status, 403, 'поддръжката вижда случая, но адресът не е неин');
    const expired = signFileUrl(URL_KEY, id, w.users.portalAlfa.id, Date.now() - 10 * 60 * 1000);
    const late = await w.portalAlfa.get(expired.url);
    assert.equal(late.status, 403);
    assert.equal(late.body.code, 'link_expired');
    const tampered = await w.portalAlfa.get(url.replace(/sig=.{4}/, 'sig=AAAA'));
    assert.equal(tampered.status, 403);
    assert.equal(tampered.body.code, 'forbidden');
    assert.equal((await w.portalAlfa.download(url, { cookie: false })).status, 401);
  });

  test('достъпът се проверява отново при свалянето: отнет достъп с валиден адрес → 404', async () => {
    const caseId = await newCase(w.portalAlfa);
    const id = await cleanUpload(w.portalAlfa, caseId, 'PHOTO', MAGIC.webp);
    // Непривързан файл вижда само качилият.
    assert.equal((await w.support.get(`/api/v1/attachments/${id}/url`)).status, 404);
    await ask(w.portalAlfa, caseId, 'Foto', { askAi: false, attachmentIds: [id] });
    assert.equal((await w.portalBeta.get(`/api/v1/attachments/${id}/url`)).status, 404);
    assert.equal((await w.portalB.get(`/api/v1/attachments/${id}/url`)).status, 404);

    const url = await signedUrl(w.support, id);
    assert.equal((await w.support.download(url)).status, 200);
    await db.user.update({
      where: { id: w.users.support.id },
      data: { role: 'PORTAL_TECHNICIAN', kind: 'PORTAL', companyId: w.beta.id },
    });
    assert.equal((await w.support.download(url)).status, 404, 'адресът е валиден, достъпът — не');
  });
});
