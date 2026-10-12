import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { ScanVerdict } from '../../src/storage/antivirus.js';
import { isSealed } from '../../src/storage/envelope.js';
import { makePdf } from '../file-fixtures.js';
import { db, resetDb, startApp, type Harness } from './helpers.js';
import {
  cleanUpload,
  FakeScanner,
  signedUrl,
  SpyStore,
  TEST_KEYRING,
  uploadPdf,
  URL_KEY,
} from './files.js';
import { EFFECTIVE_FROM, MODEL, ask, newCase, seedWorld, type World } from './world.js';

/**
 * Файловете в покой (NFR-03, §15.1) през целия HTTP поток: в хранилището стои само шифротекст;
 * антивирусът вижда ОТКРИТИЯ текст при качването; свалянето и визуализаторът връщат оригинала
 * (sha256 на открития = `Attachment.sha256` / `Document.checksum`); подправен или преместен под
 * чужд ключ обект не се сервира. Преходът: стар нешифрован файл се чете (FILES_PLAINTEXT=allow).
 */

class RecordingScanner extends FakeScanner {
  readonly seen: Buffer[] = [];

  override async scan(bytes: Uint8Array): Promise<ScanVerdict> {
    this.seen.push(Buffer.from(bytes));
    return super.scan(bytes);
  }
}

let h: Harness;
let w: World;
const store = new SpyStore({ keyring: TEST_KEYRING, plaintext: 'allow' });
const scanner = new RecordingScanner();
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

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
  scanner.seen.length = 0;
  h.model.reset();
  w = await seedWorld(h);
});

const log = Buffer.from('10:01 E37 encoder\n10:02 segreto-di-prova\n');

async function boundLog(): Promise<{ id: string; key: string; caseId: string }> {
  const caseId = await newCase(w.portalAlfa);
  const id = await cleanUpload(w.portalAlfa, caseId, 'LOG', log, 'quadro.log');
  await ask(w.portalAlfa, caseId, 'Log del quadro', { askAi: false, attachmentIds: [id] });
  const row = await db.attachment.findUniqueOrThrow({ where: { id } });
  return { id, key: row.objectKey, caseId };
}

describe('шифровано в покой през API', () => {
  test('качване: антивирусът вижда открития текст, хранилището — шифротекст; свалянето — оригинала', async () => {
    const { id, key } = await boundLog();
    assert.deepEqual(scanner.seen.at(-1), log, 'clamd сканира открития текст');
    const stored = store.files.get(key);
    assert.ok(stored && isSealed(stored));
    assert.equal(stored.includes(Buffer.from('segreto-di-prova')), false);
    const row = await db.attachment.findUniqueOrThrow({ where: { id } });
    assert.equal(row.sha256, sha(log), 'sha256 е на оригинала, не на шифротекста');
    assert.equal(row.sizeBytes, log.length);

    const file = await w.portalAlfa.download(await signedUrl(w.portalAlfa, id));
    assert.equal(file.status, 200);
    assert.ok(file.bytes.equals(log));
    assert.equal(file.headers.get('content-length'), String(log.length));
  });

  test('PDF оригинал: шифрован в хранилището; checksum и визуализаторът — по открития текст', async () => {
    const pdf = makePdf([['Schema K1 X3:4 contattore']]);
    const up = await uploadPdf(w.ownerA1, pdf, 'SCH-ENC.pdf');
    assert.equal(up.status, 201, JSON.stringify(up.body));
    const row = await db.attachment.findUniqueOrThrow({ where: { id: up.body.attachment.id } });
    assert.ok(isSealed(store.files.get(row.objectKey) ?? Buffer.alloc(0)));
    const created = await w.ownerA1.post('/api/v1/admin/documents', {
      code: 'SCH-ENC',
      title: 'Schema cifrata',
      type: 'SCHEMATIC',
      language: 'it',
      revision: 'A',
      audience: 'PORTAL',
      safetyRelevant: false,
      effectiveFrom: EFFECTIVE_FROM,
      applicability: [{ productModel: MODEL, allFirmware: true }],
      sourceAttachmentId: row.id,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const docId = created.body.documentId as string;
    const doc = await db.document.findUniqueOrThrow({ where: { id: docId } });
    assert.equal(doc.checksum, sha(pdf), 'Document.checksum = sha256 на оригинала');
    assert.equal((await w.ownerA1.post(`/api/v1/admin/documents/${docId}/submit`)).status, 204);
    assert.equal((await w.ownerA1.post(`/api/v1/admin/documents/${docId}/publish`)).status, 204);

    const meta = await w.portalAlfa.get(`/api/v1/documents/${docId}/source`);
    assert.equal(meta.status, 200, JSON.stringify(meta.body));
    const file = await w.portalAlfa.download(meta.body.source.url as string);
    assert.equal(file.status, 200);
    assert.ok(file.bytes.equals(pdf), 'визуализаторът получава оригинала (sha256 сверен)');
  });

  test('подправен шифротекст или обект, преместен под чужд ключ → не се сервира', async () => {
    const a = await boundLog();
    const b = await boundLog();
    const tampered = Buffer.from(store.files.get(a.key) ?? Buffer.alloc(0));
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;
    store.files.set(a.key, tampered);
    const broken = await w.portalAlfa.download(await signedUrl(w.portalAlfa, a.id));
    assert.equal(broken.status, 500);
    assert.equal(broken.bytes.includes(Buffer.from('E37')), false);

    // Шифротекстът на b, сложен под ключа на a (размяна на диска) — опаковката е вързана към ключа.
    store.files.set(a.key, Buffer.from(store.files.get(b.key) ?? Buffer.alloc(0)));
    assert.equal((await w.portalAlfa.download(await signedUrl(w.portalAlfa, a.id))).status, 500);
    assert.equal((await w.portalAlfa.download(await signedUrl(w.portalAlfa, b.id))).status, 200);
  });

  test('преход: стар нешифрован файл (отпреди шифроването) се сваля непроменен', async () => {
    const { id, key } = await boundLog();
    store.files.set(key, Buffer.from(log));
    const file = await w.portalAlfa.download(await signedUrl(w.portalAlfa, id));
    assert.equal(file.status, 200);
    assert.ok(file.bytes.equals(log));
  });
});
