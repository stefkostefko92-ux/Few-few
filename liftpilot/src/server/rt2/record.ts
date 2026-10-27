import 'server-only';
// The one rule for an issued RT after the owner's model (round 52): its document may be made again only when the running
// engine reproduces its calculation and the RT itself — the same parts read back from the record (inputs, registry,
// plant data, project, company, files as snapshotted) give its stored SHA-256. Otherwise its kept body is what is served,
// and a new revision makes it again.
import { z } from 'zod';
import { rt2InputsSchema } from '@/lib/rt2/input';
import { readCalc, storedCollaudo } from '../records';
import { tipoDi } from '../calcolo-base';
import type { RtRow } from '../rt/queries';
import { allegatiDi, logoImage } from '../rt/record';
import { baseDi, type ProjectRt2 } from './base';
import { composeRt2, type Rt2Composed } from './compose';

const revisioniSchema = z.array(z.object({ mark: z.string(), text: z.string(), date: z.string() }).strict());
const projectSchema = z.object({
  name: z.string(), address: z.string().nullable(), city: z.string().nullable(), province: z.string().nullable(), plantNumber: z.string().nullable(),
  client: z.string().nullable(),
}).strict();

export type Rt2Record = { ok: true; composed: Rt2Composed } | { ok: false; reason: 'engineChanged' | 'unreadable' | 'hash' };

export function rt2Record(r: RtRow): Rt2Record {
  const c = r.calculation, read = c ? readCalc(c) : null;
  if (!c || !read) return { ok: false, reason: 'unreadable' };
  if (!read.same) return { ok: false, reason: 'engineChanged' };
  const inputs = rt2InputsSchema.safeParse(r.inputs), revisions = revisioniSchema.safeParse(r.revisions), project = projectSchema.safeParse(r.projectData);
  const allegati = allegatiDi(r);
  if (!inputs.success || !revisions.success || !project.success || !allegati) return { ok: false, reason: 'unreadable' };
  const C = storedCollaudo(read.values, c.collaudo), pd: ProjectRt2 = project.data;
  const composed = composeRt2({
    number: r.number, revision: r.revision, revisions: revisions.data,
    base: { base: baseDi(read.values, C, r.anagrafica, r.plant), calc: { id: c.id, sha256: c.sha256, createdAt: c.createdAt, tipo: tipoDi(c) } },
    inputs: inputs.data, project: pd, company: { name: r.companyName, logo: logoImage(r.logo), logoSha256: r.logo?.sha256 ?? null }, allegati,
  });
  return composed.sha256 === r.sha256 ? { ok: true, composed } : { ok: false, reason: 'hash' };
}
