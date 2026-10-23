// The issue of a relazione tecnica di modifica and its revisions (src/server/rt/issue.ts, actions.ts; RT plan §7, §8) over
// the in-memory database of rt-db.ts: who may issue (drawings:issue; a Tecnico or a read-only company may not); the base
// the installation has now (none, archived, another company's, not reproduced); the inputs (what blocks, what the engineer
// confirms first); the files (of this installation only, named in the list, deleted meanwhile); the number of the company
// and year (a concurrent first issue retried), the revision of the latest revision only, with its note; and that what is
// stored is what the one rule makes again (rtRecord) — the record's SHA-256 through the database's JSON.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INPUTS, as, db, rtRow } from './rt-db';
import type { RtIssueResult } from '../rt/issue';

const { issueTechnicalReportAction, reviseTechnicalReportAction } = await import('../rt/actions');
const { rtRecord } = await import('../rt/record');

const emetti = (over: Record<string, unknown> = {}): Promise<RtIssueResult> =>
  issueTechnicalReportAction({ projectId: 'p1', inputs: INPUTS, conferma: true, ...over });
const ok = (r: RtIssueResult): string => { assert.ok(r.ok, JSON.stringify(r)); return r.id; };

test('diritti: senza sessione, il Tecnico, il Commerciale e l’azienda in sola lettura non emettono; il Progettista sì', async () => {
  db.session = null;
  assert.deepEqual(await emetti(), { ok: false, error: 'forbidden' });
  for (const role of ['TECHNICIAN', 'SALES']) {
    as(role);
    assert.deepEqual(await emetti(), { ok: false, error: 'forbidden' }, role);
  }
  as('ENGINEER', { readOnly: true });
  assert.deepEqual(await emetti(), { ok: false, error: 'forbidden' });
  as('ENGINEER', { mustChangePassword: true });
  assert.deepEqual(await emetti(), { ok: false, error: 'forbidden' });
  assert.equal(db.reports.length, 0);
  as('ENGINEER');
  ok(await emetti());
  assert.equal(db.reports.length, 1);
});

test('la base: impianto senza calcolo, archiviato, di un’altra azienda, record non riprodotto', async () => {
  assert.deepEqual(await emetti({ projectId: 'p2' }), { ok: false, error: 'rtNotEligible' });
  assert.deepEqual(await emetti({ projectId: 'parch' }), { ok: false, error: 'archived' });
  assert.deepEqual(await emetti({ projectId: 'pother' }), { ok: false, error: 'notFound' });
  assert.deepEqual(await emetti({ projectId: '../p1' }), { ok: false, error: 'invalidFields' });
  const room = db.rooms.find((r) => r.id === 'room1');
  assert.ok(room);
  room.sha256 = '0'.repeat(64);
  assert.deepEqual(await emetti(), { ok: false, error: 'rtBaseOutdated' });
  assert.equal(db.reports.length + db.audits.length, 0);
});

test('mancano le firme o la descrizione: rtIncomplete con i campi; un valore fuori campo: invalidFields', async () => {
  const senzaFirme = { ...INPUTS, firme: { redatto: { nome: 'Mario Rossi' } } };
  const r = await emetti({ inputs: senzaFirme });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.error === 'rtIncomplete');
  assert.ok(!r.ok && r.campi?.includes('firme.verificato.nome') && r.campi.includes('firme.verificato.numero'), JSON.stringify(r));
  const corta = await emetti({ inputs: { ...INPUTS, doc: { descrizione: 'troppo corta' } } });
  // too short: below the schema's minimum as well as missing for the issue — the field named either way
  assert.ok(!corta.ok && ['rtIncomplete', 'invalidFields'].includes(corta.error) && corta.campi?.includes('doc.descrizione'), JSON.stringify(corta));
  // a block of data typed by hand without its source
  const senzaFonte = await emetti({ inputs: { ...INPUTS, componenti: { quadro: { tensioneComando: 48 } } } });
  assert.ok(!senzaFonte.ok && senzaFonte.error === 'rtIncomplete' && senzaFonte.campi?.includes('componenti.quadro.fonte'), JSON.stringify(senzaFonte));
  const fuori = await emetti({ inputs: { ...INPUTS, componenti: { quadro: { tensioneComando: 9000, fonte: { tipo: 'targa', rif: 'x' } } } } });
  assert.ok(!fuori.ok && fuori.error === 'invalidFields' && fuori.campi?.includes('componenti.quadro.tensioneComando'));
  // the day: not after today, not before the calculation
  const futura = await emetti({ inputs: { ...INPUTS, doc: { ...INPUTS.doc, data: '2999-01-01' } } });
  assert.deepEqual(futura, { ok: false, error: 'dataNonValida', campi: ['doc.data'] });
  const prima = await emetti({ inputs: { ...INPUTS, doc: { ...INPUTS.doc, data: '2026-09-30' } } });
  assert.deepEqual(prima, { ok: false, error: 'dataNonValida', campi: ['doc.data'] });
  assert.equal(db.reports.length, 0);
});

