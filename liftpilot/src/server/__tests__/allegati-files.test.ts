// The uploaded files after the upload (plan §6.1, §8, §11.7): the download — every role, a read-only company too, only
// as an attachment that may do nothing in a browser (sandbox CSP, nosniff, private, no-store), named by the title and
// the SHA, another company's file «not found», 60 per 10 minutes —; the edit of title, kind and section only; the
// deletion refused while an issued relazione lists the file (the deferred foreign key made immediate first); edits and
// deletions only for whoever edits the installation, never on an archived one; the activity log by id and SHA. The
// limits in one place equal the PDF tool's, the RT's and the database's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { as, reset, seedFile, state } from './allegati-db';
import it from '../../../messages/it.json';
import ui from '../../../messages/rt/ui.json';

const { GET } = await import('../../app/api/allegati/[id]/route');
const { updateAttachmentAction, deleteAttachmentAction } = await import('../../server/allegati/actions');
const { listAttachments } = await import('../../server/allegati/queries');
const { ALLEGATI_LIMITS, MAX_FILE_BYTES, RT_ALLEGATI_LIMITS } = await import('../../lib/allegati/limits');
const { PDF_TOOL_LIMITS, FASCICOLO_LIMITS } = await import('../../lib/report/pdf-tool');
const { RT_MAX_ALLEGATI } = await import('../../lib/rt/input');

const download = async (id: string) => GET(new Request(`https://liftpilot.example/api/allegati/${id}`), { params: Promise.resolve({ id }) });
const SHA = 'ab'.repeat(32);

test('scaricamento: allegato, sandbox, nosniff, privato; nome dal titolo e dallo SHA; i byte conservati', async () => {
  reset();
  const f = seedFile({ projectId: 'p1', size: 4, sha256: SHA, title: 'Dichiarazione UE — quadro «Pelazza»', mime: 'application/pdf', data: Uint8Array.from(Buffer.from('%PDF')) });
  for (const role of ['OWNER', 'CHIEF_TECHNICIAN', 'ENGINEER', 'TECHNICIAN', 'SALES']) {
    as(role, { id: `dl-${role}` });
    const r = await download(f.id);
    assert.equal(r.status, 200, role);
    assert.equal(r.headers.get('content-type'), 'application/pdf');
    assert.equal(r.headers.get('content-disposition'), `attachment; filename="dichiarazione-ue-quadro-pelazza-abababab.pdf"`);
    assert.equal(r.headers.get('content-security-policy'), "sandbox; default-src 'none'");
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('cache-control'), 'private, no-store');
    assert.equal(Buffer.from(await r.arrayBuffer()).toString(), '%PDF');
  }
  // a read-only company downloads its files
  as('TECHNICIAN', { readOnly: true, id: 'dl-ro' });
  assert.equal((await download(f.id)).status, 200);
  const jpg = seedFile({ projectId: 'p1', size: 2, sha256: SHA, title: '', mime: 'image/jpeg', data: Uint8Array.from([0xff, 0xd8]) });
  assert.match((await download(jpg.id)).headers.get('content-disposition') ?? '', /filename="documento-abababab\.jpg"$/);
});

test('scaricamento: file di un’altra azienda o inesistente 404; senza sessione 401; 60 in 10 minuti', async () => {
  reset();
  const other = seedFile({ projectId: 'pother', size: 4, data: Uint8Array.from([1, 2, 3, 4]) });
  as('OWNER', { id: 'dl-iso' });
  const r = await download(other.id);
  assert.equal(r.status, 404);
  assert.equal(await r.text(), it.errors.notFound);
  assert.equal((await download('nessuno')).status, 404);
  assert.equal((await download('../x')).status, 404);
  state.user = null;
  assert.equal((await download(other.id)).status, 401);
  as('SALES', { id: 'dl-rate' });
  const own = seedFile({ projectId: 'p1', size: 1 });
  for (let i = 0; i < ALLEGATI_LIMITS.downloadsPer10Min; i++) {
    const r = await download(own.id);
    assert.equal(r.status, 200);
    await r.arrayBuffer();
  }
  assert.equal((await download(own.id)).status, 429);
});

