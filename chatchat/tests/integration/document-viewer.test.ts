import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { signDocumentSourceUrl } from '../../src/services/signed-url.js';
import { makePdf } from '../file-fixtures.js';
import { db, resetDb, startApp, type Client, type Harness } from './helpers.js';
import { FakeScanner, SpyStore, uploadPdf, URL_KEY } from './files.js';
import { EFFECTIVE_FROM, MODEL, seedWorld, type World } from './world.js';

/**
 * Визуализаторът на схеми (§9.2): оригиналният PDF на документа и метаданните за навигацията.
 * Правилата са като на текста на страницата — свой клиент, аудитория на ролята, PUBLISHED
 * (чернова само за kb:manage); адресът е подписан за ТОЗИ човек.
 */

let h: Harness;
let w: World;
const store = new SpyStore();
const scanner = new FakeScanner();
const pdf = makePdf([['Schema K1 X3:4 contattore'], ['Pagina due S12']]);

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
  h.model.reset();
  w = await seedWorld(h);
});

/** Документ от PDF; publish=false → остава чернова. */
async function pdfDoc(
  owner: Client,
  code: string,
  audience: 'PORTAL' | 'INTERNAL' | 'ENGINEERING',
  publish = true,
): Promise<string> {
  const up = await uploadPdf(owner, pdf, `${code}.pdf`);
  assert.equal(up.status, 201, JSON.stringify(up.body));
  const res = await owner.post('/api/v1/admin/documents', {
    code,
    title: `Schema ${code}`,
    type: 'SCHEMATIC',
    language: 'it',
    revision: 'A',
    audience,
    safetyRelevant: false,
    effectiveFrom: EFFECTIVE_FROM,
    applicability: [{ productModel: MODEL, allFirmware: true }],
    sourceAttachmentId: up.body.attachment.id,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const id = res.body.documentId as string;
  if (publish) {
    assert.equal((await owner.post(`/api/v1/admin/documents/${id}/submit`)).status, 204);
    assert.equal((await owner.post(`/api/v1/admin/documents/${id}/publish`)).status, 204);
  }
  return id;
}

async function open(c: Client, id: string) {
  const meta = await c.get(`/api/v1/documents/${id}/source`);
  if (meta.status !== 200) return { meta, file: null };
  const url = meta.body.source.url as string | undefined;
  return { meta, file: url ? await c.download(url) : null };
}

describe('оригиналният PDF на документа', () => {
  test('портален техник чете PORTAL документ: метаданни, подписан адрес, байтове и заглавки', async () => {
    const id = await pdfDoc(w.ownerA1, 'SCH-PORTAL', 'PORTAL');
    const { meta, file } = await open(w.portalAlfa, id);
    assert.equal(meta.status, 200);
    assert.equal(meta.body.source.available, true);
    assert.equal(meta.body.document.code, 'SCH-PORTAL');
    assert.deepEqual(meta.body.textPages, [1, 2]);
    assert.equal(meta.body.products[0].model, MODEL);
    assert.deepEqual(
      meta.body.revisions.map((r: { current: boolean }) => r.current),
      [true],
    );
    assert.ok(file);
    assert.equal(file.status, 200);
    assert.ok(file.bytes.equals(pdf));
    assert.equal(file.headers.get('content-type'), 'application/pdf');
    assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(file.headers.get('cache-control'), 'private, no-store');
    assert.equal(file.headers.get('content-security-policy'), 'sandbox');
    // Прегледът е одитиран (само id и размер) — и не се вижда от администратора на клиента.
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: 'document.source.view', objectId: id },
    });
    assert.equal(audit.actorId, w.users.portalAlfa.id);
    assert.deepEqual(Object.keys(audit.detail as object).sort(), ['attachmentId', 'sizeBytes']);
    const tenant = await w.tenantAdmin.get('/api/v1/audit?action=document.');
    assert.equal(tenant.status, 200);
    assert.equal(tenant.body.events.length, 0);
  });

  test('портал не чете ENGINEERING документ (нито метаданни, нито файл, нито текст)', async () => {
    const id = await pdfDoc(w.ownerA1, 'SCH-ENG', 'ENGINEERING');
    assert.equal((await w.portalAlfa.get(`/api/v1/documents/${id}/source`)).status, 404);
    assert.equal((await w.portalAlfa.get(`/api/v1/documents/${id}/pages/1`)).status, 404);
    // и с чужд подписан адрес — достъпът се проверява наново
    const url = signDocumentSourceUrl(URL_KEY, id, w.users.portalAlfa.id).url;
    assert.equal((await w.portalAlfa.download(url)).status, 404);
    // вътрешен (INTERNAL) също не стига до ENGINEERING; собственикът на знанието — да
    assert.equal((await w.internal.get(`/api/v1/documents/${id}/source`)).status, 404);
    assert.equal((await open(w.ownerA2, id)).file?.status, 200);
  });

  test('чужд клиент → 404', async () => {
    const id = await pdfDoc(w.ownerA1, 'SCH-A', 'PORTAL');
    assert.equal((await w.portalB.get(`/api/v1/documents/${id}/source`)).status, 404);
    assert.equal((await w.ownerB.get(`/api/v1/documents/${id}/source`)).status, 404);
    const url = signDocumentSourceUrl(URL_KEY, id, w.users.ownerB.id).url;
    assert.equal((await w.ownerB.download(url)).status, 404);
  });

  test('чернова: само kb:manage; останалите 404 (и текстът на страницата също)', async () => {
    const id = await pdfDoc(w.ownerA1, 'SCH-DRAFT', 'PORTAL', false);
    assert.equal((await w.portalAlfa.get(`/api/v1/documents/${id}/source`)).status, 404);
    assert.equal((await w.support.get(`/api/v1/documents/${id}/source`)).status, 404);
    assert.equal((await w.support.get(`/api/v1/documents/${id}/pages/1`)).status, 404);
    const own = await open(w.ownerA2, id);
    assert.equal(own.meta.body.document.status, 'DRAFT');
    assert.equal(own.file?.status, 200);
    // текстът на страницата остава само за публикуваното (договорът на /pages)
    assert.equal((await w.ownerA2.get(`/api/v1/documents/${id}/pages/1`)).status, 404);
  });

  test('подписан адрес на друг човек → 403; без подпис → 403; изтекъл → 403 link_expired', async () => {
    const id = await pdfDoc(w.ownerA1, 'SCH-SIG', 'PORTAL');
    const { meta } = await open(w.portalAlfa, id);
    const url = meta.body.source.url as string;
    assert.equal((await w.portalBeta.download(url)).status, 403);
    assert.equal((await w.support.download(url)).status, 403);
    assert.equal((await w.portalAlfa.download(url.replace(/sig=.{4}/, 'sig=AAAA'))).status, 403);
    assert.equal((await w.portalAlfa.download(url.split('?')[0] ?? '')).status, 403);
    const old = signDocumentSourceUrl(URL_KEY, id, w.users.portalAlfa.id, Date.now() - 600_000).url;
    const expired = await w.portalAlfa.download(old);
    assert.equal(expired.status, 403);
  });

  test('подписът за файл не отваря оригинала на документ (и обратно)', async () => {
    const id = await pdfDoc(w.ownerA1, 'SCH-DOM', 'PORTAL');
    const { meta } = await open(w.ownerA1, id);
    const query = (meta.body.source.url as string).split('?')[1];
    const att = await db.attachment.findFirstOrThrow({ where: { kind: 'DOCUMENT' } });
    // подпис за документ върху адрес на /files/:attachment
    assert.equal((await w.ownerA1.download(`/api/v1/files/${att.id}?${query}`)).status, 403);
  });

  test('документ, въведен като JSON (без оригинал): source.available=false, текстът работи', async () => {
    const id = w.docs.manFw4;
    const res = await w.portalAlfa.get(`/api/v1/documents/${id}/source`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.source, { available: false });
    assert.equal((await w.portalAlfa.get(`/api/v1/documents/${id}/pages/4`)).status, 200);
  });

  test('страницата връща парчета с id и componentRefs (за подчертаване)', async () => {
    const id = await pdfDoc(w.ownerA1, 'SCH-REF', 'PORTAL');
    const res = await w.support.get(`/api/v1/documents/${id}/pages/1`);
    assert.equal(res.status, 200);
    assert.ok(res.body.chunks[0].id);
    assert.ok(Array.isArray(res.body.chunks[0].componentRefs));
  });
});

describe('/vendor/pdfjs', () => {
  test('браузър билдът и работникът са от собствения домейн; source map-ове и wasm — не', async () => {
    const get = (path: string) => fetch(`${h.base}${path}`);
    const lib = await get('/vendor/pdfjs/build/pdf.min.mjs');
    assert.equal(lib.status, 200);
    assert.match(lib.headers.get('content-type') ?? '', /javascript/);
    assert.equal((await get('/vendor/pdfjs/build/pdf.worker.min.mjs')).status, 200);
    // Файлът СЪЩЕСТВУВА в legacy/build — 404 идва от отказа във vendor.ts, не от липса.
    assert.equal((await get('/vendor/pdfjs/build/pdf.mjs.map')).status, 404);
    assert.equal((await get('/vendor/pdfjs/wasm/openjpeg.wasm')).status, 404);
    assert.equal((await get('/vendor/pdfjs/wasm/openjpeg_nowasm_fallback.js')).status, 200);
    assert.equal((await get('/vendor/pdfjs/../package.json')).status, 404);
  });
});
