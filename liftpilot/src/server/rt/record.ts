import 'server-only';
// The one rule for an issued relazione tecnica di modifica (RT plan §7, «One rule»; src/server/records.ts for the other
// records): its document may be made again only when the running engines reproduce its base (the machine room or the
// lift design, with their calculation and shaft design) and the RT itself — the same parts read back from the record
// (inputs, registry, project, plant, company, files as snapshotted, the drawing sets it cites by id) give its stored
// SHA-256. Otherwise its kept body (TechnicalReportPdf) is what is served, and a new revision makes it again.
import { z } from 'zod';
import type { SheetImage } from '@/drawing';
import { usableLogo } from '@/lib/logo';
import { plantData } from '@/lib/plant';
import { anagraficaData } from '@/lib/rt/anagrafica';
import { rtInputsSchema } from '@/lib/rt/input';
import { COMPONENTI, type Componente, type RtAllegato } from '@/lib/rt/types';
import { prisma } from '@/lib/db';
import { liftBase, roomBase } from './base';
import { composeRt, setsCitati, setsPerId, type ProjectDataRt, type RtComposed, type RtParts } from './compose';
import type { RtRow } from './queries';

const revisioniSchema = z.array(z.object({ mark: z.string(), text: z.string(), date: z.string() }).strict());
const projectDataSchema = z.object({
  name: z.string(), address: z.string().nullable(), city: z.string().nullable(), province: z.string().nullable(), plantNumber: z.string().nullable(),
  client: z.string().nullable(),
}).strict();

/** The drawing sets cited, by id; null: an RT issued before migration 28 (development databases only), read by time. */
const citatiSchema = z.array(z.string().min(1)).max(200).nullable();
const MIMES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const isComponente = (c: unknown): c is Componente => COMPONENTI.some((k) => k === c);

/** The company's logo as the document draws it (base64), when the renderers may decode it. */
export function logoImage(l: { mime: string; data: Uint8Array } | null | undefined): SheetImage | null {
  const ok = usableLogo(l);
  return ok ? { mime: ok.mime, data: Buffer.from(ok.data).toString('base64') } : null;
}

/** The files of an issued RT as it snapshotted them. */
export function allegatiDi(r: Pick<RtRow, 'attachments'>): RtAllegato[] | null {
  const out: RtAllegato[] = [];
  for (const a of r.attachments) {
    const mime = MIMES.find((m) => m === a.attachment.mime);
    if (!mime) return null;
    out.push({ position: a.position, attachmentId: a.attachmentId, kind: a.kind, title: a.title, component: isComponente(a.component) ? a.component : null,
      sha256: a.sha256, pages: a.pages, mime });
  }
  return out;
}

export type RtPartsRead = { ok: true; parts: RtParts } | { ok: false; reason: 'engineChanged' | 'unreadable' };

/** The parts of an issued RT read back, its base reproduced by the running engines. */
export async function partsOf(r: RtRow): Promise<RtPartsRead> {
  const b = r.roomDesign ? roomBase(r.roomDesign) : r.liftDesign ? liftBase(r.liftDesign) : null;
  if (!b) return { ok: false, reason: 'unreadable' };
  if (!b.ok) return { ok: false, reason: 'engineChanged' };
  const inputs = rtInputsSchema.safeParse(r.inputs), revisions = revisioniSchema.safeParse(r.revisions), project = projectDataSchema.safeParse(r.projectData);
  const allegati = allegatiDi(r), cited = citatiSchema.safeParse(r.citedSetIds);
  if (!inputs.success || !revisions.success || !project.success || !allegati || !cited.success) return { ok: false, reason: 'unreadable' };
  const sets = cited.data ? await setsPerId(prisma, r.companyId, cited.data) : await setsCitati(prisma, r.companyId, b.base, r.createdAt);
  if (!sets) return { ok: false, reason: 'unreadable' };
  const pd: ProjectDataRt = project.data;
  return { ok: true, parts: {
    number: r.number, revision: r.revision, revisions: revisions.data, base: b.base, inputs: inputs.data, anagrafica: anagraficaData(r.anagrafica),
    plant: plantData(r.plant), project: pd, company: { name: r.companyName, logo: logoImage(r.logo), logoSha256: r.logo?.sha256 ?? null }, allegati, sets,
  } };
}

export type RtRecord = { ok: true; composed: RtComposed; parts: RtParts } | { ok: false; reason: 'engineChanged' | 'unreadable' | 'hash' };

/** The rule: the RT made again from its record, and whether it gives its stored SHA-256. */
export async function rtRecord(r: RtRow): Promise<RtRecord> {
  const p = await partsOf(r);
  if (!p.ok) return p;
  const composed = composeRt(p.parts);
  return composed.sha256 === r.sha256 ? { ok: true, composed, parts: p.parts } : { ok: false, reason: 'hash' };
}
