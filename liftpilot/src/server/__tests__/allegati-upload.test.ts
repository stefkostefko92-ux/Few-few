// POST /api/projects/[id]/allegati end to end over an in-memory database and the real PDF tool (plan §6.1, §11.7): only
// from the application's own pages; the session, the right (a Commerciale and a read-only company cannot upload, a
// Tecnico can), the company's installation (another company's is «not found», an archived one refused); the body read
// with a byte counter whatever Content-Length says; the file recognised by its bytes (a renamed program, «%PDF» not at
// 0, a file cut short, a polyglot, two JPEG frames, a 50 MP header refused); a phone photo kept without its GPS; the
// same bytes once per installation; protected PDFs and XFA forms refused with their own answer; 60 files and 500 MiB,
// also for two uploads at the edge at the same time; the activity log without the file's name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { BASE, as, reset, seedFile, state } from './allegati-db';
import { JPEG, PERSONAL, cat, chunk, idat, ihdr, includes, PNG_SIGNATURE, pdf, phoneJpeg, segment, withSegments } from '../../lib/__tests__/allegati-fixtures';

const { POST } = await import('../../app/api/projects/[id]/allegati/route');
const { MAX_BODY_BYTES } = await import('../../lib/allegati/limits');

const OWN = { origin: BASE, host: 'liftpilot.example', 'sec-fetch-site': 'same-origin' };
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

function form(file: Uint8Array | null, name = 'documento.pdf', fields: Record<string, string> = { kind: 'DICHIARAZIONE_UE' }): FormData {
  const fd = new FormData();
  if (file) fd.set('file', new File([Buffer.from(file)], name, { type: 'application/octet-stream' }));
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}
async function upload(fd: FormData | null, opts: { id?: string; headers?: Record<string, string>; body?: BodyInit } = {}) {
  // a stream body needs duplex 'half' (not in the DOM's RequestInit type)
  const init = { method: 'POST', headers: { ...OWN, ...opts.headers }, body: opts.body ?? fd ?? undefined, duplex: 'half' } as RequestInit;
  const r = new Request(`${BASE}/api/projects/${opts.id ?? 'p1'}/allegati`, init);
  const res = await POST(r, { params: Promise.resolve({ id: opts.id ?? 'p1' }) });
  return { status: res.status, body: (await res.json()) as { ok: boolean; error?: string; duplicate?: boolean; attachment?: { id: string; pages: number; sha256: string; title: string; fileName: string; kind: string } }, cache: res.headers.get('cache-control') };
}

test('solo dalle pagine dell’applicazione: un altro sito, nessuna Origin, Origin diversa da PUBLIC_BASE_URL → 403, niente letto', async () => {
  reset();
  as('TECHNICIAN');
  const doc = await pdf(1);
  const tries: Record<string, string>[] = [{ origin: 'https://evil.example', host: 'liftpilot.example', 'sec-fetch-site': 'cross-site' }, { origin: '', host: 'liftpilot.example' },
    { origin: 'null', host: 'liftpilot.example' }, { origin: 'http://localhost:3000', host: 'localhost:3000', 'sec-fetch-site': 'same-origin' }];
  for (const headers of tries) {
    const r = await upload(form(doc), { headers });
    assert.deepEqual([r.status, r.body], [403, { ok: false, error: 'forbidden' }], JSON.stringify(headers));
  }
  assert.equal(state.files.length + state.audits.length, 0);
});