test('scaricamento: i byte a fette dalla base (mai il file intero in una query); al più due in corso per utente', async () => {
  reset();
  const { BLOB_SLICE } = await import('../../server/allegati/blob');
  const data = Uint8Array.from({ length: 2 * BLOB_SLICE + 5 }, (_, i) => i % 251);
  const big = seedFile({ projectId: 'p1', size: data.length, data });
  as('TECHNICIAN', { id: 'dl-slices' });
  const r = await download(big.id);
  assert.equal(r.headers.get('content-length'), String(data.length));
  assert.ok(Buffer.from(await r.arrayBuffer()).equals(Buffer.from(data)), 'gli stessi byte');
  const slices = state.raw.filter((q) => q.sql.includes('substring(data FROM'));
  assert.deepEqual(slices.map((q) => q.values[0]), [1, BLOB_SLICE + 1, 2 * BLOB_SLICE + 1], 'tre fette di 3 MiB');
  // two downloads under way (not read yet): the third waits for one of them
  as('TECHNICIAN', { id: 'dl-flight' });
  const a = await download(big.id), b = await download(big.id);
  assert.deepEqual([a.status, b.status], [200, 200]);
  assert.equal((await download(big.id)).status, 429, 'la terza mentre due sono in corso');
  await a.arrayBuffer();
  const c = await download(big.id);
  assert.equal(c.status, 200, 'finito uno, si riparte');
  await b.body?.cancel();
  await c.arrayBuffer();
});

test('modifica: solo titolo, tipo e sezione; nel registro l’id; Commerciale, sola lettura, archiviato, altra azienda rifiutati', async () => {
  reset();
  const f = seedFile({ projectId: 'p1', size: 10, title: 'Vecchio', kind: 'ALTRO' });
  as('TECHNICIAN', { id: 'ed-1' });
  assert.deepEqual(await updateAttachmentAction({ id: f.id, title: '  Schema   elettrico ', kind: 'SCHEMA_ELETTRICO', component: 'quadro' }), { ok: true });
  assert.deepEqual(state.updates, [{ title: 'Schema elettrico', kind: 'SCHEMA_ELETTRICO', component: 'quadro' }]);
  assert.deepEqual(state.audits, [{ companyId: 'c1', userId: 'ed-1', action: 'ATTACHMENT_EDITED', entity: 'Attachment', entityId: f.id, meta: { attachmentId: f.id } }]);
  assert.deepEqual(await updateAttachmentAction({ id: f.id, title: 'x', kind: 'ALTRO', component: '' }), { ok: true });
  assert.equal(state.updates.at(-1)?.component, null, 'no section clears it');
  // a file in use keeps its title, kind and section editable (the issued RT has its own copy of them)
  state.used.add(f.id);
  assert.deepEqual(await updateAttachmentAction({ id: f.id, title: 'Ancora', kind: 'ALTRO' }), { ok: true });
  assert.deepEqual(await updateAttachmentAction({ id: f.id, title: 'x', kind: 'ALTRO', mime: 'text/html' }), { ok: false, error: 'invalidFields' });
  assert.deepEqual(await updateAttachmentAction({ id: f.id, title: '', kind: 'ALTRO' }), { ok: false, error: 'invalidFields' });
  as('SALES', { id: 'ed-2' });
  assert.deepEqual(await updateAttachmentAction({ id: f.id, title: 'x', kind: 'ALTRO' }), { ok: false, error: 'forbidden' });
  as('TECHNICIAN', { readOnly: true, id: 'ed-3' });
  assert.deepEqual(await updateAttachmentAction({ id: f.id, title: 'x', kind: 'ALTRO' }), { ok: false, error: 'forbidden' });
  as('OWNER', { companyId: 'c2', id: 'ed-4' });
  assert.deepEqual(await updateAttachmentAction({ id: f.id, title: 'x', kind: 'ALTRO' }), { ok: false, error: 'notFound' });
  const arch = seedFile({ projectId: 'parch', size: 1 });
  as('OWNER', { id: 'ed-5' });
  assert.deepEqual(await updateAttachmentAction({ id: arch.id, title: 'x', kind: 'ALTRO' }), { ok: false, error: 'archived' });
});

