// The company export's tests (company-export, company-export-pages) over an in-memory database: every key the public
// register lists, the survey sheets of Rilievi — the company's own only, the trashed ones too, with the measurements per
// stop —, the rights the company set for its colleagues' roles, the reports of «Segnala un problema», the logos, the
// installations and the activity log read a page at a time (the where of a page evaluated as PostgreSQL would: companyId,
// then createdAt/id bounds, oldest first, then by id), and the uploaded files with their bytes read one slice at a time.
import { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

export const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;

export type Row = Record<string, unknown>;
export type Args = { where?: Row; orderBy?: unknown; omit?: Record<string, boolean>; include?: { misureBottoniere?: { orderBy?: unknown; omit?: Record<string, boolean> } } };
export const SCHEDE: Row[] = [
  { id: 's1', companyId: 'c1', data: new Date('2026-10-12'), matricola: '0033871', portataKg: 630, funiDiametroMm: new Prisma.Decimal('10.5'),
    ordineQuadro: { modulo: 'pelazza-ordine-quadri-032026', valori: { ordine: true } }, preventivoArgano: null, searchText: '0033871',
    writeKey: '0f9c2b1e-7d43-4c4a-9a51-3e1f2b6d8c70', deletedAt: null, createdAt: new Date('2026-10-12T09:00:00Z') },
  { id: 's2', companyId: 'c1', data: new Date('2026-10-11'), indirizzo: 'Via Verdi 14', searchText: 'via verdi 14', deletedAt: new Date('2026-10-12T10:00:00Z'),
    createdAt: new Date('2026-10-11T09:00:00Z') },
  { id: 's9', companyId: 'c2', data: new Date('2026-10-12'), matricola: '9', searchText: '9', deletedAt: null, createdAt: new Date('2026-10-12T08:00:00Z') },
];
export const MISURE: Row[] = [
  { id: 'm2', schedaId: 's1', fermata: 2, piano: 'T', lunghezzaMm: new Prisma.Decimal('300'), larghezzaMm: null, interasseSuperiore: null, interasseInferiore: null, display: false },
  { id: 'm1', schedaId: 's1', fermata: 1, piano: 'S1', lunghezzaMm: new Prisma.Decimal('320.5'), larghezzaMm: new Prisma.Decimal('105'), interasseSuperiore: '60 mm', interasseInferiore: null, display: true },
];
export const seen = { permArgs: null as Args | null, feedbackArgs: null as Args | null, companyArgs: null as { select?: Record<string, boolean> } | null,
  fileListArgs: null as { where?: Row; orderBy?: unknown; select?: Record<string, boolean>; include?: unknown } | null };
export const FEEDBACK: Row[] = [
  { id: 'f1', companyId: 'c1', userId: 'u1', kind: 'BUG', page: '/app/rilievi/nuovo', digest: '123', message: 'Il salvataggio non riesce', createdAt: new Date('2026-10-16T08:00:00Z'), handledAt: null },
  { id: 'f9', companyId: 'c2', userId: 'u9', kind: 'IDEA', page: '/app', digest: null, message: 'altra azienda', createdAt: new Date('2026-10-16T08:00:00Z'), handledAt: null },
];
export const PERMS: Row[] = [
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
export const FILES: (Row & { data: Uint8Array | null })[] = [
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
export const fileReads: string[] = [];
export const sliceReads: { id: string; from: number; len: number; sql: string }[] = [];
const none = async () => [];
const without = (row: Row, omit: Record<string, boolean> | undefined): Row => Object.fromEntries(Object.entries(row).filter(([k]) => !omit?.[k]));
// the paged lists: the where of a page (companyId, then AND of ORs of createdAt/id bounds), oldest first, then by id
const time = (v: unknown): number | string => (v instanceof Date ? v.getTime() : String(v));
const holds = (v: unknown, f: unknown): boolean => {
  if (f instanceof Date || typeof f !== 'object' || f === null) return time(v) === time(f);
  return Object.entries(f).every(([op, x]) => {
    const a = time(v), b = time(x);
    return op === 'lt' ? a < b : op === 'lte' ? a <= b : op === 'gt' ? a > b : op === 'gte' ? a >= b : false;
  });
};
const matches = (row: Row, where: Row): boolean => Object.entries(where).every(([k, f]) =>
  k === 'AND' ? (f as Row[]).every((w) => matches(row, w)) : k === 'OR' ? (f as Row[]).some((w) => matches(row, w)) : holds(row[k], f));
export const oldest = (a: Row, b: Row): number => (time(a.createdAt) < time(b.createdAt) ? -1 : time(a.createdAt) > time(b.createdAt) ? 1
  : String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
const picked = (row: Row, select: Record<string, boolean> | undefined): Row => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : row);
export type PageArgs = { where?: Row; orderBy?: unknown; take?: number; select?: Record<string, boolean>; omit?: Record<string, boolean>; include?: Args['include'] & Row };
const LAST_ORDER = [{ createdAt: 'desc' }, { id: 'desc' }];
const PAGE_ORDER = [{ createdAt: 'asc' }, { id: 'asc' }];
/** Holds the next page query of any paged table until the test lets it go (one query only). */
export const gate: { wait: Promise<void> | null } = { wait: null };
/** A paged table: its last row (findFirst, newest first) and its pages (findMany, oldest first, `take` rows). */
const paged = (rows: Row[], shape: (r: Row, args: PageArgs) => Row = (r) => r, seen: PageArgs[] = []) => ({
  findFirst: async (args: PageArgs) => {
    assert.deepEqual(args.orderBy, LAST_ORDER);
    const r = rows.filter((x) => matches(x, args.where ?? {})).sort(oldest).at(-1);
    return r ? picked(r, args.select) : null;
  },
  findMany: async (args: PageArgs) => {
    seen.push(args);
    if (gate.wait) {
      const wait = gate.wait;
      gate.wait = null;
      await wait;
    }
    assert.deepEqual(args.orderBy, PAGE_ORDER, 'oldest first, then by id: createdAt alone can tie');
    return rows.filter((x) => matches(x, args.where ?? {})).sort(oldest).slice(0, args.take).map((r) => shape(picked(r, args.select), args));
  },
});
export const LOGOS: Row[] = [{ id: 'l1', companyId: 'c1', mime: 'image/png', sha256: 'aa', width: 2, height: 1, createdAt: new Date('2026-10-01T08:00:00Z'),
  data: Uint8Array.from([1, 2, 3]) }, { id: 'l9', companyId: 'c2', mime: 'image/png', sha256: 'bb', width: 2, height: 1,
  createdAt: new Date('2026-10-01T08:00:00Z'), data: Uint8Array.from([9]) }];
export const PROJECTS: Row[] = [{ id: 'p1', companyId: 'c1', name: 'Via Roma 1', anagrafica: { matricola: '1' }, createdAt: new Date('2026-10-02T08:00:00Z'),
  clientLogos: [{ id: 'cl1', mime: 'image/jpeg', sha256: 'cc', width: 3, height: 3, createdAt: new Date('2026-10-02T09:00:00Z'), data: Uint8Array.from([255, 216]) }],
  calculations: [], shaftDesigns: [], liftDesigns: [], roomDesigns: [], formDrafts: [], drawingSets: [], technicalReports: [] },
{ id: 'p9', companyId: 'c2', name: 'Altra azienda', createdAt: new Date('2026-10-02T08:00:00Z'), clientLogos: [] }];
export const AUDIT: Row[] = [{ id: 'e1', companyId: 'c1', userId: 'u1', action: 'PROJECT_CREATED', entity: 'Project', entityId: 'p1', meta: { name: 'Via Roma 1' },
  createdAt: new Date('2026-10-02T08:00:00Z') }, { id: 'e9', companyId: 'c2', userId: 'u9', action: 'LOGIN', entity: 'User', entityId: 'u9', meta: null,
  createdAt: new Date('2026-10-02T08:00:00Z') }];
export const logoPages: PageArgs[] = [], projectPages: PageArgs[] = [], schedaPages: PageArgs[] = [], auditPages: PageArgs[] = [];
const db = {
  company: {
    findUnique: async (args: { select?: Record<string, boolean> }) => {
      seen.companyArgs = args;
      return { id: 'c1', name: 'Ascensori Rossi Srl', ordineSezioni: ['note'] };
    },
  },
  user: { findMany: none }, invite: { findMany: none },
  companyLogo: paged(LOGOS, (r) => r, logoPages),
  project: paged(PROJECTS, (r) => r, projectPages),
  priceItem: { findMany: none }, customPriceItem: { findMany: none },
  auditLog: paged(AUDIT, (r) => r, auditPages),
  feedback: { findMany: async (args: Args) => { seen.feedbackArgs = args; return FEEDBACK.filter((f) => f.companyId === args.where?.companyId).map((f) => without(f, args.omit)); } },
  attachment: {
    findMany: async (args: NonNullable<typeof seen.fileListArgs>) => {
      seen.fileListArgs = args;
      return FILES.filter((f) => f.companyId === args.where?.companyId).sort(oldest).map((f) => ({ id: f.id }));
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
    findMany: async (args: Args) => { seen.permArgs = args; return PERMS.filter((p) => p.companyId === args.where?.companyId); },
  },
  scheda: paged(SCHEDE, (s, args) => ({
    ...without(s, args.omit),
    ...(args.include?.misureBottoniere ? {
      misureBottoniere: MISURE.filter((m) => m.schedaId === s.id).sort((a, b) => Number(a.fermata) - Number(b.fermata))
        .map((m) => without(m, args.include?.misureBottoniere?.omit)),
    } : {}),
  }), schedaPages),
};
mock.module(src('lib/db.ts'), { namedExports: { prisma: db } });
// what the export logs as an error (the stream failing), to tell a real failure from a client that went away
export const loggedErrors: unknown[] = [];
mock.module(src('lib/log.ts'), { namedExports: { log: { info: () => undefined, warn: () => undefined, error: (...a: unknown[]) => { loggedErrors.push(a); } } } });

export const read = async (stream: ReadableStream<Uint8Array>): Promise<{ text: string; chunks: number }> => {
  const parts: Buffer[] = [], reader = stream.getReader();
  for (let r = await reader.read(); !r.done; r = await reader.read()) parts.push(Buffer.from(r.value));
  return { text: Buffer.concat(parts).toString('utf8'), chunks: parts.length };
};
export type Doc = Record<string, unknown> & { schede: (Row & { misureBottoniere: Row[] })[]; projects: Row[]; logos: Row[]; auditLog: Row[];
  attachments: (Row & { base64: string })[] };