test('diritti: senza sessione 401; Commerciale e azienda in sola lettura 403; il Tecnico carica', async () => {
  reset();
  const doc = await pdf(1);
  assert.equal((await upload(form(doc))).status, 401);
  as('TECHNICIAN', { mustChangePassword: true });
  assert.equal((await upload(form(doc))).status, 401);
  as('SALES');
  assert.deepEqual((await upload(form(doc))).body, { ok: false, error: 'forbidden' });
  as('TECHNICIAN', { readOnly: true });
  assert.deepEqual((await upload(form(doc))).body, { ok: false, error: 'forbidden' });
  as('TECHNICIAN');
  const ok = await upload(form(doc, '../../../Dichiarazione\u0000 UE‮.pdf'));
  assert.equal(ok.status, 201);
  assert.equal(ok.cache, 'no-store');
  assert.equal(state.files.length, 1);
  const row = state.files[0];
  assert.ok(row);
  assert.deepEqual([row.companyId, row.projectId, row.createdById, row.mime, row.pages, row.kind, row.fileName, row.title], ['c1', 'p1', 'u-technician', 'application/pdf', 1, 'DICHIARAZIONE_UE', 'Dichiarazione UE .pdf', 'Dichiarazione UE']);
  assert.equal(row.sha256, sha(doc));
  // the activity log: ids, SHA, size and kind — never the file's name
  assert.deepEqual(state.audits, [{ companyId: 'c1', userId: 'u-technician', action: 'ATTACHMENT_UPLOADED', entity: 'Attachment', entityId: row.id, meta: { attachmentId: row.id, sha256: sha(doc), size: doc.length, kind: 'DICHIARAZIONE_UE' } }]);
  assert.ok(!JSON.stringify(state.audits).includes('Dichiarazione UE .pdf'));
});

test('l’impianto: di un’altra azienda o inesistente 404, archiviato 409, id malformato 404', async () => {
  reset();
  as('OWNER');
  const doc = await pdf(1);
  assert.deepEqual((await upload(form(doc), { id: 'pother' })).body, { ok: false, error: 'notFound' });
  assert.deepEqual((await upload(form(doc), { id: 'nessuno' })).body, { ok: false, error: 'notFound' });
  assert.deepEqual((await upload(form(doc), { id: '../p1' })).body, { ok: false, error: 'notFound' });
  const arch = await upload(form(doc), { id: 'parch' });
  assert.deepEqual([arch.status, arch.body], [409, { ok: false, error: 'archived' }]);
  assert.equal(state.files.length, 0);
});

test('dimensione: Content-Length oltre il limite → 413 senza leggere; un corpo più lungo di quanto dichiarato si ferma al limite', async () => {
  reset();
  as('OWNER');
  let pulled = 0;
  const never = new ReadableStream<Uint8Array>({ pull(c) { pulled++; c.enqueue(new Uint8Array(1024)); } });
  const declared = await upload(null, { body: never, headers: { 'content-length': String(MAX_BODY_BYTES + 1), 'content-type': 'multipart/form-data; boundary=x' } });
  assert.deepEqual([declared.status, declared.body], [413, { ok: false, error: 'fileTooLarge' }]);
  assert.ok(pulled <= 1, 'the body is not read');
  // 21 MiB sent with a Content-Length that says 1 KiB (or none): the counter stops it
  let sent = 0;
  const big = new ReadableStream<Uint8Array>({ pull(c) { if (sent > 22 << 20) c.close(); else { sent += 1 << 20; c.enqueue(new Uint8Array(1 << 20)); } } });
  const forged = await upload(null, { body: big, headers: { 'content-length': '1024', 'content-type': 'multipart/form-data; boundary=x' } });
  assert.deepEqual([forged.status, forged.body], [413, { ok: false, error: 'fileTooLarge' }]);
  assert.ok(sent <= MAX_BODY_BYTES + (2 << 20), `stopped near the limit (${sent} bytes pulled)`);
  // a file of 20 MiB + 1 byte in a body under the limit's envelope: refused as too large
  const over = new Uint8Array((20 << 20) + 1);
  over.set(Buffer.from('%PDF-1.7\n'), 0);
  assert.equal((await upload(form(over))).status, 413);
  assert.equal(state.files.length, 0);
});

test('modulo: non multipart, campi estranei, due file, tipo mancante → 400', async () => {
  reset();
  as('OWNER');
  const doc = await pdf(1);
  assert.deepEqual((await upload(null, { body: JSON.stringify({ file: 'x' }), headers: { 'content-type': 'application/json' } })).body, { ok: false, error: 'invalidFields' });
  const extra = form(doc);
  extra.set('companyId', 'c2');
  assert.equal((await upload(extra)).status, 400);
  const two = form(doc);
  two.append('file', new File([Buffer.from(doc)], 'b.pdf'));
  assert.equal((await upload(two)).status, 400);
  assert.equal((await upload(form(doc, 'a.pdf', {}))).status, 400);
  assert.equal((await upload(form(doc, 'a.pdf', { kind: 'FOTO', component: 'cantina' }))).status, 400);
  assert.equal(state.files.length, 0);
});

