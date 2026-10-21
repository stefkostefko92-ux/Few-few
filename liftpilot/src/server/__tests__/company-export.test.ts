// The company's data export (GDPR art. 20, Data Act art. 25) over an in-memory database: every key the public register
// lists, in its order, and the survey sheets of Rilievi among them — the company's own only, the trashed ones too, every
// column with the measurements per stop in their order and the suppliers' modules as stored; never the search index —
// and the rights the company set for its colleagues' roles (round 42), its own only — and (format 12, round 49) the
// relazioni tecniche di modifica with their files as listed at issue, and the uploaded files streamed one at a time with
// their bytes in base64, the company's own only.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;

type Row = Record<string, unknown>;
type Args = { where?: Row; orderBy?: unknown; omit?: Record<string, boolean>; include?: { misureBottoniere?: { orderBy?: unknown; omit?: Record<string, boolean> } } };
const SCHEDE: Row[] = [
  { id: 's1', companyId: 'c1', data: new Date('2026-10-12'), matricola: '0033871', portataKg: 630, funiDiametroMm: new Prisma.Decimal('10.5'),
    ordineQuadro: { modulo: 'pelazza-ordine-quadri-032026', valori: { ordine: true } }, preventivoArgano: null, searchText: '0033871',
    writeKey: '0f9c2b1e-7d43-4c4a-9a51-3e1f2b6d8c70', deletedAt: null, createdAt: new Date('2026-10-12T09:00:00Z') },
  { id: 's2', companyId: 'c1', data: new Date('2026-10-11'), indirizzo: 'Via Verdi 14', searchText: 'via verdi 14', deletedAt: new Date('2026-10-12T10:00:00Z'),
    createdAt: new Date('2026-10-11T09:00:00Z') },
  { id: 's9', companyId: 'c2', data: new Date('2026-10-12'), matricola: '9', searchText: '9', deletedAt: null, createdAt: new Date('2026-10-12T08:00:00Z') },
];
const MISURE: Row[] = [
  { id: 'm2', schedaId: 's1', fermata: 2, piano: 'T', lunghezzaMm: new Prisma.Decimal('300'), larghezzaMm: null, interasseSuperiore: null, interasseInferiore: null, display: false },
  { id: 'm1', schedaId: 's1', fermata: 1, piano: 'S1', lunghezzaMm: new Prisma.Decimal('320.5'), larghezzaMm: new Prisma.Decimal('105'), interasseSuperiore: '60 mm', interasseInferiore: null, display: true },
];
let schedaArgs: Args | null = null, permArgs: Args | null = null, feedbackArgs: Args | null = null;
const FEEDBACK: Row[] = [
  { id: 'f1', companyId: 'c1', userId: 'u1', kind: 'BUG', page: '/app/rilievi/nuovo', digest: '123', message: 'Il salvataggio non riesce', createdAt: new Date('2026-10-16T08:00:00Z'), handledAt: null },
  { id: 'f9', companyId: 'c2', userId: 'u9', kind: 'IDEA', page: '/app', digest: null, message: 'altra azienda', createdAt: new Date('2026-10-16T08:00:00Z'), handledAt: null },
];
let companyArgs: { select?: Record<string, boolean> } | null = null;
let projectArgs: { include?: Record<string, { select?: Record<string, unknown> }>; omit?: Record<string, boolean> } | null = null;
const PERMS: Row[] = [
  { companyId: 'c1', role: 'TECHNICIAN', capability: 'calc:create', granted: false, updatedById: 'u1', updatedAt: new Date('2026-10-14T08:00:00Z') },
  { companyId: 'c2', role: 'SALES', capability: 'prices:view', granted: false, updatedById: 'u9', updatedAt: new Date('2026-10-14T08:00:00Z') },
];
// the uploaded files (format 12): two of this company's (one with a title that ends in a quote, larger than two slices
// of the stream), one deleted before its turn, one of another company
const bytesOf = (n: number, seed: number): Uint8Array => {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i * 31 + seed) % 256;
  return b;
};
const BIG = 2 * 3 * 1024 * 1024 + 2;
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
const FILES: (Row & { data: Uint8Array | null })[] = [
  { id: 'a2', companyId: 'c1', projectId: 'p1', kind: 'FOTO', title: 'Targa «argano»"', component: 'argano', fileName: 'targa.jpg', mime: 'image/jpeg',
    size: BIG, pages: 1, width: 4000, height: 3000, orientation: 6, createdById: 'u1', createdAt: new Date('2026-10-21T10:00:00Z'), data: bytesOf(BIG, 7) },
  { id: 'a1', companyId: 'c1', projectId: 'p1', kind: 'DICHIARAZIONE_UE', title: 'Dichiarazione UE del quadro', component: 'quadro', fileName: 'dich.pdf',
    mime: 'application/pdf', size: 4, pages: 2, width: null, height: null, orientation: null, createdById: null, createdAt: new Date('2026-10-21T09:00:00Z'),
    data: Uint8Array.from([37, 80, 68, 70]) },
  { id: 'a3', companyId: 'c1', projectId: 'p1', kind: 'ALTRO', title: 'Eliminato', component: null, fileName: 'x.png', mime: 'image/png', size: 3, pages: 1,
    width: 1, height: 1, orientation: null, createdById: 'u1', createdAt: new Date('2026-10-21T11:00:00Z'), data: null },
  { id: 'a9', companyId: 'c2', projectId: 'p9', kind: 'ALTRO', title: 'Altra azienda', component: null, fileName: 'y.pdf', mime: 'application/pdf', size: 3,
    pages: 1, width: null, height: null, orientation: null, createdById: 'u9', createdAt: new Date('2026-10-21T08:00:00Z'), data: Uint8Array.from([1, 2, 3]) },
].map((f) => ({ ...f, sha256: f.data ? sha(f.data) : '0'.repeat(64) }));
let fileListArgs: { where?: Row; orderBy?: unknown; select?: Record<string, boolean>; include?: unknown } | null = null;
const fileReads: string[] = [];
const sliceReads: { id: string; from: number; len: number; sql: string }[] = [];
const none = async () => [];
const without = (row: Row, omit: Record<string, boolean> | undefined): Row => Object.fromEntries(Object.entries(row).filter(([k]) => !omit?.[k]));
const db = {
  company: {
    findUnique: async (args: { select?: Record<string, boolean> }) => {
      companyArgs = args;
      return { id: 'c1', name: 'Ascensori Rossi Srl', ordineSezioni: ['note'] };
    },
  },
  user: { findMany: none }, invite: { findMany: none }, companyLogo: { findMany: none },
  project: { findMany: async (args: typeof projectArgs) => { projectArgs = args; return []; } },
  priceItem: { findMany: none }, customPriceItem: { findMany: none }, auditLog: { findMany: none },
  feedback: { findMany: async (args: Args) => { feedbackArgs = args; return FEEDBACK.filter((f) => f.companyId === args.where?.companyId).map((f) => without(f, args.omit)); } },
  attachment: {
    findMany: async (args: NonNullable<typeof fileListArgs>) => {
      fileListArgs = args;
      return FILES.filter((f) => f.companyId === args.where?.companyId)
        .sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime() || String(a.id).localeCompare(String(b.id)))
        .map((f) => ({ id: f.id }));
    },
    findFirst: async (args: { where: { id: string; companyId: string }; omit?: Record<string, boolean>; include?: unknown }) => {
      fileReads.push(args.where.id);
      assert.equal(args.include, undefined, 'the columns only: the bytes come in slices');
      const f = FILES.find((x) => x.id === args.where.id && x.companyId === args.where.companyId && x.data);
      if (!f) return null;
      return without(f, { ...args.omit, data: true });
    },
  },
  // the bytes, one slice per query: substring(data FROM from FOR len) of the file's blob
  $queryRaw: async (sql: TemplateStringsArray, from: number, len: number, id: string) => {
    sliceReads.push({ id, from, len, sql: sql.join('?') });
    const data = FILES.find((f) => f.id === id)?.data;
    return data ? [{ part: data.subarray(from - 1, from - 1 + len) }] : [];
  },
  companyRolePermission: {
    findMany: async (args: Args) => { permArgs = args; return PERMS.filter((p) => p.companyId === args.where?.companyId); },
  },
  scheda: {
    findMany: async (args: Args) => {
      schedaArgs = args;
      return SCHEDE.filter((s) => Object.entries(args.where ?? {}).every(([k, v]) => s[k] === v))
        .sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime())
        .map((s) => ({
          ...without(s, args.omit),
          ...(args.include?.misureBottoniere ? {
            misureBottoniere: MISURE.filter((m) => m.schedaId === s.id).sort((a, b) => Number(a.fermata) - Number(b.fermata))
              .map((m) => without(m, args.include?.misureBottoniere?.omit)),
          } : {}),
        }));
    },
  },
};
mock.module(src('lib/db.ts'), { namedExports: { prisma: db } });

