import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import { makePdf } from '../file-fixtures.js';
import { buildZip, makeDocx, makeXlsx, pngHeader } from '../ingest-fixtures.js';
import { db, resetDb, startApp, type Client, type Harness } from './helpers.js';
import { FakeScanner, URL_KEY } from './files.js';
import { cleanKb, FlakyStore, ingestRig, uploadKb } from './ingest-world.js';
import { EFFECTIVE_FROM, MODEL, seedWorld, type World } from './world.js';

/**
 * Пакетното приемане (§4.1, §7.3): общи метаданни + манифест, всички формати (PDF с текст,
 * сканиран PDF → OCR само на празната страница, DOCX, XLSX + ЧЕРНОВИ кодове от шаблона,
 * изображение → OCR, лог с маскирани лични данни) → документи-ЧЕРНОВИ с checksum = sha256 на
 * оригинала; провал на файл не спира пакета; повторен опит и dead-letter; достъп само kb:manage в
 * своя клиент; одит без съдържание.
 */

let h: Harness;
let w: World;
const store = new FlakyStore();
let rig: ReturnType<typeof ingestRig>;

before(async () => {
  rig = ingestRig(store);
  h = await startApp({
    attachments: { store, scanner: new FakeScanner(), urlKey: URL_KEY },
    ingest: { bus: rig.bus },
  });
});
after(async () => {
  await rig.bus.close();
  await h.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  store.reset();
  store.failReads = 0;
  rig.ocr.engine.missing = false;
  rig.ocr.rasterizer.failOn.clear();
  w = await seedWorld(h);
});

const defaults = {
  type: 'MANUAL',
  language: 'it',
  revision: 'A',
  audience: 'INTERNAL',
  safetyRelevant: false,
  effectiveFrom: EFFECTIVE_FROM,
  applicability: [{ productModel: MODEL, allFirmware: true }],
};

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