test('riconosciuto dai byte: programma rinominato, %PDF non a 0, troncato, poliglotta, due fotogrammi, PNG da 50 MP, vuoto → 415', async () => {
  reset();
  as('OWNER');
  const doc = await pdf(1);
  const sof = (() => { const at = Buffer.from(JPEG).indexOf(Buffer.from([0xff, 0xc0])); return JPEG.subarray(at, at + 19); })();
  const cases: [string, Uint8Array, string][] = [
    ['exe', Uint8Array.from(Buffer.from('MZ\x90\0\x03\0\0\0PE\0\0 program')), 'dichiarazione.pdf'],
    ['%PDF non a 0', cat(Uint8Array.from(Buffer.from('<html>')), doc), 'certificato.pdf'],
    ['troncato', doc.subarray(0, doc.length - 300), 'schema.pdf'],
    ['poliglotta', cat(doc, JPEG), 'foto.jpg'],
    ['due fotogrammi', withSegments(JPEG, sof), 'foto.jpg'],
    ['PNG 50 MP', cat(PNG_SIGNATURE, ihdr(10_000, 5_000), idat(1, 1), chunk('IEND', new Uint8Array(0))), 'foto.png'],
    ['vuoto', new Uint8Array(0), 'vuoto.pdf'],
  ];
  for (const [name, bytes, file] of cases) {
    const r = await upload(form(bytes, file));
    assert.deepEqual([r.status, r.body], [415, { ok: false, error: 'fileInvalid' }], name);
  }
  assert.equal(state.files.length, 0);
});

test('foto del telefono: conservata senza GPS né autore, orientamento nella riga, SHA della copia conservata; seconda volta = la stessa riga', async () => {
  reset();
  as('ENGINEER');
  const phone = phoneJpeg(6);
  const r = await upload(form(phone, 'IMG_2041.jpg', { kind: 'FOTO', component: 'argano', title: 'Targa della macchina' }));
  assert.equal(r.status, 201);
  const row = state.files[0];
  assert.ok(row);
  for (const v of Object.values(PERSONAL)) assert.ok(!includes(row.data, v), v);
  assert.deepEqual([row.mime, row.width, row.height, row.orientation, row.pages, row.component, row.title], ['image/jpeg', 24, 12, 6, 1, 'argano', 'Targa della macchina']);
  assert.equal(row.sha256, sha(row.data));
  assert.notEqual(row.sha256, sha(phone));
  assert.equal(r.body.attachment?.sha256, row.sha256);
  // the same photo again (its metadata differs only in what is removed): the row already there, nothing new, no log
  const again = await upload(form(phoneJpeg(6), 'copia.jpg', { kind: 'ALTRO' }));
  assert.deepEqual([again.status, again.body.duplicate, again.body.attachment?.id, again.body.attachment?.kind], [200, true, row.id, 'FOTO']);
  assert.equal(state.files.length, 1);
  assert.equal(state.audits.length, 1);
  // on another installation the same bytes are a new row
  assert.equal((await upload(form(phone, 'IMG_2041.jpg', { kind: 'FOTO' }), { id: 'p2' })).status, 201);
});

test('PDF protetti 422 pdfProtected; moduli XFA 422 pdfForm; 201 pagine 415; le pagine contate', async () => {
  reset();
  as('OWNER');
  const make = async (pages: number, build?: (d: PDFDocument) => void): Promise<Uint8Array> => {
    const d = await PDFDocument.create();
    for (let i = 0; i < pages; i++) d.addPage([595.28, 841.89]);
    build?.(d);
    return d.save();
  };
  const encrypted = await make(1, (d) => { d.context.trailerInfo.Encrypt = d.context.register(d.context.obj({ Filter: 'Standard', V: 1, R: 2, P: -4, O: PDFString.of('o'), U: PDFString.of('u') })); });
  assert.deepEqual(await upload(form(encrypted)).then((r) => [r.status, r.body]), [422, { ok: false, error: 'pdfProtected' }]);
  const xfa = await make(1, (d) => { d.catalog.set(PDFName.of('AcroForm'), d.context.obj({ Fields: [], XFA: [PDFString.of('template')] })); });
  assert.deepEqual(await upload(form(xfa)).then((r) => [r.status, r.body]), [422, { ok: false, error: 'pdfForm' }]);
  assert.deepEqual(await upload(form(await make(201))).then((r) => [r.status, r.body]), [415, { ok: false, error: 'fileInvalid' }]);
  const two = await upload(form(await make(2), 'libretto.pdf', { kind: 'LIBRETTO_VERBALE' }));
  assert.deepEqual([two.status, two.body.attachment?.pages, two.body.attachment?.title], [201, 2, 'libretto']);
  assert.equal(state.files.length, 1);
});

