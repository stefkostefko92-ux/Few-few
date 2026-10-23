// The one rule for an issued relazione tecnica di modifica (src/server/rt/record.ts, records.ts outdated.rt, pdf.ts,
// GET /api/relazioni/[id]/pdf; RT plan §7): «da aggiornare» by the RT engine's version or its base's; the record made
// again only while it gives its stored SHA-256 (a changed hash, a base the engines no longer reproduce, data that do not
// read — each said apart); the lines stamped on the appended pages read from the record equal to the body's; the
// download serves the kept body with the files appended (the real PDF tool), refuses an RT not reproduced without a kept
// body (409) and another company's (404).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { INPUTS, as, db, rtRow, type Row } from './rt-db';

const { issueTechnicalReportAction } = await import('../rt/actions');
const { rtRecord, allegatiDi } = await import('../rt/record');
const { stampOf } = await import('../rt/pdf');
const { rtFileName } = await import('../rt/file-name');
const { outdated } = await import('../records');
const { RT_ENGINE_VERSION } = await import('../../lib/rt/version');
const { GET } = await import('../../app/api/relazioni/[id]/pdf/route');

async function emessa(inputs: Row = INPUTS as Row): Promise<Row> {
  const r = await issueTechnicalReportAction({ projectId: 'p1', inputs, conferma: true });
  assert.ok(r.ok, JSON.stringify(r));
  const row = db.reports.find((x) => x.id === r.id);
  assert.ok(row);
  return row;
}
async function pdf(pages: number): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage([595, 842]);
  return d.save();
}
const scarica = (id: string) => GET(new Request(`https://liftpilot.example/api/relazioni/${id}/pdf`), { params: Promise.resolve({ id }) });

test('outdated.rt: la versione del motore della relazione o della sua base', () => {
  const room = { engineVersion: '1.17.0', calculation: { engineVersion: '1.8.0' } };
  const fresca = { engineVersion: RT_ENGINE_VERSION, roomDesign: { ...room, engineVersion: String(db.rooms[0]?.engineVersion), calculation: { engineVersion: String(db.calcs[0]?.engineVersion) } }, liftDesign: null };
  assert.equal(outdated.rt(fresca), false);
  assert.equal(outdated.rt({ ...fresca, engineVersion: '0.0.1' }), true);
  assert.equal(outdated.rt({ ...fresca, roomDesign: { ...fresca.roomDesign, engineVersion: '0.0.1' } }), true);
  assert.equal(outdated.rt({ ...fresca, roomDesign: { ...fresca.roomDesign, calculation: { engineVersion: '0.0.1' } } }), true);
});

test('rtRecord: rifatta uguale; impronta diversa, base non riprodotta, dati illeggibili — detti a parte', async () => {
  const r = await emessa();
  const ok = await rtRecord(rtRow(r) as never);
  assert.ok(ok.ok);
  assert.equal(ok.composed.sha256, r.sha256);
  // what the record stores is what the issue hashed: the inputs, registry and plant as JSON
  assert.equal(ok.parts.number, r.number);
  assert.deepEqual(ok.parts.allegati.map((a) => a.attachmentId), ['f1', 'f2']);
  const hash = await rtRecord(rtRow({ ...r, sha256: '0'.repeat(64) }) as never);
  assert.deepEqual(hash, { ok: false, reason: 'hash' });
  const room = db.rooms.find((x) => x.id === 'room1');
  assert.ok(room);
  const sha = room.sha256;
  room.sha256 = '1'.repeat(64);
  assert.deepEqual(await rtRecord(rtRow(r) as never), { ok: false, reason: 'engineChanged' });
  room.sha256 = sha;
  assert.deepEqual(await rtRecord(rtRow({ ...r, inputs: { doc: { inventato: true } } }) as never), { ok: false, reason: 'unreadable' });
  assert.deepEqual(await rtRecord(rtRow({ ...r, revisions: 'R0' }) as never), { ok: false, reason: 'unreadable' });
  assert.deepEqual(await rtRecord(rtRow({ ...r, roomDesignId: null }) as never), { ok: false, reason: 'unreadable' });
  // a file whose type the RT does not take (never stored: the upload refuses it) does not read
  assert.equal(allegatiDi({ attachments: [{ position: 1, attachmentId: 'f1', kind: 'ALTRO', title: 't', component: null, sha256: 'a'.repeat(64), pages: 1,
    attachment: { mime: 'image/gif', orientation: null, size: 1, fileName: 'x.gif' } }] } as never), null);
  // the registry changed on the installation after the issue: the RT keeps its own (it still reproduces)
  const p1 = db.projects.find((p) => p.id === 'p1');
  assert.ok(p1);
  p1.anagrafica = { manutentore: 'Altra ditta' };
  assert.ok((await rtRecord(rtRow(r) as never)).ok);
});

