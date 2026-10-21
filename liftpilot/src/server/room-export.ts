import 'server-only';
// The saved machine room of a replacement as files: the drawing set as a PDF draft (not issued: no number from the
// counter, no record), and the plan and section B-B in DXF and DWG at full size (the sheets and values they name being
// the PDF draft's, which the file names under the plan: cad/project.ts draftCaption). Drawn again from the stored survey
// and calculation only when the running engines reproduce them (otherwise refused, like the documents). Its relazione
// tecnica is the installation's relazione tecnica di modifica (round 49, src/server/rt/): the room's own was retired.
import type { SessionUser } from '@/lib/auth';
import { toDwg, toDxf } from '@/lib/cad/export';
import { draftCaption, surveyViews } from '@/lib/cad/project';
import { prisma } from '@/lib/db';
import { plantData } from '@/lib/plant';
import { renderTavole } from '@/lib/report/render';
import { initialsOf } from '@/lib/tavole/compose';
import { slug } from './download';
import { composeFromRoom, reproduceRoomRecord } from './room-compose';
import { getRoomDesign } from './queries';

export const ROOM_FORMATS = ['pdf', 'dxf', 'dwg'] as const;
export type RoomFormat = (typeof ROOM_FORMATS)[number];

const MIME: Readonly<Record<RoomFormat, string>> = { pdf: 'application/pdf', dxf: 'image/vnd.dxf; charset=utf-8', dwg: 'image/vnd.dwg' };

export type RoomExported = { ok: true; body: Uint8Array<ArrayBuffer>; mime: string; name: string } | { ok: false; error: 'notFound' | 'engineChanged' };

export async function exportRoomDesign(user: SessionUser, id: string, format: RoomFormat): Promise<RoomExported> {
  const r = await getRoomDesign(user, id);
  if (!r) return { ok: false, error: 'notFound' };
  const rep = reproduceRoomRecord(r, r.calculation);
  if (!rep.ok) return { ok: false, error: rep.error === 'engineChanged' ? 'engineChanged' : 'notFound' };
  const date = r.createdAt.toISOString().slice(0, 10), base = `${slug(r.project.name)}-${date}`, pdf = `tavole-sostituzione-${base}.pdf`;
  if (format === 'pdf') {
    // the draft dated as the room's survey (its saving), not the download: every download gives the same bytes
    const c = await composeFromRoom(prisma, user, r.id, { number: 'BOZZA', issuedAt: r.createdAt, author: initialsOf(user.name) || '—', revisions: [] }, true);
    if (!c.ok) return { ok: false, error: c.error === 'engineChanged' ? 'engineChanged' : 'notFound' };
    return { ok: true, body: new Uint8Array(await renderTavole(c.doc, r.createdAt)), mime: MIME.pdf, name: pdf };
  }
  const d = rep.derived, P = plantData(r.project.plant);
  // the plan and the section at full size, lettered for the scale the drawing set prints them at (no sheet 1 in a
  // draft's CAD file: the sheets and values they name are the PDF draft's, named under them)
  const views = surveyViews(d, P);
  if (!views.length) return { ok: false, error: 'notFound' };
  const title = draftCaption(`${r.project.name} · locale macchina ${r.id} · ${date}`, pdf);
  const body = format === 'dxf' ? new TextEncoder().encode(toDxf(views, title, r.createdAt)) : new Uint8Array(toDwg(views, title, r.createdAt));
  return { ok: true, body, mime: MIME[format], name: `locale-macchina-${base}.${format}` };
}