async function newBatch(c: Client, body: Record<string, unknown> = { defaults }) {
  const res = await c.post('/api/v1/admin/ingest/batches', body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.batch.id as string;
}

async function add(c: Client, batchId: string, attachmentId: string, extra = {}) {
  return c.post(`/api/v1/admin/ingest/batches/${batchId}/items`, { attachmentId, ...extra });
}

async function settle(c: Client, batchId: string) {
  await rig.bus.idle();
  const res = await c.get(`/api/v1/admin/ingest/batches/${batchId}`);
  assert.equal(res.status, 200);
  return res.body.batch as {
    counts: Record<string, number>;
    items: Array<{
      id: string;
      fileName: string;
      format: string;
      status: string;
      errorCode: string | null;
      warnings: Array<{ code: string; page?: number; row?: number }>;
      documentId: string | null;
      pages: number | null;
      ocrPages: number | null;
      errorCodes: number | null;
      canRetry: boolean;
    }>;
  };
}

const errorTemplate = () =>
  makeXlsx([
    {
      name: 'Codici',
      rows: [
        ['Codice', 'Titolo', 'Descrizione', 'Gravità', 'Controlli'],
        [
          'E91',
          'Sovratemperatura',
          'Temperatura del quadro oltre soglia',
          'guasto',
          'Verificare ventola',
        ],
        ['E92', 'Sottotensione', 'Tensione di rete bassa', 'avviso', ''],
        ['E93', 'Senza gravità', 'Riga incompleta', '', ''],
      ],
    },
  ]);

describe('пакет с всички формати', () => {
  test('PDF, сканиран PDF, DOCX, XLSX + кодове, изображение, лог → ЧЕРНОВИ; одит без съдържание', async () => {
    const owner = w.ownerA1;
    const files: Array<[string, Buffer]> = [
      [
        'manuale.pdf',
        makePdf([['Installazione del quadro LTX-500.'], ['Morsetto X3: catena sicurezze.']]),
      ],
      ['scansione.pdf', makePdf([['Pagina con testo.'], []])],
      [
        'guida.docx',
        makeDocx([
          { style: 'Titolo1', text: 'Messa in servizio' },
          { text: 'Relè K1 del quadro.' },
        ]),
      ],
      ['codici.xlsx', errorTemplate()],
      ['schema.png', Buffer.concat([pngHeader(1200, 800), Buffer.from('IDAT')])],
      ['quadro.log', Buffer.from('10:00 E37 porta\n10:01 tecnico mario.rossi@example.com\n')],
    ];
    const batchId = await newBatch(owner, { defaults, importErrorCodes: true });
    const ids = new Map<string, string>();
    for (const [name, bytes] of files) {
      const id = await cleanKb(owner, bytes, name);
      ids.set(name, id);
      const res = await add(owner, batchId, id);
      assert.equal(res.status, 202, `${name}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.item.status, 'QUEUED');
    }
    const batch = await settle(owner, batchId);
    assert.deepEqual(batch.counts, { QUEUED: 0, RUNNING: 0, DONE: 6, FAILED: 0 });
    const by = new Map(batch.items.map((i) => [i.fileName, i]));
    assert.deepEqual(
      files.map(([n]) => by.get(n)?.format),
      ['pdf', 'pdf', 'docx', 'xlsx', 'image', 'log'],
    );
    // Сканираният PDF: OCR само на страница 2 (истинският номер се пази).
    assert.equal(by.get('scansione.pdf')?.ocrPages, 1);
    assert.deepEqual(rig.ocr.rasterizer.rendered, [2]);
    // XLSX шаблон → 2 ЧЕРНОВИ кода; невалидният ред е предупреждение с номера си.
    const xlsx = by.get('codici.xlsx');
    assert.equal(xlsx?.errorCodes, 2);
    assert.deepEqual(xlsx?.warnings, [{ code: 'ingest.warn.errorRowInvalid', row: 4 }]);

    for (const [name, bytes] of files) {
      const item = by.get(name);
      assert.ok(item?.documentId, name);
      const doc = await db.document.findUniqueOrThrow({
        where: { id: item.documentId },
        include: { chunks: true },
      });
      assert.equal(doc.status, 'DRAFT', `${name}: ново приемане = ЧЕРНОВА`);
      assert.equal(doc.checksum, sha(bytes), `${name}: checksum = sha256 на оригинала`);
      assert.equal(doc.sourceFilename, name);
      assert.equal(doc.uploadedById, w.users.ownerA1.id);
      assert.ok(doc.chunks.length > 0);
    }
    const scanned = await db.documentChunk.findMany({
      where: { documentId: by.get('scansione.pdf')?.documentId ?? '' },
      orderBy: { page: 'asc' },
    });
    assert.deepEqual(
      scanned.map((c) => c.page),
      [1, 2],
    );
    assert.match(scanned[1]?.text ?? '', /Pagina scansionata 2/);
    const log = await db.documentChunk.findMany({
      where: { documentId: by.get('quadro.log')?.documentId ?? '' },
    });
    const logText = log.map((c) => c.text).join('\n');
    assert.match(logText, /\[email\]/);
    assert.doesNotMatch(logText, /mario\.rossi/);

    const codes = await db.errorCode.findMany({
      where: { tenantId: w.tenantA.id, code: { in: ['E91', 'E92', 'E93'] } },
      include: { relations: true },
      orderBy: { code: 'asc' },
    });
    assert.deepEqual(
      codes.map((c) => [c.code, c.status, c.severity, c.sourceDocumentId]),
      [
        ['E91', 'DRAFT', 'FAULT', by.get('codici.xlsx')?.documentId],
        ['E92', 'DRAFT', 'WARNING', by.get('codici.xlsx')?.documentId],
      ],
    );
    assert.deepEqual(codes[0]?.authorIds, [w.users.ownerA1.id], 'четирите очи: качилият е автор');
    // ЧЕРНОВИТЕ кодове не стигат до справката/AI.
    const lookup = await w.internal.get(`/api/v1/errors/E91?model=${MODEL}&fw=4.2`);
    assert.deepEqual(lookup.body.errors ?? [], []);

    // Одитът: пакет, файл в опашката, документ (с id на файла) и всеки код — без съдържание.
    const audit = await db.auditEvent.findMany({
      where: { tenantId: w.tenantA.id, action: { startsWith: 'kb.' } },
      orderBy: { id: 'asc' },
    });
    const actions = audit.map((a) => a.action);
    assert.equal(actions.filter((a) => a === 'kb.ingest.batch').length, 1);
    assert.equal(actions.filter((a) => a === 'kb.ingest.enqueue').length, 6);
    const uploads = audit.filter(
      (a) =>
        a.action === 'kb.document.upload' && (a.detail as { ingestItemId?: string }).ingestItemId,
    );
    assert.equal(uploads.length, 6);
    assert.equal(
      audit.filter(
        (a) =>
          a.action === 'kb.error.create' && (a.detail as { importedFrom?: string }).importedFrom,
      ).length,
      2,
    );
    const blob = JSON.stringify(audit.map((a) => a.detail));
    assert.doesNotMatch(blob, /mario|Installazione|manuale\.pdf/);
  });
});

describe('провал по файл не спира пакета', () => {
  test('бомба, повреден DOCX, дублирана ревизия → FAILED с код; останалите → DONE', async () => {
    const owner = w.ownerA1;
    const batchId = await newBatch(owner);
    const bomb = buildZip([
      { name: '[Content_Types].xml', data: '<Types/>' },
      { name: 'word/document.xml', data: Buffer.alloc(3_000_000), declaredSize: 100 },
    ]);
    // DOCX по имената в централната директория, но document.xml е боклук → не се разчита.
    const broken = buildZip([
      { name: '[Content_Types].xml', data: '<Types/>' },
      { name: 'word/document.xml', data: '<w:document><w:body><w:p>' },
    ]);
    const ok = makePdf([['Testo valido.']]);
    const bombId = await cleanKb(owner, bomb, 'bomba.docx');
    const brokenId = await cleanKb(owner, broken, 'rotto.docx');
    const okId = await cleanKb(owner, ok, 'buono.pdf');
    const dupId = await cleanKb(owner, makePdf([['Altro.']]), 'doppio.pdf');
    assert.equal((await add(owner, batchId, bombId)).status, 202);
    assert.equal((await add(owner, batchId, brokenId)).status, 202);
    assert.equal((await add(owner, batchId, okId, { code: 'DOC-OK' })).status, 202);
    assert.equal((await add(owner, batchId, dupId, { code: 'DOC-OK' })).status, 202);
    // Невалидни метаданни → 400 веднага (файлът не влиза в опашката).
    const bad = await add(owner, batchId, okId, { revision: 'x'.repeat(30) });
    assert.equal(bad.status, 400);
    const batch = await settle(owner, batchId);
    const by = new Map(batch.items.map((i) => [i.fileName, i]));
    const outcome = (n: string) => [by.get(n)?.status, by.get(n)?.errorCode];
    assert.deepEqual(['bomba.docx', 'rotto.docx'].map(outcome), [
      ['FAILED', 'ingest.err.archiveBomb'],
      ['FAILED', 'ingest.err.archiveInvalid'],
    ]);
    // Двата файла със същата ревизия вървят паралелно (concurrency 2) — кой ще е първи, решава
    // опашката; важното е: точно един документ, другият файл — FAILED с дублирана ревизия.
    assert.deepEqual(
      ['buono.pdf', 'doppio.pdf']
        .map(outcome)
        .sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
      [
        ['DONE', null],
        ['FAILED', 'ingest.err.duplicateRevision'],
      ],
    );
    const fails = await db.auditEvent.findMany({ where: { action: 'kb.ingest.fail' } });
    assert.equal(fails.length, 3);
  });

  test('манифест (CSV): метаданни по файл; непознат продукт → FAILED; невалиден манифест → 400', async () => {
    const owner = w.ownerA1;
    const badManifest = await owner.post('/api/v1/admin/ingest/batches', {
      defaults,
      manifest: { format: 'csv', text: 'file,code\n,X\n' },
    });
    assert.deepEqual([badManifest.status, badManifest.body.code], [400, 'invalid_manifest']);
    const batchId = await newBatch(owner, {
      defaults,
      manifest: {
        format: 'csv',
        text: 'file;code;revision;type;productModel\nuno.pdf;MAN-UNO;C;PROCEDURE;LTX-500\ndue.pdf;MAN-DUE;A;MANUAL;NON-ESISTE\n',
      },
    });
    const uno = await cleanKb(owner, makePdf([['Procedura uno.']]), 'uno.pdf');
    const due = await cleanKb(owner, makePdf([['Manuale due.']]), 'due.pdf');
    await add(owner, batchId, uno);
    await add(owner, batchId, due);
    const batch = await settle(owner, batchId);
    const by = new Map(batch.items.map((i) => [i.fileName, i]));
    const doc = await db.document.findUniqueOrThrow({
      where: { id: by.get('uno.pdf')?.documentId ?? '' },
    });
    assert.deepEqual([doc.code, doc.revision, doc.type], ['MAN-UNO', 'C', 'PROCEDURE']);
    assert.deepEqual(
      [by.get('due.pdf')?.status, by.get('due.pdf')?.errorCode],
      ['FAILED', 'ingest.err.unknownProduct'],
    );
  });
});

describe('повторен опит и dead-letter', () => {
  test('OCR липсва → FAILED; след поправка „Повтори“ → DONE (нов id на задачата)', async () => {
    const owner = w.ownerA1;
    rig.ocr.engine.missing = true;
    const batchId = await newBatch(owner);
    const img = await cleanKb(
      owner,
      Buffer.concat([pngHeader(640, 480), Buffer.from('x')]),
      'foto.png',
    );
    await add(owner, batchId, img);
    let batch = await settle(owner, batchId);
    const item = batch.items[0];
    assert.deepEqual(
      [item?.status, item?.errorCode, item?.canRetry],
      ['FAILED', 'ingest.err.ocrUnavailable', true],
    );
    rig.ocr.engine.missing = false;
    const retry = await owner.post(`/api/v1/admin/ingest/items/${item?.id}/retry`);
    assert.equal(retry.status, 202);
    batch = await settle(owner, batchId);
    assert.equal(batch.items[0]?.status, 'DONE');
    const again = await owner.post(`/api/v1/admin/ingest/items/${item?.id}/retry`);
    assert.deepEqual([again.status, again.body.code], [409, 'invalid_transition']);
  });

  test('заседнал файл (изгубена задача) се пуска наново след 30 мин.; по-рано — 409', async () => {
    const owner = w.ownerA1;
    const batchId = await newBatch(owner);
    const id = await cleanKb(owner, makePdf([['Persa.']]), 'persa.pdf');
    const created = await db.ingestItem.create({
      data: {
        tenantId: w.tenantA.id,
        batchId,
        attachmentId: id,
        fileName: 'persa.pdf',
        format: 'pdf',
        meta: { ...defaults, code: 'DOC-PERSA', title: 'Persa' },
      },
    });
    const early = await owner.post(`/api/v1/admin/ingest/items/${created.id}/retry`);
    assert.deepEqual([early.status, early.body.code], [409, 'invalid_transition']);
    await db.$executeRaw`UPDATE "IngestItem" SET "updatedAt" = now() - interval '31 minutes' WHERE id = ${created.id}`;
    const view = await owner.get(`/api/v1/admin/ingest/batches/${batchId}`);
    assert.equal(view.body.batch.items[0].canRetry, true);
    assert.equal((await owner.post(`/api/v1/admin/ingest/items/${created.id}/retry`)).status, 202);
    const batch = await settle(owner, batchId);
    assert.equal(batch.items[0]?.status, 'DONE');
  });

  test('временна грешка на хранилището: опит → повтор → успех; изчерпани опити → dead-letter', async () => {
    const owner = w.ownerA1;
    const batchId = await newBatch(owner);
    const a = await cleanKb(owner, makePdf([['Uno.']]), 'a.pdf');
    store.failReads = 1;
    const added = await add(owner, batchId, a, { code: 'DOC-A' });
    assert.equal(added.status, 202, JSON.stringify(added.body));
    let batch = await settle(owner, batchId);
    assert.equal(batch.items[0]?.status, 'DONE', 'вторият опит минава');
    const b = await cleanKb(owner, makePdf([['Due.']]), 'b.pdf');
    store.failReads = 10;
    await add(owner, batchId, b, { code: 'DOC-B' });
    batch = await settle(owner, batchId);
    const dead = batch.items.find((i) => i.fileName === 'b.pdf');
    assert.deepEqual([dead?.status, dead?.errorCode], ['FAILED', 'ingest.err.internal']);
  });
});

describe('достъп', () => {
  test('друг клиент — 404/422; портал и персонал без kb:manage — 403; без сесия — 401; без CSRF — 403', async () => {
    const owner = w.ownerA1;
    const batchId = await newBatch(owner);
    const fileId = await cleanKb(owner, makePdf([['x']]), 'x.pdf');
    const foreign = await w.ownerB.get(`/api/v1/admin/ingest/batches/${batchId}`);
    assert.equal(foreign.status, 404);
    const foreignBatch = await newBatch(w.ownerB);
    const steal = await add(w.ownerB, foreignBatch, fileId);
    assert.deepEqual([steal.status, steal.body.code], [422, 'invalid_attachment']);
    const intoForeign = await add(owner, foreignBatch, fileId);
    assert.equal(intoForeign.status, 404);
    for (const c of [w.portalAlfa, w.support, w.tenantAdmin]) {
      assert.equal((await c.post('/api/v1/admin/ingest/batches', { defaults })).status, 403);
      assert.equal((await c.get(`/api/v1/admin/ingest/batches/${batchId}`)).status, 403);
    }
    const anon = await owner.post('/api/v1/admin/ingest/batches', { defaults }, { cookie: false });
    assert.equal(anon.status, 401);
    const noCsrf = await owner.post('/api/v1/admin/ingest/batches', { defaults }, { csrf: null });
    assert.equal(noCsrf.status, 403);
    const list = await w.ownerB.get('/api/v1/admin/ingest/batches');
    assert.deepEqual(
      list.body.batches.map((b: { id: string }) => b.id),
      [foreignBatch],
    );
  });

  test('качването за базата знания: DOCX/XLSX/PNG/лог — да; макроси — 415; DOCX в разговор — 415', async () => {
    const owner = w.ownerA1;
    for (const [name, bytes, mime] of [
      ['a.docx', makeDocx([{ text: 'a' }]), 'wordprocessingml'],
      ['a.xlsx', makeXlsx([{ name: 'S', rows: [['x']] }]), 'spreadsheetml'],
      ['a.png', pngHeader(10, 10), 'image/png'],
      ['a.csv', Buffer.from('a;b\n1;2\n'), 'text/csv'],
    ] as const) {
      const res = await uploadKb(owner, bytes, name);
      assert.equal(res.status, 201, name);
      assert.match(res.body.attachment.mime, new RegExp(mime));
    }
    const docm = makeDocx([{ text: 'a' }], [{ name: 'word/vbaProject.bin', data: 'MZ' }]);
    const macro = await uploadKb(owner, docm, 'a.docm');
    assert.deepEqual([macro.status, macro.body.code], [415, 'unsupported_type']);
  });
});