test('conferma: quello che la relazione stampa come non soddisfatto, mancante o da allegare si conferma prima', async () => {
  const r = await emetti({ conferma: undefined });
  assert.ok(!r.ok && r.error === 'conferma', JSON.stringify(r));
  assert.ok(!r.ok && r.conferma && r.conferma.falliti.length + r.conferma.mancanti.length + r.conferma.documenti.length > 0);
  assert.equal(db.reports.length, 0);
  ok(await emetti());
});

test('i file: solo di questo impianto, nominati nell’elenco; uno eliminato durante l’emissione', async () => {
  assert.deepEqual(await emetti({ inputs: { ...INPUTS, allegati: [{ attachmentId: 'fp2' }] } }), { ok: false, error: 'allegatoEstraneo' });
  assert.deepEqual(await emetti({ inputs: { ...INPUTS, allegati: [{ attachmentId: 'fother' }] } }), { ok: false, error: 'allegatoEstraneo' });
  // a document or a source naming a file the list does not have
  assert.deepEqual(await emetti({ inputs: { ...INPUTS, allegati: [{ attachmentId: 'f1' }], documenti: { libretto: 'f2' } } }), { ok: false, error: 'allegatoEstraneo' });
  db.vanished.add('f2');
  assert.deepEqual(await emetti(), { ok: false, error: 'allegatoEliminato' });
  assert.equal(db.reports.length + db.counters.size, 0, 'nessun numero preso');
});

/** The first bytes of a stored PNG w × h of colour type `ct` (8 bits): its header and the start of its image data. */
function pngHead(w: number, h: number, ct: number): Uint8Array {
  const b = Buffer.alloc(41);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); b[24] = 8; b[25] = ct;
  b.write('IDAT', 37, 'latin1');
  return Uint8Array.from(b);
}

test('i PNG decodificati per il fascicolo (trasparenza) al più 300 megapixel per relazione; quelli copiati non contano', async () => {
  const f1 = db.files[0];
  assert.ok(f1);
  const png = (id: string, w: number, h: number, ct: number): void => {
    db.files.push({ ...f1, id, kind: 'DISEGNO', title: `Disegno ${id}`, component: null, mime: 'image/png', pages: 1, sha256: id.padEnd(64, 'c').slice(0, 64) });
    db.blobs.set(id, pngHead(w, h, ct));
  };
  // three RGBA drawings of 100 MP: 300 MP, the budget; an RGB one of 400 MP is copied, never decoded
  png('a1', 10000, 10000, 6); png('a2', 10000, 10000, 6); png('a3', 10000, 10000, 6); png('a4', 20000, 20000, 2);
  const allegati = ['f1', 'a1', 'a2', 'a3', 'a4'].map((attachmentId) => ({ attachmentId }));
  ok(await emetti({ inputs: { ...INPUTS, allegati } }));
  // one more RGBA pixel over the budget: refused before a number is taken
  png('a5', 1, 1, 6);
  const n = db.reports.length;
  assert.deepEqual(await emetti({ inputs: { ...INPUTS, allegati: [...allegati, { attachmentId: 'a5' }] } }), { ok: false, error: 'allegatiTroppi' });
  assert.equal(db.reports.length, n);
});

