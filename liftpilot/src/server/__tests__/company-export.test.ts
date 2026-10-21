// The company's data export (GDPR art. 20, Data Act art. 25) over an in-memory database: every key the public register
// lists, in its order, and the survey sheets of Rilievi among them — the company's own only, the trashed ones too, every
// column with the measurements per stop in their order and the suppliers' modules as stored; never the search index —
// and the rights the company set for its colleagues' roles (round 42), its own only — and (format 12, round 49) the
// relazioni tecniche di modifica with their files as listed at issue, and the uploaded files streamed one at a time with
// their bytes in base64, the company's own only. The logos, the installations, the sheets and the activity log are read a
// page at a time up to the last row there was when the export began; the text is the one JSON.stringify gives for the
// whole document read at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AUDIT, LOGOS, PROJECTS, SCHEDE, fileReads, projectPages, read, schedaPages, seen, sliceReads, src, type Doc, type Row } from './company-export-db';

test('l’esportazione: ogni chiave del registro, e le schede di rilievo della propria azienda, anche nel cestino, con le misure', async () => {
  const { companyExport, exportStream } = await import(src('server/company-export.ts'));
  const { EXPORT_DATA, EXPORT_ENVELOPE, EXPORT_FORMAT_VERSION } = await import(src('lib/export-format.ts'));
  const head = await companyExport('c1');
  assert.ok(head);
  const PAGED = ['logos', 'projects', 'schede', 'auditLog', 'attachments'];
  assert.deepEqual(Object.keys(head.data), [...EXPORT_ENVELOPE, ...EXPORT_DATA].filter((k) => !PAGED.includes(k)),
    'read at once: the keys of the public register but the paged lists, in its order');
  assert.deepEqual(head.ends, { logos: { createdAt: LOGOS[0]?.createdAt, id: 'l1' }, projects: { createdAt: PROJECTS[0]?.createdAt, id: 'p1' },
    schede: { createdAt: SCHEDE[0]?.createdAt, id: 's1' }, auditLog: { createdAt: AUDIT[0]?.createdAt, id: 'e1' } }, 'the company’s last row of each');
  assert.equal(head.data.formatVersion, EXPORT_FORMAT_VERSION);
  assert.equal(seen.companyArgs?.select?.ordineSezioni, true, 'the company’s order of the sheet’s sections (a setting it entered)');
  schedaPages.length = projectPages.length = 0;
  const json = JSON.parse((await read(exportStream(head, 'c1'))).text) as Doc;
  const schedaArgs = schedaPages[0];
  assert.equal(schedaArgs?.where?.companyId, 'c1', 'the company’s sheets');
  assert.ok(!JSON.stringify(schedaArgs?.where).includes('deletedAt'), 'the trashed ones included (no deletedAt filter)');
  assert.deepEqual(json.schede.map((s) => s.id), ['s2', 's1'], 'oldest first, the other company’s never');
  assert.ok(json.schede.every((s) => !('searchText' in s)), 'the search index is the software’s, not the company’s data');
  assert.ok(json.schede.every((s) => !('writeKey' in s)), 'the write key guards a save sent twice: the software’s, not the company’s data');
  const s1 = json.schede[1] as Row & { misureBottoniere: Row[] };
  // as the file is written: Decimal as text, dates in ISO 8601
  assert.deepEqual(s1.misureBottoniere.map((m) => [m.fermata, m.piano, m.lunghezzaMm, m.display]), [[1, 'S1', '320.5', true], [2, 'T', '300', false]]);
  assert.ok(s1.misureBottoniere.every((m) => !('schedaId' in m)));
  assert.deepEqual(s1.ordineQuadro, { modulo: 'pelazza-ordine-quadri-032026', valori: { ordine: true } });
  assert.equal(s1.funiDiametroMm, '10.5');
  assert.equal(json.schede[0]?.deletedAt, '2026-10-12T10:00:00.000Z', 'a trashed sheet says when');
  // the rights matrix as the company set it: its rows only
  assert.deepEqual(seen.permArgs?.where, { companyId: 'c1' });
  assert.deepEqual((head.data.rolePermissions as Row[]).map((p) => [p.role, p.capability, p.granted]), [['TECHNICIAN', 'calc:create', false]]);
  // the logos and the client's logos of the installations in base64; the other company's never
  assert.deepEqual(json.logos, [{ id: 'l1', mime: 'image/png', sha256: 'aa', width: 2, height: 1, createdAt: '2026-10-01T08:00:00.000Z', base64: 'AQID' }]);
  assert.deepEqual(json.projects.map((p) => p.id), ['p1']);
  assert.deepEqual(json.projects[0]?.clientLogos, [{ id: 'cl1', mime: 'image/jpeg', sha256: 'cc', width: 3, height: 3, createdAt: '2026-10-02T09:00:00.000Z',
    base64: '/9g=' }]);
  assert.equal(Object.keys(json.projects[0] ?? {}).at(-1), 'clientLogos');
  assert.deepEqual(json.auditLog, [{ createdAt: '2026-10-02T08:00:00.000Z', userId: 'u1', action: 'PROJECT_CREATED', entity: 'Project', entityId: 'p1',
    meta: { name: 'Via Roma 1' } }], 'the entry’s id places the page, the file never carried it');
  // format 8 (round 45): each calculation names the intervention declared with it, each lift design its base calculation
  const projectArgs = projectPages[0] as { include?: Record<string, { select?: Record<string, unknown> }>; omit?: unknown } | undefined;
  assert.equal(projectArgs?.include?.calculations?.select?.intervento, true);
  assert.equal(projectArgs?.include?.liftDesigns?.select?.baseCalculationId, true);
  // format 9 (round 45): the installations without their former module — the client ignores the column (round 47): no
  // omit needed, no key of it in an installation
  assert.equal(projectArgs?.omit, undefined);
  assert.ok(json.projects.every((p) => !('kind' in p)));
  // format 10 (round 48): the reports of «Segnala un problema», the company's own only, with their text
  assert.deepEqual(seen.feedbackArgs?.where, { companyId: 'c1' });
  assert.deepEqual(seen.feedbackArgs?.omit, { companyId: true }, 'every column but the company’s id (the file is the company’s)');
  assert.deepEqual((head.data.feedback as Row[]).map((f) => [f.id, f.kind, f.message]), [['f1', 'BUG', 'Il salvataggio non riesce']]);
  // format 11 (round 49): the sheets carry rilievi 988f3cf37's new columns — every column of the row is exported (only
  // searchText and writeKey are left out), so no select to keep up to date
  assert.deepEqual(schedaArgs?.omit, { searchText: true, writeKey: true });
  // format 12 (round 49): the relazioni tecniche di modifica, with the kept body's fingerprint but never its bytes, and
  // their files as listed at issue; the installation's registry comes with every scalar of the installation
  const tr = projectArgs?.include?.technicalReports as { omit?: Record<string, boolean>; include?: { pdf?: { select?: Record<string, boolean> };
    attachments?: { orderBy?: unknown; omit?: Record<string, boolean> } } } | undefined;
  assert.deepEqual(tr?.omit, { companyId: true, projectId: true });
  assert.deepEqual(tr?.include?.pdf?.select, { sha256: true, pages: true, createdAt: true }, 'the kept PDF: its fingerprint, never its bytes');
  assert.deepEqual(tr?.include?.attachments, { orderBy: { position: 'asc' }, omit: { reportId: true } });
  assert.equal(projectArgs?.include?.anagrafica, undefined, 'a scalar: no include needed');
  assert.deepEqual(json.projects[0]?.anagrafica, { matricola: '1' });
});