test('tavole citate: per identità — una serie emessa sulla stessa base durante l’emissione non cambia la riproduzione', async () => {
  const set = (id: string, seq: number, createdAt: Date): Row => ({ id, companyId: 'c1', roomDesignId: 'room1', year: 2026, seq, revision: 0,
    number: `26-${String(seq).padStart(3, '0')}`, sha256: id.padEnd(64, 'b').slice(0, 64), plant: {}, createdAt });
  db.sets = [set('s1', 1, new Date('2026-10-03T08:00:00Z'))];
  try {
    const r = await emessa();
    assert.deepEqual(r.citedSetIds, ['s1'], 'the record keeps the ids it cites');
    // a set dated before the RT whose transaction committed after the RT read the sets: never cited, never read back
    db.sets.push(set('s2', 2, new Date((r.createdAt as Date).getTime() - 1000)));
    const ok = await rtRecord(rtRow(r) as never);
    assert.ok(ok.ok, 'the same sets read back, by id');
    assert.deepEqual(ok.parts.sets.map((x) => x.id), ['s1']);
    // read by time (an RT issued before migration 28 keeps no ids) the late set would move the hash
    assert.deepEqual(await rtRecord(rtRow({ ...r, citedSetIds: null }) as never), { ok: false, reason: 'hash' });
    // a cited set that is not found, or ids that do not read: the record does not read
    assert.deepEqual(await rtRecord(rtRow({ ...r, citedSetIds: ['s1', 'gone'] }) as never), { ok: false, reason: 'unreadable' });
    assert.deepEqual(await rtRecord(rtRow({ ...r, citedSetIds: 's1' }) as never), { ok: false, reason: 'unreadable' });
  } finally {
    db.sets = [];
  }
});

test('stampOf: le righe delle pagine allegate, lette dal record, sono quelle del corpo emesso; l’avviso è il loro', async () => {
  const r = await emessa(), rec = await rtRecord(rtRow(r) as never);
  assert.ok(rec.ok);
  const s = stampOf(rtRow(r) as never), meta = rec.composed.doc.meta;
  assert.deepEqual([s.header, s.code], [meta.header, meta.code]);
  // a copy of a document the company uploaded: never «generated with LiftPilot, valid with the signatures»
  assert.notEqual(s.notice, meta.notice);
  assert.match(s.notice, /^Copia del documento caricato dall’azienda.*non generato da LiftPilot$/);
  assert.equal(s.info.author, 'Ascensori Esempio S.r.l.');
  assert.equal(s.info.title, meta.title);
  assert.match(rtFileName(rtRow(r) as never), /^RT-\d{2}-001-R0-[a-z0-9-]+\.pdf$/);
});

test('download: il corpo conservato con i file in coda; senza corpo e non riprodotta 409; di un’altra azienda 404', async () => {
  const r = await emessa({ ...INPUTS, allegati: [{ attachmentId: 'f1' }] }), id = String(r.id);
  db.pdfs.set(id, await pdf(3));
  db.blobs.set('f1', await pdf(2));
  const res = await scarica(id);
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.match(res.headers.get('content-disposition') ?? '', /RT-\d{2}-001-R0-/);
  const out = await PDFDocument.load(new Uint8Array(await res.arrayBuffer()));
  assert.equal(out.getPageCount(), 5, 'corpo 3 + allegato 2');
  assert.equal(db.audits.at(-1)?.action, 'REPORT_DOWNLOADED');
  // a kept body is served after an engine's change too
  r.engineVersion = '0.0.1';
  const again = await scarica(id);
  assert.equal(again.status, 200);
  await again.arrayBuffer();
  // not kept and not reproduced: 409, a new revision makes it again
  db.pdfs.delete(id);
  r.sha256 = '0'.repeat(64);
  assert.equal((await scarica(id)).status, 409);
  as('ENGINEER', { companyId: 'c2' });
  assert.equal((await scarica(id)).status, 404);
  db.session = null;
  assert.equal((await scarica(id)).status, 401);
});

test('download: un carattere di controllo nel nome dell’impianto o nel titolo di un file non ferma il PDF; una alla volta per utente', async () => {
  const p1 = db.projects.find((p) => p.id === 'p1');
  assert.ok(p1);
  p1.name = 'Condominio\tVia Roma 1';
  const r = await emessa({ ...INPUTS, allegati: [{ attachmentId: 'f1', titolo: 'Dichiarazione\u0085UE' }] }), id = String(r.id);
  assert.equal((r.projectData as Row).name, 'Condominio\tVia Roma 1', 'il record conserva quanto scritto');
  db.pdfs.set(id, await pdf(1));
  db.blobs.set('f1', await pdf(2));
  const res = await scarica(id);
  assert.equal(res.status, 200);
  // a second download of the same user while the first is still being read waits
  assert.equal((await scarica(id)).status, 429);
  const out = await PDFDocument.load(new Uint8Array(await res.arrayBuffer()));
  assert.equal(out.getPageCount(), 3);
  assert.equal(out.getTitle()?.includes('\t'), false);
  const next = await scarica(id);
  assert.equal(next.status, 200, 'finito il primo, il secondo parte');
  await next.arrayBuffer();
});

test('fascicolo: con i renderer occupati la risposta è «occupato» prima di leggere un solo byte dei file', async () => {
  const { withRendererSlot, RendererBusy } = await import('../../lib/report/render');
  const { fascicolo } = await import('../rt/pdf');
  const r = await emessa({ ...INPUTS, allegati: [{ attachmentId: 'f1' }] });
  db.blobs.set('f1', await pdf(2));
  let free: () => void = () => undefined;
  const gate = new Promise<void>((ok) => { free = ok; });
  // 2 running and 8 waiting: the queue is full
  const held = Array.from({ length: 10 }, () => withRendererSlot(() => gate));
  await assert.rejects(fascicolo(rtRow(r) as never, new Uint8Array(await pdf(1))), RendererBusy);
  assert.deepEqual(db.slices, [], 'nessuna fetta letta');
  free();
  await Promise.all(held);
  const out = await fascicolo(rtRow(r) as never, new Uint8Array(await pdf(1)));
  assert.equal(out.kind, 'file');
  if (out.kind === 'file') await out.handle.close();
  assert.deepEqual(db.slices, ['f1'], 'letto a fette, dentro il turno');
});
