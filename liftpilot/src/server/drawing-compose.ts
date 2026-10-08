import 'server-only';
// The drawing set of a calculation, built on the server from what the database holds: the calculation's values and
// its shaft design, both reproduced by the running engines (otherwise the set is refused), the data of the
// installation, the project and the company with its current logo. Used by the issue and the revision (live data)
// and by the PDF of a set issued before the sets were kept as files (the snapshots of the stored set). A calculation
// made from the one form of a lift design carries the marks of what the software filled in (the estimated car weight on
// sheet 1) and follows that design (records.ts: all three reproduced); one without it, the standards chosen with it.
import type { Prisma } from '@prisma/client';
import type { SessionUser } from '@/lib/auth';
import { plantReadSchema } from '@/lib/plant';
import type { StoredDesign } from '@/lib/shaft-hash';
import { buildTavole } from '@/lib/tavole/build';
import type { Mismatch } from '@/lib/tavole/data';
import { projectData, storedInput, type ProjectData, type StoredSet } from '@/lib/tavole/compose';
import type { SetRecords, TavoleInput, TavoleRevision } from '@/lib/tavole/input';
import type { TitleData } from '@/lib/tavole/title-block';
import { tavoleHash } from '@/lib/tavole-hash';
import type { DrawingDoc } from '@/drawing';
import { usableLogo } from '@/lib/logo';
import { calcRecord, recordMarks } from './records';

type Tx = Prisma.TransactionClient;

export const DESIGN_SELECT = {
  id: true, label: true, summary: true, inputs: true, source: true, sha256: true, engineVersion: true, profileId: true, createdAt: true, user: { select: { name: true } },
} as const;

/** `machineMismatch`: the data of the installation name a machine other than the one the calculation checked (an issue
 *  only, views.ts machineConflict). */
export type ComposeError = { ok: false; error: 'notFound' | 'noDesign' | 'engineChanged' | 'archived' | 'machineMismatch' };

/** The project as a set takes it: its data, the installation's, the client's logo. */
export const SET_PROJECT = {
  id: true, name: true, address: true, city: true, province: true, plantNumber: true, client: true, plant: true, archivedAt: true,
  clientLogo: { select: { id: true, mime: true, data: true } },
} as const;

type SetProject = ProjectData & { id: string; plant: Prisma.JsonValue; clientLogo: { id: string; mime: string; data: Uint8Array } | null };
type SetHead = { number: string; issuedAt: Date; author: string; revisions: TavoleRevision[]; firstIssuedAt?: Date };

/** What every set takes besides its records, as it is now: the company with its logo, the project's data and the
 *  installation's, the client's logo, the revisions; with the row's columns that keep them. Null: no company. */
export async function setBasis(tx: Tx, user: SessionUser, project: SetProject, set: SetHead) {
  const company = await tx.company.findUnique({ where: { id: user.companyId }, select: { name: true, logo: { select: { id: true, mime: true, data: true } } } });
  if (!company) return null;
  const plant = plantReadSchema.safeParse(project.plant ?? {}), P = plant.success ? plant.data : {}, pd = projectData(project);
  const logo = usableLogo(company.logo), clientLogo = usableLogo(project.clientLogo);
  const stored: StoredSet = {
    number: set.number, createdAt: set.issuedAt, authorInitials: set.author, companyName: company.name, projectData: pd, plant: P,
    revisions: set.revisions.map((x) => ({ mark: x.mark, text: x.text, date: x.date.toISOString() })), firstIssuedAt: set.firstIssuedAt ?? null,
  };
  const row = {
    projectId: project.id, logoId: logo ? company.logo?.id ?? null : null, clientLogoId: clientLogo ? project.clientLogo?.id ?? null : null,
    plant: P as Prisma.InputJsonValue, projectData: pd, companyName: company.name,
  };
  return { stored, logo, clientLogo, row };
}