test('emissione: numero dell’azienda e dell’anno, R0, i file nell’ordine, bozza tolta, registro; la regola la rifà uguale', async () => {
  db.drafts = [{ companyId: 'c1', projectId: 'p1', scope: 'rt', data: { inputs: {} }, updatedAt: new Date() }];
  const id = ok(await emetti({ inputs: { ...INPUTS, allegati: [{ attachmentId: 'f2' }, { attachmentId: 'f1', titolo: 'Libretto e verbali' }] } }));
  const r = db.reports.find((x) => x.id === id);
  assert.ok(r);
  assert.match(String(r.number), /^\d{2}-001$/);
  assert.equal(r.revision, 0);
  assert.deepEqual((r.revisions as { mark: string }[]).map((x) => x.mark), ['R0']);
  assert.deepEqual([r.roomDesignId, r.liftDesignId, r.calculationId, r.companyName], ['room1', null, 'calc1', 'Ascensori Esempio S.r.l.']);
  assert.deepEqual((r.attachments as { position: number; attachmentId: string; title: string }[]).map((a) => [a.position, a.attachmentId, a.title]),
    [[1, 'f2', 'Fotografia del locale'], [2, 'f1', 'Libretto e verbali']]);
  assert.match(String(r.summary), /^Solo argano · \d+ sezion[ei] · 2 allegati · R0$/);
  assert.equal(db.afters, 1, 'il PDF si conserva dopo la risposta');
  assert.deepEqual(db.draftsDropped, [{ companyId: 'c1', projectId: 'p1', scope: 'rt' }]);
  assert.deepEqual(db.audits.map((a) => [a.action, a.entity, a.entityId, a.meta]), [['TECHNICAL_REPORT_ISSUED', 'TechnicalReport', id, { number: r.number, revision: 0 }]]);
  // the one rule: the record made again from what is stored gives its SHA-256
  const again = await rtRecord(rtRow(r) as never);
  assert.ok(again.ok, JSON.stringify(!again.ok && again.reason));
  assert.equal(again.composed.sha256, r.sha256);
  const id2 = ok(await emetti());
  assert.match(String(db.reports.find((x) => x.id === id2)?.number), /^\d{2}-002$/);
});

test('due prime emissioni insieme: il contatore fatto dall’altra si riprova una volta', async () => {
  db.counterRace = 1;
  const id = ok(await emetti());
  assert.match(String(db.reports.find((x) => x.id === id)?.number), /^\d{2}-001$/);
  db.counterRace = 2;
  assert.deepEqual(await emetti(), { ok: false, error: 'conflict' });
});

test('revisione: solo dell’ultima, con la nota; stesso numero, revisione + 1, revisioni in coda; la regola la rifà', async () => {
  const r0 = ok(await emetti());
  const rev = (reportId: string, testo?: string) => reviseTechnicalReportAction({ reportId, projectId: 'p1', conferma: true,
    inputs: { ...INPUTS, ...(testo === undefined ? {} : { revisione: { testo } }) } });
  assert.deepEqual(await rev(r0), { ok: false, error: 'notaRevisione', campi: ['revisione.testo'] });
  const corta = await rev(r0, 'no');
  assert.ok(!corta.ok && corta.campi?.includes('revisione.testo'), JSON.stringify(corta));
  const r1 = ok(await rev(r0, 'Corretta la descrizione della modifica'));
  const a = db.reports.find((x) => x.id === r0), b = db.reports.find((x) => x.id === r1);
  assert.ok(a && b);
  assert.deepEqual([b.number, b.year, b.seq, b.revision], [a.number, a.year, a.seq, 1]);
  assert.deepEqual((b.revisions as { mark: string; text: string }[]).map((x) => [x.mark, x.text]), [['R0', 'Prima emissione'], ['R1', 'Corretta la descrizione della modifica']]);
  assert.equal(db.audits.at(-1)?.action, 'TECHNICAL_REPORT_REVISED');
  assert.ok((await rtRecord(rtRow(b) as never)).ok);
  // R0 is no longer the latest; another company's or a foreign id is not found
  assert.deepEqual(await rev(r0, 'Ancora una volta'), { ok: false, error: 'revisioneNonUltima' });
  assert.deepEqual(await rev('nessuna', 'Nota valida'), { ok: false, error: 'notFound' });
  as('ENGINEER', { companyId: 'c2' });
  assert.deepEqual(await reviseTechnicalReportAction({ reportId: r1, projectId: 'p1', inputs: INPUTS, conferma: true }), { ok: false, error: 'notFound' });
});