test('l’esportazione in streaming: un solo JSON, i documenti caricati uno alla volta in base64, solo della propria azienda', async () => {
  const { companyExport, exportStream } = await import(src('server/company-export.ts'));
  const { EXPORT_DATA, EXPORT_ENVELOPE } = await import(src('lib/export-format.ts'));
  const head = await companyExport('c1');
  assert.ok(head);
  fileReads.length = 0;
  sliceReads.length = 0;
  const { text, chunks } = await read(exportStream(head, 'c1'));
  const json = JSON.parse(text) as Doc;
  assert.deepEqual(Object.keys(json), [...EXPORT_ENVELOPE, ...EXPORT_DATA], 'every key of the register, in its order, the files last');
  // the list reads ids only (no bytes), the company's, oldest first; then one file at a time, the deleted one left out
  assert.deepEqual(seen.fileListArgs?.where, { companyId: 'c1' });
  assert.deepEqual(seen.fileListArgs?.select, { id: true });
  assert.deepEqual(fileReads, ['a1', 'a2', 'a3']);
  assert.deepEqual(json.attachments.map((a) => a.id), ['a1', 'a2']);
  // the bytes in whole 3-byte slices (their base64 joins into the file's), never the whole file in one read
  const { EXPORT_SLICE } = await import(src('server/company-export.ts'));
  assert.equal(EXPORT_SLICE % 3, 0);
  assert.deepEqual(sliceReads.map((r) => [r.id, r.from, r.len]), [['a1', 1, EXPORT_SLICE], ['a2', 1, EXPORT_SLICE],
    ['a2', EXPORT_SLICE + 1, EXPORT_SLICE], ['a2', 2 * EXPORT_SLICE + 1, EXPORT_SLICE]]);
  assert.ok(sliceReads.every((r) => /FROM "AttachmentBlob" WHERE "attachmentId" = \?/.test(r.sql)), 'one file’s blob by its id');
  for (const a of json.attachments) {
    assert.equal(createHash('sha256').update(Buffer.from(a.base64, 'base64')).digest('hex'), a.sha256, `${a.id}: the base64 is the stored file`);
    assert.ok(!('companyId' in a) && !('blob' in a), `${a.id}: the file's columns, not the company's id, not the blob`);
    assert.equal(Object.keys(a).at(-1), 'base64');
  }
  assert.equal(json.attachments[1]?.title, 'Targa «argano»"');
  // the same text JSON.stringify gives for the whole document: a reader sees one ordinary JSON file
  assert.equal(text, JSON.stringify(json, null, 2));
  assert.ok(chunks > 4, 'written piece by piece');
  assert.ok(!text.includes('Altra azienda'), 'another company’s file never');
});

test('l’esportazione di un’azienda senza righe: liste vuote, lo stesso JSON', async () => {
  const { exportStream } = await import(src('server/company-export.ts'));
  const { EXPORT_DATA, EXPORT_ENVELOPE } = await import(src('lib/export-format.ts'));
  const data = Object.fromEntries([...EXPORT_ENVELOPE, ...EXPORT_DATA].filter((k) => !['logos', 'projects', 'schede', 'auditLog', 'attachments'].includes(k))
    .map((k) => [k, k === 'company' ? { id: 'c-none' } : []]));
  const { text } = await read(exportStream({ data, ends: { logos: null, projects: null, schede: null, auditLog: null } } as never, 'c-none'));
  const empty = Object.fromEntries([...EXPORT_ENVELOPE, ...EXPORT_DATA].map((k) => [k, k in data ? data[k] : []]));
  assert.equal(text, JSON.stringify(empty, null, 2));
});
