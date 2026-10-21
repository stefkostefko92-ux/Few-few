// The relazione tecnica di modifica's server tests (rt-issue, rt-records, rt-draft) over an in-memory database: an
// installation of company c1 with a «Solo argano» calculation and its machine room surveyed — real records the running
// engines reproduce (their hashes computed here as the saves compute them) —, its files, the RTs issued with their
// files' snapshot, the company's counter; another installation without a calculation, an archived one, another
// company's. The session, the activity log, the log and next's after() are mocked: nothing is rendered or sent.
import { mock, beforeEach } from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { PRESETS } from '@/calc/presets';
import { ENGINE_VERSION, snapshotOf } from '@/calc/snapshot';
import type { FormValues } from '@/calc/types';
import type { Collaudo } from '@/lib/lift/collaudo';
import type { Plant } from '@/lib/plant';
import type { Anagrafica } from '@/lib/rt/anagrafica';
import type { RtInputs } from '@/lib/rt/input';
import { snapshotHash } from '@/lib/snapshot-hash';
import { deriveRoom } from '@/lib/room/derive';
import { ROOM_ENGINE_VERSION, roomSnapshot } from '@/lib/room/snapshot';
import { startSurvey } from '@/lib/room/survey';
import { canonHash } from '@/lib/canon-hash';
import { formValuesSchema } from '@/lib/calc-input';

export const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

export type Row = Record<string, unknown>;

// ---- the base: the chapter 7 replacement (fixtures/rt/scenari.ts), its calculation and its machine room
export const VALUES: FormValues = { ...PRESETS.C, n_shaftMax: 3000 };
export const SOLO: Collaudo = { norma: '10411-1', parti: ['machine'], marcatura: 'no', documentato: { Q: 630, P: 700, Mcw: 1015 }, libretto: { v: 1, H: 18 } };
export const PLANT: Plant = { safetyGear: 'progressive', carBracketPitch: 2000, cwBracketPitch: 2500, liftUse: 'passengers', control: 'Quadro a microprocessore' };
export const ANAGRAFICA: Anagrafica = {
  proprietario: { nome: 'Condominio Via Roma 1', indirizzo: 'Via Roma 1, Monza' }, manutentore: 'Ascensori Brianza', numeroFabbrica: 'F-1978-22',
  annoInstallazione: 1978, leggeConfermata: true, prima: { persone: 6, fermate: 5, superficie: 1.45, fonte: 'libretto' },
};
const CALC_AT = new Date('2026-10-01T08:00:00Z');

function calcRecord(values: FormValues) {
  const s = snapshotOf(values);
  return { inputs: s.values as unknown, sha256: snapshotHash(s) };
}
const calc = calcRecord(VALUES);
const readValues = formValuesSchema.parse(calc.inputs) as FormValues;
const survey = startSurvey(600), derived = deriveRoom(readValues, survey), room = roomSnapshot(survey, calc.sha256, derived);

export const calcRow = (over: Row = {}): Row => ({
  id: 'calc1', companyId: 'c1', projectId: 'p1', shaftDesignId: null, createdAt: CALC_AT, engineVersion: ENGINE_VERSION, collaudo: SOLO, intervento: 'SOLO_ARGANO', ...calc, ...over,
});
export const roomRow = (over: Row = {}): Row => ({
  id: 'room1', companyId: 'c1', projectId: 'p1', calculationId: 'calc1', createdAt: new Date('2026-10-02T08:00:00Z'), label: 'locale', engineVersion: ROOM_ENGINE_VERSION,
  inputs: room.inputs ?? {}, sha256: canonHash(room), ...over,
});

/** The inputs of an RT ready to issue (no day: the issue's). */
export const INPUTS: RtInputs = {
  doc: { descrizione: 'Sostituzione dell’argano con uno nuovo, come da Calcolo argano e rilievo del locale allegati.' },
  firme: { redatto: { nome: 'Mario Rossi', qualifica: 'Tecnico' }, verificato: { titolo: 'Ing.', nome: 'Laura Bianchi', provincia: 'Milano', numero: 'A12345' } },
  allegati: [{ attachmentId: 'f1' }, { attachmentId: 'f2' }],
  componenti: { quadro: { tensioneComando: 48, correnteComando: 'cc', fonte: { tipo: 'targa', rif: 'Targa del quadro' } } },
};

// ---- the database
const project = (id: string, companyId: string, over: Row = {}): Row => ({
  id, companyId, archivedAt: null, name: 'Condominio Via Roma 1 — impianto A', address: 'Via Roma 1', city: 'Monza', province: 'MB', plantNumber: 'MB 1234/78',
  client: 'Studio Amministrazioni Brianza', plant: PLANT, anagrafica: ANAGRAFICA, ...over,
});
const file = (id: string, projectId: string, over: Row = {}): Row => ({
  id, companyId: projectId === 'pother' ? 'c2' : 'c1', projectId, kind: 'LIBRETTO_VERBALE', title: `Documento ${id}`, component: 'impianto', fileName: `${id}.pdf`,
  sha256: id.padEnd(64, 'a').slice(0, 64), pages: 2, mime: 'application/pdf', size: 1000, orientation: null, ...over,
});

