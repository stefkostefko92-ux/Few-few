import 'server-only';
// The drawing set of a calculation, built on the server from what the database holds: the calculation's values and
// its shaft design, both reproduced by the running engines (otherwise the set is refused), the data of the
// installation, the project and the company with its current logo. Used by the issue and the revision (live data)
// and by the PDF (the snapshots of the stored set). A calculation made from the one form of a lift design carries the
// marks of what the software filled in (the estimated car weight on sheet 1).
import type { Prisma } from '@prisma/client';
import type { SessionUser } from '@/lib/auth';
import { formValuesSchema } from '@/lib/calc-input';
import { calcMarks } from '@/lib/lift-marks';
import { plantSchema } from '@/lib/plant';
import { verifyStored } from '@/lib/snapshot-hash';
import { reproduceDesign } from '@/lib/shaft-hash';
import { buildTavole } from '@/lib/tavole/build';
import type { Mismatch } from '@/lib/tavole/data';
import { projectData, storedInput, type ProjectData, type StoredSet } from '@/lib/tavole/compose';
import type { TavoleInput, TavoleRevision } from '@/lib/tavole/input';
import { tavoleHash } from '@/lib/tavole-hash';
import type { DrawingDoc } from '@/drawing';

type Tx = Prisma.TransactionClient;

export const DESIGN_SELECT = {
  id: true, label: true, summary: true, inputs: true, source: true, sha256: true, engineVersion: true, profileId: true, createdAt: true, user: { select: { name: true } },
} as const;

export type ComposeError = { ok: false; error: 'notFound' | 'noDesign' | 'engineChanged' | 'archived' };

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

const logoOf = (l: { mime: string; data: Uint8Array } | null): { mime: 'image/png' | 'image/jpeg'; data: Uint8Array } | null =>
  l && (l.mime === 'image/png' || l.mime === 'image/jpeg') ? { mime: l.mime, data: l.data } : null;

/** The values of a calculation and the layout of its shaft design, both reproduced by the running engines. */
function reproduce(c: { inputs: unknown; sha256: string; shaftDesign: Parameters<typeof reproduceDesign>[0] | null }) {
  if (!c.shaftDesign) return { ok: false as const, error: 'noDesign' as const };
  const values = formValuesSchema.safeParse(c.inputs);
  if (!values.success || !verifyStored(values.data, c.sha256).same) return { ok: false as const, error: 'engineChanged' as const };
  const design = reproduceDesign(c.shaftDesign);
  if (!design) return { ok: false as const, error: 'engineChanged' as const };
  return { ok: true as const, values: values.data, layout: design.layout, designId: c.shaftDesign.id };
}

/** `readOnly`: an export, allowed for an archived project too (an issue is not). */
export async function composeFromCalculation(
  tx: Tx, user: SessionUser, calculationId: string, set: { number: string; issuedAt: Date; author: string; revisions: TavoleRevision[] }, readOnly = false,
): Promise<Composed | ComposeError> {
  const c = await tx.calculation.findFirst({
    where: { id: calculationId, companyId: user.companyId },
    select: {
      inputs: true, sha256: true, shaftDesign: { select: DESIGN_SELECT }, liftDesign: { select: { inputs: true } },
      project: {
        select: {
          id: true, name: true, address: true, city: true, province: true, plantNumber: true, client: true, plant: true, archivedAt: true,
          clientLogo: { select: { id: true, mime: true, data: true } },
        },
      },
    },
  });
  if (!c) return { ok: false, error: 'notFound' };
  if (c.project.archivedAt && !readOnly) return { ok: false, error: 'archived' };
  const r = reproduce(c);
  if (!r.ok) return r;
  const company = await tx.company.findUnique({ where: { id: user.companyId }, select: { name: true, logo: { select: { id: true, mime: true, data: true } } } });
  if (!company) return { ok: false, error: 'notFound' };
  const plant = plantSchema.safeParse(c.project.plant ?? {}), pd = projectData(c.project), logo = logoOf(company.logo), clientLogo = logoOf(c.project.clientLogo);
  const stored: StoredSet = {
    number: set.number, createdAt: set.issuedAt, authorInitials: set.author, companyName: company.name, projectData: pd,
    plant: plant.success ? plant.data : {}, revisions: set.revisions.map((x) => ({ mark: x.mark, text: x.text, date: x.date.toISOString() })),
  };
  const input = storedInput(r.values, r.layout, stored, logo, calcMarks(c.liftDesign, c.sha256), clientLogo);
  if (!input) return { ok: false, error: 'notFound' };
  const { doc } = buildTavole(input);
  return {
    ok: true, projectId: c.project.id, shaftDesignId: r.designId, logoId: logo ? company.logo?.id ?? null : null, clientLogoId: clientLogo ? c.project.clientLogo?.id ?? null : null,
    plant: (plant.success ? plant.data : {}) as Prisma.InputJsonValue, projectData: pd, companyName: company.name, doc, input, sha256: tavoleHash(doc), pages: doc.pages.length,
  };
}

/**
 * A stored set drawn again from its snapshots, with where its calculation and shaft design disagree; an error when the
 * engines do not reproduce it (hash differs).
 */
export function composeStored(s: StoredSet & {
  sha256: string;
  calculation: { inputs: unknown; sha256: string; liftDesign: { inputs: unknown } | null };
  shaftDesign: Parameters<typeof reproduceDesign>[0];
  logo: { mime: string; data: Uint8Array } | null;
  clientLogo?: { mime: string; data: Uint8Array } | null;
}): { doc: DrawingDoc; warnings: Mismatch[] } | ComposeError {
  const r = reproduce({ inputs: s.calculation.inputs, sha256: s.calculation.sha256, shaftDesign: s.shaftDesign });
  if (!r.ok) return r;
  const input = storedInput(r.values, r.layout, s, logoOf(s.logo), calcMarks(s.calculation.liftDesign, s.calculation.sha256), logoOf(s.clientLogo ?? null));
  if (!input) return { ok: false, error: 'notFound' };
  const { doc, warnings } = buildTavole(input);
  return tavoleHash(doc) === s.sha256 ? { doc, warnings } : { ok: false, error: 'engineChanged' };
}
