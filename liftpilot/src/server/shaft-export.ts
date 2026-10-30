import 'server-only';
// The plan of a saved shaft design as a file: DXF (the CAD file) or SVG (the same view on a paper of its size), drawn
// again from the stored inputs only when the running engine reproduces the stored hash (otherwise refused: the design
// must be redone). One view for both (cad/export.ts shaftPlanView): the main floor's plan with its dimensions at 1:20,
// the brackets' codes at the pitches of the installation's data, as the design's page and sheet 1 count them. Dated as
// the design (its saving), so that every download gives the same bytes.
import type { SessionUser } from '@/lib/auth';
import { PALETTE, concreteTile } from '@/drawing';
import { planToDxf, shaftPlanView } from '@/lib/cad/export';
import { viewSvgFile } from '@/lib/cad/svg-files';
import { pitchesOf } from '@/lib/plant';
import { verifyShaftStored } from '@/lib/shaft-hash';
import { shaftInputsReadSchema } from '@/lib/shaft-input';
import { withPitches } from '@/shaft/brackets';
import { slug } from './download';
import { getShaftDesign } from './queries';
import { dejaVu } from './svg-fonts';

export type ShaftFormat = 'dxf' | 'svg';

export type ShaftFile = { ok: true; body: Uint8Array<ArrayBuffer>; mime: string; name: string; designId: string } | { ok: false; error: 'notFound' | 'engineChanged' };

export async function exportShaftPlan(user: SessionUser, id: string, format: ShaftFormat): Promise<ShaftFile> {
  const d = await getShaftDesign(user, id);
  const inputs = d ? shaftInputsReadSchema.safeParse(d.inputs) : null;
  if (!d || !inputs?.success) return { ok: false, error: 'notFound' };
  const stored = verifyShaftStored(inputs.data, d.sha256);
  if (!stored.same) return { ok: false, error: 'engineChanged' };
  const date = d.createdAt.toISOString().slice(0, 10), title = `${d.project.name} · progetto del vano ${d.id} · ${date} · SHA-256 ${d.sha256.slice(0, 16)}`;
  const L = withPitches(stored.layout, pitchesOf(d.project.plant)), base = `vano-${slug(d.project.name)}-${date}`;
  if (format === 'dxf') return { ok: true, body: new TextEncoder().encode(planToDxf(L, title, d.createdAt)), mime: 'image/vnd.dxf; charset=utf-8', name: `${base}.dxf`, designId: d.id };
  const art = { palette: PALETTE, patterns: { concrete: concreteTile() }, images: {} };
  return { ok: true, ...(await viewSvgFile(shaftPlanView(L, title), art, { name: `${base}.svg`, under: [], fonts: await dejaVu() })), designId: d.id };
}