export const db = {
  projects: [] as Row[], calcs: [] as Row[], rooms: [] as Row[], files: [] as Row[], reports: [] as Row[], counters: new Map<string, number>(),
  drafts: [] as Row[], draftsDropped: [] as Row[], audits: [] as Row[], afters: 0,
  /** the kept bodies by RT, the files' bytes by file */
  pdfs: new Map<string, Uint8Array>(), blobs: new Map<string, Uint8Array>(),
  /** files the issue's lock no longer finds (deleted between the check and the transaction) */
  vanished: new Set<string>(),
  /** the counter's next upsert fails as a concurrent first issue would (P2002) */
  counterRace: 0,
  session: null as Row | null,
  /** the slices of files' bytes read, by file (blob.ts) */
  slices: [] as string[],
  /** the drawing sets issued on the bases (id, companyId, roomDesignId or calculationId, year, seq, revision, number,
   *  sha256, plant, createdAt) */
  sets: [] as Row[],
};

const matches = (r: Row, w: Row): boolean => Object.entries(w).every(([k, v]) => {
  if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
    const o = v as Row;
    if ('in' in o) return (o.in as unknown[]).includes(r[k]);
    if ('lte' in o) return (r[k] as Date) <= (o.lte as Date);
    if (k === 'project') return (db.projects.find((p) => p.id === r.projectId)?.archivedAt ?? null) === (o.archivedAt ?? null);
    if (k === 'liftDesign') return true;
    return true;
  }
  return r[k] === v;
});
const newest = <T extends Row>(xs: T[]): T | null => [...xs].sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime())[0] ?? null;

/** An RT as getRt reads it (RT_ROW): its base's records, no logo, its body kept or not, its files with their columns. */
export function rtRow(r: Row): Row {
  const rm = db.rooms.find((x) => x.id === r.roomDesignId);
  return {
    ...r, user: { name: 'Progettista' }, project: db.projects.find((p) => p.id === r.projectId), liftDesign: null, logo: null, pdf: r.pdf ?? null,
    roomDesign: rm ? { ...rm, calculation: db.calcs.find((c) => c.id === rm.calculationId) } : null,
    // the stored size is the bytes' length, as the upload writes both
    attachments: ((r.attachments as Row[] | undefined) ?? []).map((a) => {
      const f = db.files.find((x) => x.id === a.attachmentId) ?? { mime: 'application/pdf' }, bytes = db.blobs.get(String(a.attachmentId));
      return { ...a, attachment: bytes ? { ...f, size: bytes.length } : f };
    }),
  };
}

