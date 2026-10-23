// The draft of a relazione tecnica di modifica (FormDraft scope 'rt'; src/lib/draft-input.ts, src/server/rt/queries.ts,
// workspace.ts; RT plan §7 «Draft»): kept by whoever draws the project (progetto:edit) as typed — the inputs within the
// ranges, the revision prepared — and nothing else; a file deleted since leaves the list, the documents and the sources
// (with how many went); the workspace opens on the draft, else on the RT revised without its day and note, else on a new
// start (the user as «Redatto da», the company's last «Verificato da», every file of the installation).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INPUTS, as, db } from './rt-db';
import type { RtInputs } from '../../lib/rt/input';

const { draftScopeSchema, draftSchemaOf } = await import('../../lib/draft-input');
const { saveDraftAction, discardDraftAction } = await import('../draft-actions');
const { idsNamed, senzaFile, readRtDraft } = await import('../rt/queries');
const { workspaceOf } = await import('../rt/workspace');
const { issueTechnicalReportAction } = await import('../rt/actions');

const CON_FILE: RtInputs = {
  ...INPUTS,
  documenti: { libretto: 'f1', schema: 'separato', quadro_ue: 'f2' },
  componenti: { quadro: { tensioneComando: 48, fonte: { tipo: 'targa', rif: 'Targa', attachmentId: 'f2' } } },
};

test('lo scope «rt»: il suo schema tiene gli input e la revisione, niente altro; il diritto è di chi disegna il progetto', () => {
  assert.equal(draftScopeSchema.safeParse('rt').success, true);
  const s = draftSchemaOf('rt');
  assert.equal(s.safeParse({ inputs: CON_FILE, revisionOf: 'rt1' }).success, true);
  // what is being typed: a description still short is kept
  assert.equal(s.safeParse({ inputs: { doc: { descrizione: 'breve' } } }).success, true);
  assert.equal(s.safeParse({ inputs: {}, altro: 1 }).success, false);
  assert.equal(s.safeParse({ inputs: { doc: { inventato: 1 } } }).success, false);
  assert.equal(s.safeParse({ inputs: { componenti: { quadro: { tensioneComando: 9000 } } } }).success, false);
  assert.equal(s.safeParse({ inputs: {}, revisionOf: '../x' }).success, false);
});

test('salvare e scartare la bozza: il Progettista sì, il Tecnico e il Commerciale no; impianto archiviato o altrui no', async () => {
  const save = (projectId = 'p1') => saveDraftAction({ projectId, scope: 'rt', data: { inputs: CON_FILE } });
  assert.equal((await save()).ok, true);
  assert.equal(db.drafts.length, 1);
  assert.deepEqual(await save('parch'), { ok: false, error: 'notFound' });
  assert.deepEqual(await save('pother'), { ok: false, error: 'notFound' });
  assert.deepEqual(await saveDraftAction({ projectId: 'p1', scope: 'rt', data: { inputs: {}, altro: true } }), { ok: false, error: 'invalidFields' });
  for (const role of ['TECHNICIAN', 'SALES']) {
    as(role);
    assert.deepEqual(await save(), { ok: false, error: 'forbidden' }, role);
    assert.deepEqual(await discardDraftAction({ projectId: 'p1', scope: 'rt' }), { ok: false, error: 'forbidden' }, role);
  }
  as('ENGINEER');
  assert.equal((await discardDraftAction({ projectId: 'p1', scope: 'rt' })).ok, true);
  assert.equal(db.drafts.length, 0);
});

test('i file nominati: elenco, documenti, fonti; uno eliminato esce da tutti e tre', () => {
  assert.deepEqual(idsNamed(CON_FILE).sort(), ['f1', 'f2']);
  const senza = senzaFile(CON_FILE, new Set(['f1']));
  assert.deepEqual(senza.allegati, [{ attachmentId: 'f1' }]);
  assert.deepEqual(senza.documenti, { libretto: 'f1', schema: 'separato' });
  assert.deepEqual(senza.componenti?.quadro?.fonte, { tipo: 'targa', rif: 'Targa' });
  assert.deepEqual(idsNamed(senza), ['f1']);
});

test('la bozza letta senza i file eliminati da allora, con quanti sono usciti', async () => {
  db.drafts = [{ companyId: 'c1', projectId: 'p1', scope: 'rt', data: { inputs: CON_FILE }, updatedAt: new Date('2026-10-20T10:00:00Z') }];
  db.files = db.files.filter((f) => f.id !== 'f2');
  const d = await readRtDraft(db.session as never, 'p1');
  assert.ok(d);
  assert.equal(d.dropped, 1);
  assert.deepEqual(idsNamed(d.data.inputs), ['f1']);
  // another company never reads it
  as('ENGINEER', { companyId: 'c2' });
  assert.equal(await readRtDraft(db.session as never, 'p1'), null);
});

test('l’area di lavoro: nuova, dalla bozza, dalla revisione (senza data e nota della precedente)', async () => {
  const user = db.session as { name: string };
  const nuova = await workspaceOf(db.session as never, 'p1', undefined, true);
  assert.equal(nuova.state.result.ok, true);
  assert.equal(nuova.inputs.firme?.redatto?.nome, user.name);
  // the documents only: the photo (f2) waits for the technician's «Allega» (GDPR art. 25(2))
  assert.deepEqual(nuova.inputs.allegati, [{ attachmentId: 'f1' }]);
  assert.deepEqual(nuova.files.map((f) => f.id), ['f1', 'f2'], 'the photo is listed among the installation’s files');
  assert.ok(nuova.live && nuova.live.summary.sezioni.length > 0);
  assert.equal(nuova.draftAt, null);
  // an RT issued: its «Verificato da» is the next new start's, and its revision opens on its inputs
  const r = await issueTechnicalReportAction({ projectId: 'p1', inputs: { ...INPUTS, doc: { ...INPUTS.doc, commessa: 'C-12' }, revisione: undefined }, conferma: true });
  assert.ok(r.ok);
  const dopo = await workspaceOf(db.session as never, 'p1', undefined, true);
  assert.deepEqual(dopo.inputs.firme?.verificato, INPUTS.firme?.verificato);
  const rev = await workspaceOf(db.session as never, 'p1', r.id, true);
  assert.equal(rev.revisione?.id, r.id);
  assert.equal(rev.inputs.doc?.commessa, 'C-12');
  assert.equal(rev.inputs.doc?.data, undefined, 'la data è quella della nuova emissione');
  assert.equal(rev.inputs.revisione, undefined);
  // a draft of that revision is what reopens; a draft read without the right is not read at all
  db.drafts = [{ companyId: 'c1', projectId: 'p1', scope: 'rt', data: { inputs: { doc: { commessa: 'C-13' } }, revisionOf: r.id }, updatedAt: new Date() }];
  const bozza = await workspaceOf(db.session as never, 'p1', undefined, true);
  assert.deepEqual([bozza.revisione?.id, bozza.inputs.doc?.commessa], [r.id, 'C-13']);
  const lettore = await workspaceOf(db.session as never, 'p1', undefined, false);
  assert.equal(lettore.draftAt, null);
  assert.notEqual(lettore.inputs.doc?.commessa, 'C-13');
});