test('limiti: 60 file per impianto, 500 MiB per azienda; due caricamenti insieme al limite → uno solo passa (lock dell’azienda)', async () => {
  reset();
  as('OWNER');
  for (let i = 0; i < 60; i++) seedFile({ projectId: 'p1', size: 1000 });
  assert.deepEqual(await upload(form(await pdf(1))).then((r) => [r.status, r.body]), [409, { ok: false, error: 'quotaExceeded' }]);
  // the other installation is free, but the company has 500 MiB minus a few bytes in use
  reset();
  as('OWNER');
  seedFile({ projectId: 'p2', size: 500 * 1024 * 1024 - 100 });
  assert.deepEqual(await upload(form(await pdf(1))).then((r) => r.body), { ok: false, error: 'quotaExceeded' });
  // 59 files: two different files at once, both past the checks before the insert
  reset();
  as('OWNER');
  for (let i = 0; i < 59; i++) seedFile({ projectId: 'p1', size: 1000 });
  const [a, b] = await Promise.all([upload(form(await pdf(1), 'a.pdf')), upload(form(await pdf(2), 'b.pdf'))]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  assert.equal(state.files.filter((f) => f.projectId === 'p1').length, 60);
  // the lock is the first statement of the transaction, keyed by the company of the session
  const locks = state.raw.filter((x) => x.sql.includes('pg_advisory_xact_lock'));
  assert.equal(locks.length, 2);
  assert.deepEqual(locks.map((l) => l.values[1]), ['c1', 'c1']);
  // the company's edge in bytes, at once
  reset();
  as('OWNER');
  const one = await pdf(1), two = await pdf(2);
  seedFile({ projectId: 'p2', size: 500 * 1024 * 1024 - one.length - two.length + 1 });
  const [x, y] = await Promise.all([upload(form(one, 'x.pdf')), upload(form(two, 'y.pdf'))]);
  assert.deepEqual([x.status, y.status].sort(), [201, 409]);
});

test('JPEG con un segmento EXIF ma senza GPS: accettato, orientamento letto', async () => {
  reset();
  as('OWNER');
  const r = await upload(form(withSegments(JPEG, segment(0xe1, Uint8Array.from(Buffer.from('Exif\0\0MM\0\x2a\0\0\0\x08\0\0')))), 'x.jpg', { kind: 'FOTO' }));
  assert.equal(r.status, 201);
  assert.equal(state.files[0]?.orientation, null);
});

test('al massimo 4 caricamenti letti insieme: il quinto 503 (rendererBusy), poi di nuovo libero', async () => {
  reset();
  as('OWNER');
  const gates: (() => void)[] = [];
  const slow = () => new ReadableStream<Uint8Array>({ start(c) { gates.push(() => { c.enqueue(new Uint8Array(1)); c.close(); }); } });
  const hanging = Array.from({ length: 4 }, () => upload(null, { body: slow(), headers: { 'content-type': 'multipart/form-data; boundary=x' } }));
  await new Promise((r) => setTimeout(r, 20));
  const fifth = await upload(form(await pdf(1)));
  assert.deepEqual([fifth.status, fifth.body], [503, { ok: false, error: 'rendererBusy' }]);
  for (const g of gates) g();
  assert.deepEqual((await Promise.all(hanging)).map((d) => d.status), [400, 400, 400, 400]);
  assert.equal((await upload(form(await pdf(1)))).status, 201, 'the slots are free again');
});