const client = {
  project: { findFirst: async ({ where }: { where: Row }) => db.projects.find((p) => matches(p, where)) ?? null },
  calculation: { findFirst: async ({ where }: { where: Row }) => newest(db.calcs.filter((c) => matches(c, where))) },
  roomDesign: {
    findFirst: async ({ where }: { where: Row }) => {
      const r = newest(db.rooms.filter((x) => matches(x, where)));
      return r ? { ...r, calculation: db.calcs.find((c) => c.id === r.calculationId) } : null;
    },
    count: async ({ where }: { where: Row }) => db.rooms.filter((x) => matches(x, where)).length,
  },
  liftDesign: { findFirst: async () => null, count: async () => 0 },
  attachment: { findMany: async ({ where }: { where: Row }) => db.files.filter((f) => matches(f, where)) },
  drawingSet: {
    findMany: async ({ where }: { where: Row }) => db.sets.filter((x) => matches(x, where))
      .sort((a, b) => Number(a.year) - Number(b.year) || Number(a.seq) - Number(b.seq) || Number(a.revision) - Number(b.revision)),
  },
  company: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === 'c1' ? { name: 'Ascensori Esempio S.r.l.', logo: null } : null) },
  technicalReportCounter: {
    upsert: async ({ where }: { where: { companyId_year: { companyId: string; year: number } } }) => {
      if (db.counterRace > 0) { db.counterRace--; throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }); }
      const k = `${where.companyId_year.companyId}:${where.companyId_year.year}`, last = (db.counters.get(k) ?? 0) + 1;
      db.counters.set(k, last);
      return { last };
    },
  },
  technicalReport: {
    findFirst: async ({ where, orderBy }: { where: Row; orderBy?: Row }) => {
      const hit = db.reports.filter((r) => matches(r, where));
      if (orderBy) hit.sort((a, b) => (b.revision as number) - (a.revision as number));
      const r = hit[0];
      return r ? rtRow(r) : null;
    },
    findMany: async ({ where }: { where: Row }) => db.reports.filter((r) => matches(r, where)).map(rtRow),
    create: async ({ data }: { data: Row & { attachments: { create: Row[] } } }) => {
      const id = `rt${db.reports.length + 1}`, { attachments, ...rest } = data;
      db.reports.push(JSON.parse(JSON.stringify({ ...rest, id, attachments: attachments.create.map((a) => ({ ...a, reportId: id })) }), (k, v: unknown) =>
        (k === 'createdAt' && typeof v === 'string' ? new Date(v) : v)) as Row);
      return { id };
    },
  },
  technicalReportPdf: {
    findUnique: async ({ where }: { where: { reportId: string } }) => { const data = db.pdfs.get(where.reportId); return data ? { data } : null; },
    createMany: async ({ data }: { data: { reportId: string; data: Uint8Array }[] }) => {
      const fresh = data.filter((d) => !db.pdfs.has(d.reportId));
      for (const d of fresh) db.pdfs.set(d.reportId, d.data);
      return { count: fresh.length };
    },
  },
  attachmentBlob: {
    findMany: async ({ where }: { where: { attachmentId: { in: string[] } } }) =>
      where.attachmentId.in.flatMap((attachmentId) => { const data = db.blobs.get(attachmentId); return data ? [{ attachmentId, data }] : []; }),
  },
  formDraft: {
    upsert: async ({ where, create, update }: { where: { projectId_scope: Row }; create: Row; update: Row }) => {
      const k = where.projectId_scope, d = db.drafts.find((x) => x.projectId === k.projectId && x.scope === k.scope), at = new Date();
      if (d) Object.assign(d, update, { updatedAt: at }); else db.drafts.push({ ...create, updatedAt: at });
      return { updatedAt: at };
    },
    findFirst: async ({ where }: { where: Row }) => db.drafts.find((d) => matches(d, where)) ?? null,
    deleteMany: async ({ where }: { where: Row }) => { db.draftsDropped.push(where); db.drafts = db.drafts.filter((d) => !matches(d, where)); return { count: 1 }; },
  },
  // a slice of a file's bytes (src/server/allegati/blob.ts: substring FROM at FOR n, 1-based), else the RT's files locked
  // FOR KEY SHARE: those that still exist
  $queryRaw: async (s: TemplateStringsArray, ...values: unknown[]) => {
    if (s.join('?').includes('substring(data FROM')) {
      db.slices.push(String(values.at(-1)));
      const data = db.blobs.get(String(values.at(-1)));
      const from = values.length === 3 ? Number(values[0]) : 1, n = Number(values.length === 3 ? values[1] : values[0]);
      return data ? [{ part: data.subarray(from - 1, from - 1 + n) }] : [];
    }
    const ids = ((values[0] as { values?: unknown[] }).values ?? []) as string[];
    return db.files.filter((f) => ids.includes(f.id as string) && !db.vanished.has(f.id as string)).map((f) => ({ id: f.id }));
  },
};
export const prisma = { ...client, $transaction: async <T>(fn: (tx: typeof client) => Promise<T>): Promise<T> => fn(client) };

mock.module(src('lib/db.ts'), { namedExports: { prisma } });
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => db.session } });
mock.module(src('lib/audit.ts'), { namedExports: { audit: async (a: Row) => { db.audits.push(a); } } });
mock.module(src('lib/log.ts'), { namedExports: { log: { info: () => undefined, warn: () => undefined, error: () => undefined } } });
mock.module(pkg('next/headers'), { namedExports: { headers: async () => new Headers() } });
const nextServer = await import(pkg('next/server')) as Row;
mock.module(pkg('next/server'), { namedExports: { ...nextServer, after: () => { db.afters++; } } });

const { capsOf } = await import(src('lib/rbac.ts')) as { capsOf: (role: string) => unknown };

let n = 0;
/** Signs in a user of a role (company c1 unless said); each sign-in its own id (the rate limits are per user). */
export function as(role: string, over: Row = {}): Row {
  db.session = { id: `u${++n}`, role, companyId: 'c1', companyName: 'Ascensori Esempio S.r.l.', name: `${role} ${n}`, email: 'x@ditta.example', locale: 'it',
    mustChangePassword: false, readOnly: false, caps: capsOf(role), ...over };
  return db.session;
}

beforeEach(() => {
  db.projects = [project('p1', 'c1'), project('p2', 'c1'), project('parch', 'c1', { archivedAt: new Date('2026-09-01') }), project('pother', 'c2')];
  db.calcs = [calcRow(), calcRow({ id: 'calcarch', projectId: 'parch' })];
  db.rooms = [roomRow(), roomRow({ id: 'roomarch', projectId: 'parch', calculationId: 'calcarch' })];
  db.files = [file('f1', 'p1'), file('f2', 'p1', { kind: 'FOTO', title: 'Fotografia del locale', component: null, mime: 'image/jpeg', pages: 1 }), file('fp2', 'p2'),
    file('fother', 'pother')];
  db.reports = []; db.counters.clear(); db.drafts = []; db.draftsDropped = []; db.audits = []; db.afters = 0; db.vanished.clear(); db.counterRace = 0;
  db.pdfs.clear(); db.blobs.clear(); db.slices = [];
  as('ENGINEER');
});