export interface Composed {
  ok: true;
  projectId: string;
  shaftDesignId: string;
  logoId: string | null;
  clientLogoId: string | null;
  plant: Prisma.InputJsonValue;
  projectData: ProjectData;
  companyName: string;
  doc: DrawingDoc;
  /** what the set was drawn from (values, layout, data of the installation) */
  input: TavoleInput;
  sha256: string;
  pages: number;
}

type StoredCalc = { inputs: unknown; sha256: string; collaudo: unknown; shaftDesign: StoredDesign | null; liftDesign: { inputs: unknown; engineVersion: string } | null };

/** The values of a calculation, the layout of its shaft design and what the documents mark: every record reproduced. */
function reproduce(c: StoredCalc) {
  if (!c.shaftDesign) return { ok: false as const, error: 'noDesign' as const };
  const rec = calcRecord(c);
  if (!rec?.ok || !rec.design) return { ok: false as const, error: 'engineChanged' as const };
  return { ok: true as const, values: rec.values, layout: rec.design.layout, designId: c.shaftDesign.id, marks: recordMarks(rec, c.collaudo) };
}

/** `readOnly`: an export, allowed for an archived project too (an issue is not). */
export async function composeFromCalculation(tx: Tx, user: SessionUser, calculationId: string, set: SetHead, readOnly = false): Promise<Composed | ComposeError> {
  const c = await tx.calculation.findFirst({
    where: { id: calculationId, companyId: user.companyId },
    select: {
      inputs: true, sha256: true, collaudo: true, shaftDesign: { select: DESIGN_SELECT }, liftDesign: { select: { inputs: true, engineVersion: true } },
      project: { select: SET_PROJECT },
    },
  });
  if (!c) return { ok: false, error: 'notFound' };
  if (c.project.archivedAt && !readOnly) return { ok: false, error: 'archived' };
  const r = reproduce(c);
  if (!r.ok) return r;
  const b = await setBasis(tx, user, c.project, set);
  const input = b ? storedInput(r.values, r.layout, b.stored, b.logo, r.marks, b.clientLogo, recordsOf(calculationId, c)) : null;
  if (!b || !input) return { ok: false, error: 'notFound' };
  const { doc } = buildTavole(input);
  return { ok: true, ...b.row, shaftDesignId: r.designId, doc, input, sha256: tavoleHash(doc), pages: doc.pages.length };
}

/** The records a whole project's set cites on sheet 1: its calculation and its shaft design. */
const recordsOf = (calculationId: string, c: { sha256: string; shaftDesign: { id: string; sha256: string } | null }): SetRecords =>
  ({ calc: { id: calculationId, sha256: c.sha256 }, ...(c.shaftDesign ? { design: { id: c.shaftDesign.id, sha256: c.shaftDesign.sha256 } } : {}) });

/**
 * A stored set drawn again from its snapshots, with where its calculation and shaft design disagree; an error when the
 * engines do not reproduce it (hash differs). `firstIssuedAt` of the stored set: the date of its R0 (the date of the
 * row of revision 0; set-identity.ts).
 */
export function composeStored(s: StoredSet & {
  sha256: string;
  calculation: { id: string; inputs: unknown; sha256: string; collaudo: unknown; liftDesign: { inputs: unknown; engineVersion: string } | null };
  shaftDesign: StoredDesign;
  logo: { mime: string; data: Uint8Array } | null;
  clientLogo?: { mime: string; data: Uint8Array } | null;
}): { doc: DrawingDoc; warnings: Mismatch[]; input: TavoleInput; title: TitleData } | ComposeError {
  const r = reproduce({ ...s.calculation, shaftDesign: s.shaftDesign });
  if (!r.ok) return r;
  const input = storedInput(r.values, r.layout, s, usableLogo(s.logo), r.marks, usableLogo(s.clientLogo ?? null), recordsOf(s.calculation.id, { sha256: s.calculation.sha256, shaftDesign: s.shaftDesign }));
  if (!input) return { ok: false, error: 'notFound' };
  const { doc, warnings, title } = buildTavole(input);
  return tavoleHash(doc) === s.sha256 ? { doc, warnings, input, title } : { ok: false, error: 'engineChanged' };
}