test('l’esportazione: ogni chiave del registro, e le schede di rilievo della propria azienda, anche nel cestino, con le misure', async () => {
  const { companyExport } = await import(src('server/company-export.ts'));
  const { EXPORT_DATA, EXPORT_ENVELOPE, EXPORT_FORMAT_VERSION } = await import(src('lib/export-format.ts'));
  const doc = await companyExport('c1');
  assert.ok(doc);
  assert.deepEqual(Object.keys(doc), [...EXPORT_ENVELOPE, ...EXPORT_DATA.filter((k: string) => k !== 'attachments')],
    'the keys of the public register, in its order (the uploaded files follow in the stream)');
  assert.equal(doc.formatVersion, EXPORT_FORMAT_VERSION);
  assert.equal(companyArgs?.select?.ordineSezioni, true, 'the company’s order of the sheet’s sections (a setting it entered)');
  assert.deepEqual(schedaArgs?.where, { companyId: 'c1' }, 'the company’s sheets, the trashed ones included (no deletedAt filter)');
  const schede = doc.schede as Row[];
  assert.deepEqual(schede.map((s) => s.id), ['s2', 's1'], 'oldest first, the other company’s never');
  assert.ok(schede.every((s) => !('searchText' in s)), 'the search index is the software’s, not the company’s data');
  assert.ok(schede.every((s) => !('writeKey' in s)), 'the write key guards a save sent twice: the software’s, not the company’s data');
  assert.ok(schede[0]?.deletedAt instanceof Date, 'a trashed sheet says when');
  const s1 = schede[1] as Row & { misureBottoniere: Row[] };
  assert.deepEqual(s1.misureBottoniere.map((m) => [m.fermata, m.piano, String(m.lunghezzaMm), m.display]), [[1, 'S1', '320.5', true], [2, 'T', '300', false]]);
  assert.ok(s1.misureBottoniere.every((m) => !('schedaId' in m)));
  assert.deepEqual(s1.ordineQuadro, { modulo: 'pelazza-ordine-quadri-032026', valori: { ordine: true } });
  // as the file is written: Decimal as text, dates in ISO 8601
  const json = JSON.parse(JSON.stringify(doc)) as { schede: (Row & { misureBottoniere: Row[] })[] };
  assert.equal(json.schede[1]?.funiDiametroMm, '10.5');
  assert.equal(json.schede[1]?.misureBottoniere[1]?.lunghezzaMm, '300');
  assert.equal(json.schede[0]?.deletedAt, '2026-10-12T10:00:00.000Z');
  // the rights matrix as the company set it: its rows only
  assert.deepEqual(permArgs?.where, { companyId: 'c1' });
  assert.deepEqual((doc.rolePermissions as Row[]).map((p) => [p.role, p.capability, p.granted]), [['TECHNICIAN', 'calc:create', false]]);
  // format 8 (round 45): each calculation names the intervention declared with it, each lift design its base calculation
  assert.equal(projectArgs?.include?.calculations?.select?.intervento, true);
  assert.equal(projectArgs?.include?.liftDesigns?.select?.baseCalculationId, true);
  // format 9 (round 45): the installations without their former module — the client ignores the column (round 47): no
  // omit needed, no key of it in an installation
  assert.equal(projectArgs?.omit, undefined);
  assert.ok((doc.projects as Row[]).every((p) => !('kind' in p)));
  // format 10 (round 48): the reports of «Segnala un problema», the company's own only, with their text
  assert.deepEqual(feedbackArgs?.where, { companyId: 'c1' });
  assert.deepEqual(feedbackArgs?.omit, { companyId: true }, 'every column but the company’s id (the file is the company’s)');
  assert.deepEqual((doc.feedback as Row[]).map((f) => [f.id, f.kind, f.message]), [['f1', 'BUG', 'Il salvataggio non riesce']]);
  // format 11 (round 49): the sheets carry rilievi 988f3cf37's new columns — every column of the row is exported (only
  // searchText and writeKey are left out), so no select to keep up to date
  assert.deepEqual(schedaArgs?.omit, { searchText: true, writeKey: true });
  // format 12 (round 49): the relazioni tecniche di modifica, with the kept body's fingerprint but never its bytes, and
  // their files as listed at issue; the installation's registry comes with every scalar of the installation
  assert.equal(doc.formatVersion, 12);
  const tr = projectArgs?.include?.technicalReports as { omit?: Record<string, boolean>; include?: { pdf?: { select?: Record<string, boolean> };
    attachments?: { orderBy?: unknown; omit?: Record<string, boolean> } } } | undefined;
  assert.deepEqual(tr?.omit, { companyId: true, projectId: true });
  assert.deepEqual(tr?.include?.pdf?.select, { sha256: true, pages: true, createdAt: true }, 'the kept PDF: its fingerprint, never its bytes');
  assert.deepEqual(tr?.include?.attachments, { orderBy: { position: 'asc' }, omit: { reportId: true } });
  assert.equal(projectArgs?.include?.anagrafica, undefined, 'a scalar: no include needed');
  assert.ok(!('attachments' in doc), 'the files are written after the rest, by the stream');
});

