import 'server-only';
// The saved project of a lift as files: the drawing set as a PDF draft (not issued: no number from the counter, no
// record) and its pages in SVG, and every view of it in DXF and DWG at full size — its views alone, the sheets and
// values they name being the PDF draft's, which the file names under its first view (cad/project.ts draftCaption). Drawn
// again from the stored calculation, shaft design and lift design, only when the running engines reproduce all three
// (records.ts; otherwise refused, like the documents).
import type { SessionUser } from '@/lib/auth';
import { draftCaption, inputViews } from '@/lib/cad/project';
import { toDwg, toDxf } from '@/lib/cad/export';
import { docSvgFile } from '@/lib/cad/svg-files';
import { prisma } from '@/lib/db';
import { renderTavole } from '@/lib/report/render';
import { initialsOf } from '@/lib/tavole/compose';
import { composeFromCalculation } from './drawing-compose';
import { slug } from './download';
import { getLiftDesign } from './queries';
import { dejaVu } from './svg-fonts';

export const EXPORT_FORMATS = ['pdf', 'dxf', 'dwg', 'svg'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** The draft's drawing number in the title block. */
const DRAFT = 'BOZZA';

/** (SVG: one sheet image/svg+xml, more a ZIP — svg-files.ts names and types the file) */
const MIME: Readonly<Record<Exclude<ExportFormat, 'svg'>, string>> = { pdf: 'application/pdf', dxf: 'image/vnd.dxf; charset=utf-8', dwg: 'image/vnd.dwg' };

export type Exported = { ok: true; body: Uint8Array<ArrayBuffer>; mime: string; name: string; designId: string } | { ok: false; error: 'notFound' | 'engineChanged' };

export async function exportLiftDesign(user: SessionUser, id: string, format: ExportFormat): Promise<Exported> {
  const d = await getLiftDesign(user, id);
  if (!d) return { ok: false, error: 'notFound' };
  // the draft dated as the design (its saving), not the download: every download of the record gives the same bytes
  const set = { number: DRAFT, issuedAt: d.createdAt, author: initialsOf(user.name) || '—', revisions: [] };
  const c = await composeFromCalculation(prisma, user, d.calculation.id, set, true);
  if (!c.ok) return { ok: false, error: c.error === 'engineChanged' ? 'engineChanged' : 'notFound' };
  const date = d.createdAt.toISOString().slice(0, 10), base = `progetto-${slug(d.project.name)}-${date}`, name = `${base}.${format}`;
  if (format === 'pdf') return { ok: true, body: new Uint8Array(await renderTavole(c.doc, d.createdAt)), mime: MIME.pdf, name, designId: d.id };
  // in SVG the PDF draft's pages, sheet 1 and the checks among them (unlike the CAD files below), one file each
  if (format === 'svg') {
    const desc = [`${d.project.name} · progetto ${d.id} · ${date} · LiftPilot`, `BOZZA: gli stessi fogli del PDF ${base}.pdf`];
    return { ok: true, ...(await docSvgFile(c.doc, { base, desc, date: d.createdAt, fonts: await dejaVu() })), designId: d.id };
  }
  // no sheet 1 in a draft's CAD file: the sheets and values its views name are the PDF draft's, named under them
  const views = inputViews(c.input);
  const title = draftCaption(`${d.project.name} · progetto ${d.id} · ${date}`, `${base}.pdf`);
  const body = format === 'dxf' ? new TextEncoder().encode(toDxf(views, title, d.createdAt)) : new Uint8Array(toDwg(views, title, d.createdAt));
  return { ok: true, body, mime: MIME[format], name, designId: d.id };
}
