import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import { runRetention } from '../../src/services/retention.js';
import { EICAR, MAGIC, makePdf } from '../file-fixtures.js';
import { db, resetDb, startApp, type Harness } from './helpers.js';
import {
  cleanUpload,
  FakeScanner,
  signedUrl,
  SpyStore,
  uploadPdf,
  uploadTo,
  URL_KEY,
} from './files.js';
import { ask, docBody, newCase, seedWorld, type World } from './world.js';

/**
 * Прикачените файлове в потока: привързване към съобщение (в същата транзакция, не към AI),
 * PDF → документ в базата знания (§7.3 т. 2) и ретенцията (файлът преди реда).
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

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

describe('файлове към съобщение', () => {
  test('attachmentIds се привързват към човешкото съобщение; GET /cases/:id ги връща', async () => {
    const caseId = await newCase(w.portalAlfa);
    const photo = await cleanUpload(w.portalAlfa, caseId, 'PHOTO', MAGIC.jpeg, 'display.jpg');
    const log = await cleanUpload(w.portalAlfa, caseId, 'LOG', Buffer.from('E37;4.2\n'), 'l.txt');
    const res = await ask(w.portalAlfa, caseId, 'Display e log', {
      askAi: false,
      attachmentIds: [photo, log, photo],
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.message.attachments.length, 2);

    const view = await w.support.get(`/api/v1/cases/${caseId}`);
    const [message] = view.body.messages;
    assert.deepEqual(message.attachments, [
      { id: photo, kind: 'PHOTO', mime: 'image/jpeg', originalName: 'display.jpg' },
      { id: log, kind: 'LOG', mime: 'text/plain', originalName: 'l.txt' },
    ]);
    const timeline = await db.caseTimelineEvent.findFirstOrThrow({
      where: { caseId, type: 'message.created' },
    });
    assert.deepEqual((timeline.payload as { attachmentIds: string[] }).attachmentIds, [photo, log]);
  });

  test('чужд, вече привързан, заразен или от друг случай файл → 422 и нищо не е записано', async () => {
    const caseId = await newCase(w.portalAlfa);
    const other = await newCase(w.portalAlfa);
    const fromOther = await cleanUpload(w.portalAlfa, other, 'PHOTO', MAGIC.png);
    const bySupport = await cleanUpload(w.support, caseId, 'PHOTO', MAGIC.png);
    const infected = await uploadTo(w.portalAlfa, caseId, 'LOG', Buffer.from(EICAR, 'latin1'));
    const mine = await cleanUpload(w.portalAlfa, caseId, 'PHOTO', MAGIC.png);
    for (const id of [
      fromOther,
      bySupport,
      infected.body.attachment.id,
      'cnonexistent0000000000',
    ]) {
      const res = await ask(w.portalAlfa, caseId, 'Allegato', {
        askAi: false,
        attachmentIds: [id],
      });
      assert.equal(res.status, 422, id);
      assert.equal(res.body.code, 'invalid_attachment');
    }
    // Частично валиден списък също отменя цялото съобщение.
    const mixed = await ask(w.portalAlfa, caseId, 'Misto', {
      askAi: false,
      attachmentIds: [mine, fromOther],
    });
    assert.equal(mixed.status, 422);
    assert.equal(await db.caseMessage.count({ where: { caseId } }), 0);
    assert.equal(
      (await db.attachment.findUniqueOrThrow({ where: { id: mine } })).caseMessageId,
      null,
    );

    assert.equal(
      (await ask(w.portalAlfa, caseId, 'Ok', { askAi: false, attachmentIds: [mine] })).status,
      201,
    );
    const again = await ask(w.portalAlfa, caseId, 'Di nuovo', {
      askAi: false,
      attachmentIds: [mine],
    });
    assert.equal(again.status, 422, 'вече привързан');
    const six = Array.from({ length: 6 }, (_, i) => `c${i}`);
    assert.equal(
      (await ask(w.portalAlfa, caseId, 'Sei', { askAi: false, attachmentIds: six })).status,
      400,
    );
  });

  test('файловете НЕ стигат до AI: моделът вижда само текста', async () => {
    const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
    const id = await cleanUpload(
      w.portalAlfa,
      caseId,
      'LOG',
      Buffer.from('SEGRETO-LOG-123'),
      'z.log',
    );
    const res = await ask(w.portalAlfa, caseId, 'Errore E37 durante la corsa', {
      attachmentIds: [id],
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.answer);
    const seen = h.model.texts.join('\n');
    assert.equal(seen.includes(id), false);
    assert.equal(seen.includes('SEGRETO-LOG-123'), false);
    assert.equal(seen.includes('z.log'), false);
  });
});

describe('PDF → документ в базата знания', () => {
  const ZAFFIRO = 'Procedura ZAFFIRO: il codice E37 richiede la verifica del morsetto X3.';
  const pdf = makePdf([[ZAFFIRO, 'Secondo paragrafo della pagina uno.'], [], ['Pagina tre.']]);
  const { pages: _pages, sourceFilename: _name, ...meta } = docBody({ code: 'MAN-PDF', pages: [] });

  test('само kb:manage качва PDF; не-PDF → 415', async () => {
    assert.equal((await uploadPdf(w.portalAlfa, pdf)).status, 403);
    assert.equal((await uploadPdf(w.support, pdf)).status, 403);
    const png = await uploadPdf(w.ownerA1, MAGIC.png);
    assert.equal(png.status, 415);
    assert.equal(png.body.code, 'unsupported_type');
  });

  test('sourceAttachmentId → текст по страници; checksum = sha256 на PDF; името е от файла', async () => {
    const up = await uploadPdf(w.ownerA1, pdf, 'Manuale LTX-500 rev C.pdf');
    assert.equal(up.status, 201, JSON.stringify(up.body));
    assert.equal(up.body.attachment.kind, 'DOCUMENT');
    const res = await w.ownerA1.post('/api/v1/admin/documents', {
      ...meta,
      sourceAttachmentId: up.body.attachment.id,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.deepEqual(res.body.warnings, [{ code: 'ingest.pageWithoutText', page: 2 }]);

    const doc = await db.document.findUniqueOrThrow({
      where: { id: res.body.documentId },
      include: { chunks: { orderBy: { ordinal: 'asc' } } },
    });
    assert.equal(doc.checksum, sha256(pdf));
    assert.equal(doc.sourceFilename, 'Manuale LTX-500 rev C.pdf');
    assert.equal(doc.status, 'DRAFT');
    assert.deepEqual([...new Set(doc.chunks.map((c) => c.page))], [1, 3]);
    assert.ok(doc.chunks[0]?.text.startsWith(ZAFFIRO));

    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: 'kb.document.upload', objectId: doc.id },
    });
    assert.equal(
      (audit.detail as { sourceAttachmentId: string }).sourceAttachmentId,
      up.body.attachment.id,
    );

    // Публикуван — AI го намира като всеки друг документ.
    assert.equal((await w.ownerA1.post(`/api/v1/admin/documents/${doc.id}/submit`)).status, 204);
    assert.equal((await w.ownerA1.post(`/api/v1/admin/documents/${doc.id}/publish`)).status, 204);
    const caseId = await newCase(w.internal, { deviceSerial: 'SN-INT-1' });
    await ask(w.internal, caseId, 'Procedura ZAFFIRO per E37');
    assert.ok(h.model.packs.flat().some((p) => p.documentCode === 'MAN-PDF'));

    // Свалянето на оригинала е одитирано.
    const file = await w.ownerA2.download(await signedUrl(w.ownerA2, up.body.attachment.id));
    assert.equal(file.status, 200);
    assert.ok(file.bytes.equals(pdf));
    assert.match(file.headers.get('content-disposition') ?? '', /^attachment;/);
    assert.equal(await db.auditEvent.count({ where: { action: 'attachment.download' } }), 1);
  });

  test('грешни заявки: и двете/нито едно → 400; чужд/не-PDF → 422 invalid_attachment; повреден → pdf_unreadable', async () => {
    const id = (await uploadPdf(w.ownerA1, pdf)).body.attachment.id as string;
    const pages = [{ page: 1, text: 'x' }];
    const post = (c: typeof w.ownerA1, body: object) => c.post('/api/v1/admin/documents', body);
    assert.equal((await post(w.ownerA1, { ...meta, pages, sourceAttachmentId: id })).status, 400);
    assert.equal((await post(w.ownerA1, meta)).status, 400);
    assert.equal((await post(w.ownerA1, { ...meta, pages })).status, 400, 'без sourceFilename');
    const foreign = await post(w.ownerB, { ...meta, sourceAttachmentId: id });
    assert.equal(foreign.status, 422);
    assert.equal(foreign.body.code, 'invalid_attachment');
    const caseId = await newCase(w.ownerA1);
    const photo = await cleanUpload(w.ownerA1, caseId, 'PHOTO', MAGIC.png);
    assert.equal(
      (await post(w.ownerA1, { ...meta, sourceAttachmentId: photo })).body.code,
      'invalid_attachment',
    );
    const broken = (await uploadPdf(w.ownerA1, Buffer.from('%PDF-1.4\nrotto\n'))).body.attachment
      .id;
    const bad = await post(w.ownerA1, { ...meta, sourceAttachmentId: broken });
    assert.equal(bad.status, 422);
    assert.deepEqual(bad.body, {
      error: 'pdf_unreadable',
      code: 'pdf_unreadable',
      reason: 'invalid',
    });
    assert.equal(await db.document.count({ where: { code: 'MAN-PDF' } }), 0);
  });
});

describe('ретенция', () => {
  const DAY = 24 * 3600 * 1000;
  const age = (id: string, days: number) =>
    db.attachment.update({ where: { id }, data: { createdAt: new Date(Date.now() - days * DAY) } });

  test('файловете на изтрития случай — ПРЕДИ реда; сираци след 24 ч.; INFECTED след 7 дни', async () => {
    const closed = await newCase(w.portalAlfa);
    const bound = await cleanUpload(w.portalAlfa, closed, 'PHOTO', MAGIC.png);
    await ask(w.portalAlfa, closed, 'Foto', { askAi: false, attachmentIds: [bound] });
    await w.portalAlfa.post(`/api/v1/cases/${closed}/outcome`, { outcome: 'RESOLVED' });
    await db.case.update({
      where: { id: closed },
      data: { closedAt: new Date(Date.now() - 100 * DAY) },
    });

    const open = await newCase(w.portalAlfa);
    const orphan = await cleanUpload(w.portalAlfa, open, 'PHOTO', MAGIC.jpeg);
    const fresh = await cleanUpload(w.portalAlfa, open, 'PHOTO', MAGIC.jpeg);
    const infected = (await uploadTo(w.portalAlfa, open, 'LOG', Buffer.from(EICAR, 'latin1'))).body
      .attachment.id as string;
    const unusedPdf = (await uploadPdf(w.ownerA1, makePdf([['Uno']]))).body.attachment.id as string;
    const usedPdfBytes = makePdf([['Documento usato']]);
    const usedPdf = (await uploadPdf(w.ownerA1, usedPdfBytes)).body.attachment.id as string;
    const { pages: _p, sourceFilename: _s, ...meta } = docBody({ code: 'MAN-RET', pages: [] });
    assert.equal(
      (await w.ownerA1.post('/api/v1/admin/documents', { ...meta, sourceAttachmentId: usedPdf }))
        .status,
      201,
    );
    for (const id of [orphan, unusedPdf, usedPdf]) await age(id, 2);
    await age(infected, 8);
    const keyOf = async (id: string) =>
      (await db.attachment.findUniqueOrThrow({ where: { id } })).objectKey;
    const boundKey = await keyOf(bound);
    store.deletions.length = 0;

    const report = await runRetention(db, store, { sessionDays: 30, caseDays: 30 });
    assert.deepEqual(report, { sessions: 0, cases: 1, caseFiles: 1, orphans: 2, quarantined: 1 });
    assert.equal(await db.case.count({ where: { id: closed } }), 0);
    const left = (await db.attachment.findMany({ select: { id: true } })).map((a) => a.id).sort();
    assert.deepEqual(left, [fresh, usedPdf].sort());
    assert.deepEqual(
      [...store.files.keys()].sort(),
      [await keyOf(fresh), await keyOf(usedPdf)].sort(),
    );
    assert.deepEqual(
      store.deletions.find((d) => d.key === boundKey),
      { key: boundKey, rowExisted: true },
      'файлът на случая е изтрит, докато редът още е в базата',
    );
  });

  test('без хранилище и с файлове за триене → грешка; редовете остават', async () => {
    const caseId = await newCase(w.portalAlfa);
    const id = await cleanUpload(w.portalAlfa, caseId, 'PHOTO', MAGIC.png);
    await age(id, 2);
    await assert.rejects(runRetention(db, null, { sessionDays: 30, caseDays: null }));
    assert.equal(await db.attachment.count({ where: { id } }), 1);
  });
});