test('eliminazione: rifiutata se una relazione emessa lo elenca (vincolo reso immediato); altrimenti via con i byte; registro con lo SHA', async () => {
  reset();
  const used = seedFile({ projectId: 'p1', size: 10, sha256: SHA });
  const free = seedFile({ projectId: 'p1', size: 10, sha256: 'cd'.repeat(32) });
  state.used.add(used.id);
  as('TECHNICIAN', { id: 'del-1' });
  assert.deepEqual(await deleteAttachmentAction(used.id), { ok: false, error: 'attachmentInUse' });
  assert.ok(state.raw.some((x) => x.sql.includes('SET CONSTRAINTS "TechnicalReportAttachment_attachmentId_fkey" IMMEDIATE')));
  assert.ok(state.files.some((x) => x.id === used.id));
  assert.equal(state.audits.length, 0);
  assert.deepEqual(await deleteAttachmentAction(free.id), { ok: true });
  assert.ok(!state.files.some((x) => x.id === free.id));
  assert.deepEqual(state.audits, [{ companyId: 'c1', userId: 'del-1', action: 'ATTACHMENT_DELETED', entity: 'Attachment', entityId: free.id, meta: { attachmentId: free.id, sha256: 'cd'.repeat(32) } }]);
  assert.deepEqual(await deleteAttachmentAction(free.id), { ok: false, error: 'notFound' });
  assert.deepEqual(await deleteAttachmentAction('../x'), { ok: false, error: 'invalidFields' });
  // a report issued between the count and the DELETE: the foreign key, made immediate, refuses the DELETE itself
  state.racing = true;
  assert.deepEqual(await deleteAttachmentAction(used.id), { ok: false, error: 'attachmentInUse' });
  assert.ok(state.files.some((x) => x.id === used.id));
  state.racing = false;
  const other = seedFile({ projectId: 'pother', size: 1 });
  assert.deepEqual(await deleteAttachmentAction(other.id), { ok: false, error: 'notFound' });
  as('SALES', { id: 'del-2' });
  assert.deepEqual(await deleteAttachmentAction(used.id), { ok: false, error: 'forbidden' });
  const arch = seedFile({ projectId: 'parch', size: 1 });
  as('OWNER', { id: 'del-3' });
  assert.deepEqual(await deleteAttachmentAction(arch.id), { ok: false, error: 'archived' });
});

test('elenco: solo l’impianto e l’azienda della sessione, senza byte, in uso segnato', async () => {
  reset();
  const a = seedFile({ projectId: 'p1', size: 10 });
  seedFile({ projectId: 'p2', size: 10 });
  seedFile({ projectId: 'pother', size: 10 });
  state.used.add(a.id);
  as('SALES', { id: 'ls-1' });
  const user = state.user as unknown as Parameters<typeof listAttachments>[0];
  const rows = await listAttachments(user, 'p1');
  assert.deepEqual(rows.map((r) => [r.id, r.inUse]), [[a.id, 1]]);
  assert.ok(!('data' in (rows[0] ?? {})) && !('blob' in (rows[0] ?? {})), 'never the bytes');
  assert.deepEqual(await listAttachments(user, 'pother'), []);
});

test('i limiti in un solo posto: uguali a quelli dello strumento PDF, della relazione, della base dati e dei testi', () => {
  assert.equal(ALLEGATI_LIMITS.maxPages, PDF_TOOL_LIMITS.maxPages);
  assert.equal(ALLEGATI_LIMITS.maxPixels, PDF_TOOL_LIMITS.maxPixels);
  assert.equal(ALLEGATI_LIMITS.maxSidePx, PDF_TOOL_LIMITS.maxSidePx);
  assert.equal(RT_ALLEGATI_LIMITS.maxFiles, FASCICOLO_LIMITS.maxAttachments);
  assert.equal(RT_ALLEGATI_LIMITS.maxFiles, RT_MAX_ALLEGATI);
  assert.equal(RT_ALLEGATI_LIMITS.maxPages, FASCICOLO_LIMITS.maxPages);
  assert.equal(MAX_FILE_BYTES, 20 * 1024 * 1024);
  assert.match(it.errors.fileTooLarge, /20 MB/);
  assert.match(it.errors.quotaExceeded, new RegExp(`${ALLEGATI_LIMITS.perProject} file`));
  assert.match(it.errors.quotaExceeded, new RegExp(`${ALLEGATI_LIMITS.perCompanyBytes / 1024 / 1024} MB`));
  // the issue's refusal names the RT's limits, the slow PNGs' megapixels too
  const troppi = ui.esiti.allegatiTroppi;
  for (const n of [`${RT_ALLEGATI_LIMITS.maxFiles} file`, `${RT_ALLEGATI_LIMITS.maxPages} pagine`, `${RT_ALLEGATI_LIMITS.maxBytes / 1024 / 1024} MiB`, `${RT_ALLEGATI_LIMITS.maxSlowPixels / 1e6} megapixel`]) assert.ok(troppi.includes(n), n);
});
