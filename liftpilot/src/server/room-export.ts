import 'server-only';
// The saved machine room of a replacement as files: the relazione tecnica, the drawing set as a PDF draft (not issued:
// no number from the counter, no record), and the plan and section B-B in DXF and DWG at full size. Drawn again from
// the stored survey and calculation only when the running engines reproduce them (otherwise refused, like the
// documents).
import type { SessionUser } from '@/lib/auth';
import { toDwg, toDxf } from '@/lib/cad/export';
import { surveyViews } from '@/lib/cad/project';
import { prisma } from '@/lib/db';
import { plantReadSchema } from '@/lib/plant';
import { renderPdf, renderTavole } from '@/lib/report/render';
import { buildTecnica } from '@/lib/report/tecnica';
import { initialsOf } from '@/lib/tavole/compose';
import { slug } from './download';
import { composeFromRoom, reproduceRoomRecord } from './room-compose';
import { getLetterhead, getRoomDesign } from './queries';

export const ROOM_FORMATS = ['relazione', 'pdf', 'dxf', 'dwg'] as const;
export type RoomFormat = (typeof ROOM_FORMATS)[number];

const MIME: Readonly<Record<RoomFormat, string>> = { relazione: 'application/pdf', pdf: 'application/pdf', dxf: 'image/vnd.dxf; charset=utf-8', dwg: 'image/vnd.dwg' };

export type RoomExported = { ok: true; body: Uint8Array<ArrayBuffer>; mime: string; name: string } | { ok: false; error: 'notFound' | 'engineChanged' };

export async function exportRoomDesign(user: SessionUser, id: string, format: RoomFormat): Promise<RoomExported> {
  const r = await getRoomDesign(user, id);
  if (!r) return { ok: false, error: 'notFound' };
  const rep = reproduceRoomRecord(r, r.calculation);
  if (!rep.ok) return { ok: false, error: rep.error === 'engineChanged' ? 'engineChanged' : 'notFound' };
  const date = r.createdAt.toISOString().slice(0, 10), base = `${slug(r.project.name)}-${date}`;
  if (format === 'pdf') {
    const c = await composeFromRoom(prisma, user, r.id, { number: 'BOZZA', issuedAt: new Date(), author: initialsOf(user.name) || '—', revisions: [] }, true);
    if (!c.ok) return { ok: false, error: c.error === 'engineChanged' ? 'engineChanged' : 'notFound' };
    return { ok: true, body: new Uint8Array(await renderTavole(c.doc)), mime: MIME.pdf, name: `tavole-sostituzione-${base}.pdf` };
  }
  const d = rep.derived, plant = plantReadSchema.safeParse(r.project.plant ?? {}), P = plant.success ? plant.data : {};
  if (format === 'relazione') {
    const sets = await prisma.drawingSet.findMany({ where: { companyId: user.companyId, roomDesignId: r.id }, orderBy: [{ seq: 'asc' }, { revision: 'asc' }], select: { number: true, revision: true, sha256: true } });
    const doc = buildTecnica({
      room: { id: r.id, label: r.label, createdAt: r.createdAt, sha256: r.sha256, engineVersion: r.engineVersion, author: r.user?.name ?? null },
      calc: { id: r.calculation.id, label: r.calculation.label, createdAt: r.calculation.createdAt, sha256: r.calculation.sha256, engineVersion: r.calculation.engineVersion, profileId: r.calculation.profileId },
      project: r.project, ...await getLetterhead(user), values: rep.values, survey: rep.survey, derived: d,
      collaudo: rep.collaudo, plant: P, sets, generatedAt: new Date(),
    });
    return { ok: true, body: new Uint8Array(await renderPdf(doc)), mime: MIME.relazione, name: `relazione-tecnica-${base}.pdf` };
  }
  // the plan and the section at full size, lettered for the scale the drawing set prints them at
  const views = surveyViews(d, P);
  if (!views.length) return { ok: false, error: 'notFound' };
  const title = `${r.project.name} · locale macchina ${r.id} · ${date} · LiftPilot`;
  const body = format === 'dxf' ? new TextEncoder().encode(toDxf(views, title)) : new Uint8Array(toDwg(views, title));
  return { ok: true, body, mime: MIME[format], name: `locale-macchina-${base}.${format}` };
}
