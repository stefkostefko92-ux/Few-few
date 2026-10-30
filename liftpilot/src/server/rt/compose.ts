import 'server-only';
// One way to make the relazione tecnica di modifica from its parts (RT plan §4.7, §7): the RT engine's derivation on the
// reproduced base, the document built from the record as issued, the document's SHA-256 (its blocks and meta), the
// results kept, the canonical snapshot and its SHA-256. The issue (issue.ts), the preview (preview.ts) and the record's
// reproduction (record.ts, «one rule») all go through composeRt with the same parts read the same way — so an RT the
// running engines still reproduce hashes to its stored SHA-256, and any change of an engine, of the builder's wording or
// of a reused function shows as a different hash. Plus the files of an RT in their order (allegatiRt) and the drawing
// sets cited: found on the base at the issue (setsCitati), kept by id on the record and read back by id (setsPerId) —
// a set issued on the same base while the RT is issued is cited or not, the same at issue and at every reproduction.
import type { Prisma } from '@prisma/client';
import type { SheetImage } from '@/drawing';
import type { SessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { plantData, type Plant } from '@/lib/plant';
import type { PdfBlock, ReportDoc } from '@/lib/report/model';
import { buildRelazioneModifica, type RevisioneRt, type RtDocInput } from '@/lib/report/rt/build';
import type { Anagrafica } from '@/lib/rt/anagrafica';
import { deriveRt } from '@/lib/rt/derive';
import type { RtInputs } from '@/lib/rt/input';
import { rtResults, rtSnapshot } from '@/lib/rt/snapshot';
import { COMPONENTI, type AllegatoKind, type Componente, type RtAllegato, type RtBase, type RtDerived, type RtResults } from '@/lib/rt/types';
import { rtDocSha, rtHash } from '@/lib/rt-hash';

/** The installation's data as the RT prints them (Project, snapshotted at issue). */
export interface ProjectDataRt { name: string; address: string | null; city: string | null; province: string | null; plantNumber: string | null; client: string | null }

/** A drawing set the RT cites (never appended): issued on the base up to the RT's issue; its id is what the record keeps
 *  (TechnicalReport.citedSetIds). */
export interface SetCitato { id: string; number: string; revision: number; sha256: string; plant: Plant }

export interface RtParts {
  /** null: a draft (the preview) */
  number: string | null;
  revision: number;
  revisions: readonly RevisioneRt[];
  base: RtBase;
  inputs: RtInputs;
  anagrafica: Anagrafica;
  plant: Plant;
  project: ProjectDataRt;
  company: { name: string; logo: SheetImage | null; logoSha256: string | null };
  allegati: readonly RtAllegato[];
  sets: readonly SetCitato[];
}

export interface RtComposed {
  /** what the document was built from (the workspace's summary reads its words from the same input) */
  input: RtDocInput;
  derived: RtDerived;
  doc: ReportDoc<PdfBlock>;
  docSha: string;
  results: RtResults;
  snapshot: unknown;
  sha256: string;
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
/** A value as the database gives it back (JSON): what is hashed at issue is what is read later. */
export const asJson = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export function composeRt(p: RtParts): RtComposed {
  const derived = deriveRt(p.base, p.inputs, p.anagrafica, p.plant, p.allegati);
  // the company's city is not part of the record: the letterhead names the company only (it never moves an issued RT)
  const input: RtDocInput = {
    number: p.number, revision: p.revision, revisions: p.revisions, project: p.project, company: { name: p.company.name, city: null, logo: p.company.logo },
    anagrafica: p.anagrafica, plant: p.plant, inputs: p.inputs, allegati: p.allegati, derived, sets: p.sets,
  };
  const doc = buildRelazioneModifica(input);
  const docSha = rtDocSha(doc), results = rtResults(derived);
  const snapshot = rtSnapshot({
    number: p.number ?? '', revision: p.revision, revisions: asJson(p.revisions) as unknown as Json, base: p.base, tipo: p.base.tipo, collaudo: p.base.collaudo,
    anagrafica: p.anagrafica, projectData: asJson(p.project) as unknown as Json, plant: p.plant, company: { name: p.company.name, logoSha256: p.company.logoSha256 },
    inputs: p.inputs, allegati: p.allegati, results, docSha,
  });
  return { input, derived, doc, docSha, results, snapshot, sha256: rtHash(snapshot) };
}

const isComponente = (c: unknown): c is Componente => COMPONENTI.some((k) => k === c);
const MIMES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const mimeOf = (m: string): RtAllegato['mime'] | null => MIMES.find((x) => x === m) ?? null;

/** An uploaded file as the RT takes it. */
export interface FileRow { id: string; kind: AllegatoKind; title: string; component: string | null; sha256: string; pages: number; mime: string; size: number }

/** The RT's files in the engineer's order (position 1..n), named and filed as the inputs say or as uploaded; null when
 *  one of them is not among `rows` (not this installation's, or deleted). */
export function allegatiRt(chosen: RtInputs['allegati'], rows: readonly FileRow[]): RtAllegato[] | null {
  const out: RtAllegato[] = [];
  for (const [i, a] of (chosen ?? []).entries()) {
    const f = rows.find((r) => r.id === a.attachmentId), mime = f ? mimeOf(f.mime) : null;
    if (!f || !mime) return null;
    const component = a.componente ?? (isComponente(f.component) ? f.component : null);
    out.push({ position: i + 1, attachmentId: f.id, kind: f.kind, title: a.titolo ?? f.title, component, sha256: f.sha256, pages: f.pages, mime });
  }
  return out;
}

/** The files of an installation of the company by id (the bytes never; the kind beside the columns: an include). */
export function filesOf(db: Prisma.TransactionClient | typeof prisma, user: Pick<SessionUser, 'companyId'>, projectId: string, ids: readonly string[]): Promise<FileRow[]> {
  return ids.length ? db.attachment.findMany({ where: { id: { in: [...ids] }, companyId: user.companyId, projectId } }) : Promise.resolve([]);
}

type Db = Prisma.TransactionClient | typeof prisma;
const SET_ORDER = [{ year: 'asc' }, { seq: 'asc' }, { revision: 'asc' }] satisfies Prisma.DrawingSetOrderByWithRelationInput[];
const SET_COLUMNS = { id: true, number: true, revision: true, sha256: true, plant: true } as const;
const setOf = (s: { id: string; number: string; revision: number; sha256: string; plant: Prisma.JsonValue }): SetCitato =>
  ({ id: s.id, number: s.number, revision: s.revision, sha256: s.sha256, plant: plantData(s.plant) });

/** The drawing sets issued on the base up to `at` (the RT's issue, the preview): a machine room's, or the lift design's
 *  calculation's, in the order of the year, the number and the revision. */
export async function setsCitati(db: Db, companyId: string, base: Pick<RtBase, 'path' | 'records'>, at: Date): Promise<SetCitato[]> {
  const room = base.records.room, where = room && base.path === 'locale' ? { roomDesignId: room.id } : { calculationId: base.records.calc.id };
  const rows = await db.drawingSet.findMany({ where: { companyId, ...where, createdAt: { lte: at } }, orderBy: SET_ORDER, take: 200, select: SET_COLUMNS });
  return rows.map(setOf);
}

/** The drawing sets an issued RT cites, by the ids it kept, in the same order; null when one of them is not found. */
export async function setsPerId(db: Db, companyId: string, ids: readonly string[]): Promise<SetCitato[] | null> {
  if (!ids.length) return [];
  const rows = await db.drawingSet.findMany({ where: { companyId, id: { in: [...ids] } }, orderBy: SET_ORDER, select: SET_COLUMNS });
  return rows.length === new Set(ids).size ? rows.map(setOf) : null;
}
