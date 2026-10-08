import 'server-only';
// The saved project of a lift as files: the drawing set as a PDF draft (not issued: no number from the counter, no
// record), and every view of it in DXF and DWG at full size. Drawn again from the stored calculation, shaft design and
// lift design, only when the running engines reproduce all three (records.ts; otherwise refused, like the documents).
import type { SessionUser } from '@/lib/auth';
import { projectViews } from '@/lib/cad/project';
import { toDwg, toDxf } from '@/lib/cad/export';
import { prisma } from '@/lib/db';
import { analyse } from '@/lib/present/analysis';
import { renderTavole } from '@/lib/report/render';
import { setLayout } from '@/lib/tavole/build';
import { initialsOf } from '@/lib/tavole/compose';
import { belowGeoOf, machineOf, sheetLayoutOf } from '@/lib/tavole/views';
import { composeFromCalculation } from './drawing-compose';
import { slug } from './download';
import { getLiftDesign } from './queries';

export const EXPORT_FORMATS = ['pdf', 'dxf', 'dwg'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** The draft's drawing number in the title block. */
const DRAFT = 'BOZZA';

const MIME: Readonly<Record<ExportFormat, string>> = { pdf: 'application/pdf', dxf: 'image/vnd.dxf; charset=utf-8', dwg: 'image/vnd.dwg' };

export type Exported = { ok: true; body: Uint8Array<ArrayBuffer>; mime: string; name: string; designId: string } | { ok: false; error: 'notFound' | 'engineChanged' };

export async function exportLiftDesign(user: SessionUser, id: string, format: ExportFormat): Promise<Exported> {
  const d = await getLiftDesign(user, id);
  if (!d) return { ok: false, error: 'notFound' };
  const set = { number: DRAFT, issuedAt: new Date(), author: initialsOf(user.name) || '—', revisions: [] };
  const c = await composeFromCalculation(prisma, user, d.calculation.id, set, true);
  if (!c.ok) return { ok: false, error: c.error === 'engineChanged' ? 'engineChanged' : 'notFound' };
  const date = d.createdAt.toISOString().slice(0, 10), name = `progetto-${slug(d.project.name)}-${date}.${format}`;
  if (format === 'pdf') return { ok: true, body: new Uint8Array(await renderTavole(c.doc)), mime: MIME.pdf, name, designId: d.id };
  // the brackets at the pitches of the installation's data, as the PDF draws them (build.ts setLayout)
  const L0 = setLayout(c.input), a = analyse(c.input.values), M = machineOf(a, c.input.plant, L0, c.input.marks?.catalog ?? null), bottom = a.ctx.I.layout === 'bottom';
  // the shaft's views as the sheets draw them: the lift's rope rig in the shaft, the room over it the lift has
  const g = bottom ? belowGeoOf(a, L0, M, c.input.marks?.bottom ?? 'head') : null, L = sheetLayoutOf(a, L0, M, g);
  const views = projectViews(L, M, L.inputs.room !== null && !bottom, g);
  const title = `${d.project.name} · progetto ${d.id} · ${date} · LiftPilot`;
  const body = format === 'dxf' ? new TextEncoder().encode(toDxf(views, title)) : new Uint8Array(toDwg(views, title));
  return { ok: true, body, mime: MIME[format], name, designId: d.id };
}
