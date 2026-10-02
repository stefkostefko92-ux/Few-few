import 'server-only';
// The saved project of a lift as files: the drawing set as a PDF draft (not issued: no number from the counter, no
// record), and every view of it in DXF and DWG at full size. Drawn again from the stored calculation and shaft design,
// only when the running engines reproduce them (otherwise the export is refused, like the documents).
import type { SessionUser } from '@/lib/auth';
import { projectViews } from '@/lib/cad/project';
import { toDwg, toDxf } from '@/lib/cad/export';
import { prisma } from '@/lib/db';
import { analyse } from '@/lib/present/analysis';
import { renderTavole } from '@/lib/report/render';
import { machineOf } from '@/lib/tavole/views';
import { composeFromCalculation } from './drawing-compose';
import { getLiftDesign } from './queries';

export const EXPORT_FORMATS = ['pdf', 'dxf', 'dwg'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** The draft's drawing number in the title block. */
const DRAFT = 'BOZZA';

const MIME: Readonly<Record<ExportFormat, string>> = { pdf: 'application/pdf', dxf: 'image/vnd.dxf; charset=utf-8', dwg: 'image/vnd.dwg' };

export type Exported = { ok: true; body: Uint8Array<ArrayBuffer>; mime: string; name: string; designId: string } | { ok: false; error: 'notFound' | 'engineChanged' };

const slug = (s: string): string => s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').toLowerCase().slice(0, 60) || 'impianto';
/** Initials of a name, for the title block: "Giulia Ferrari" → "G.F.". */
const initials = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 3).map((w) => `${w[0]?.toUpperCase() ?? ''}.`).join('') || '—';

export async function exportLiftDesign(user: SessionUser, id: string, format: ExportFormat): Promise<Exported> {
  const d = await getLiftDesign(user, id);
  if (!d) return { ok: false, error: 'notFound' };
  const set = { number: DRAFT, issuedAt: new Date(), author: initials(user.name), revisions: [] };
  const c = await composeFromCalculation(prisma, user, d.calculation.id, set, true);
  if (!c.ok) return { ok: false, error: c.error === 'engineChanged' ? 'engineChanged' : 'notFound' };
  const date = d.createdAt.toISOString().slice(0, 10), name = `progetto-${slug(d.project.name)}-${date}.${format}`;
  if (format === 'pdf') return { ok: true, body: new Uint8Array(await renderTavole(c.doc)), mime: MIME.pdf, name, designId: d.id };
  const L = c.input.layout, a = analyse(c.input.values), views = projectViews(L, machineOf(a, c.input.plant, L, c.input.marks?.catalog ?? null), L.inputs.room !== null && a.ctx.I.layout !== 'bottom');
  const title = `${d.project.name} · progetto ${d.id} · ${date} · LiftPilot`;
  const body = format === 'dxf' ? new TextEncoder().encode(toDxf(views, title)) : new Uint8Array(toDwg(views, title));
  return { ok: true, body, mime: MIME[format], name, designId: d.id };
}