const read = async (stream: ReadableStream<Uint8Array>): Promise<{ text: string; chunks: number }> => {
  const parts: Buffer[] = [], reader = stream.getReader();
  for (let r = await reader.read(); !r.done; r = await reader.read()) parts.push(Buffer.from(r.value));
  return { text: Buffer.concat(parts).toString('utf8'), chunks: parts.length };
};

test('l’esportazione in streaming: un solo JSON, i documenti caricati uno alla volta in base64, solo della propria azienda', async () => {
  const { companyExport, exportStream } = await import(src('server/company-export.ts'));
  const { EXPORT_DATA, EXPORT_ENVELOPE } = await import(src('lib/export-format.ts'));
  const doc = await companyExport('c1');
  assert.ok(doc);
  fileReads.length = 0;
  sliceReads.length = 0;
  const { text, chunks } = await read(exportStream(doc, 'c1'));
  const json = JSON.parse(text) as Record<string, unknown> & { attachments: (Row & { base64: string })[] };
  assert.deepEqual(Object.keys(json), [...EXPORT_ENVELOPE, ...EXPORT_DATA], 'every key of the register, in its order, the files last');
  // the list reads ids only (no bytes), the company's, oldest first; then one file at a time, the deleted one left out
  assert.deepEqual(fileListArgs?.where, { companyId: 'c1' });
  assert.deepEqual(fileListArgs?.select, { id: true });
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
  const files = json.attachments;
  assert.equal(text, JSON.stringify({ ...doc, attachments: files }, null, 2));
  assert.ok(chunks > 4, 'written piece by piece');
  assert.ok(!text.includes('Altra azienda'), 'another company’s file never');
});

test('l’esportazione in streaming senza documenti caricati: «attachments» vuoto, lo stesso JSON', async () => {
  const { exportStream } = await import(src('server/company-export.ts'));
  const doc = { format: 'f', formatVersion: 12, auditLog: [] };
  const { text } = await read(exportStream(doc as never, 'c-none'));
  assert.equal(text, JSON.stringify({ ...doc, attachments: [] }, null, 2));
});
