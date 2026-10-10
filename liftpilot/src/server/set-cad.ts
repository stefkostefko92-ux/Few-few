import 'server-only';
// An issued drawing set as CAD files, the same set as its PDF: drawn again from what it was made of only when the
// running engines give the same drawing (its stored hash; otherwise refused, as its PDF is), with its views at full
// size and what their sheets draw around them, its sheet 1, its other sheets without a view (the checks of the design)
// and its title block whose attributes are its number, revision and dates (cad/set-export.ts).
import type { SessionUser } from '@/lib/auth';
import { inputViews, surveyViews } from '@/lib/cad/project';
import { paperSheets, setToDwg, setToDxf } from '@/lib/cad/set-export';
import { currentRevision } from '@/lib/tavole/title-block';
import { composeStored } from './drawing-compose';
import { getDrawingSet } from './queries';
import { composeStoredRoom } from './room-compose';
import { firstIssuedAt } from './set-identity';

export const SET_CAD_FORMATS = ['dxf', 'dwg'] as const;
export type SetCadFormat = (typeof SET_CAD_FORMATS)[number];

const MIME: Readonly<Record<SetCadFormat, string>> = { dxf: 'image/vnd.dxf; charset=utf-8', dwg: 'image/vnd.dwg' };

export type SetCad = { ok: true; body: Uint8Array<ArrayBuffer>; mime: string; name: string; setId: string } | { ok: false; error: 'notFound' | 'engineChanged' };

export async function exportDrawingSet(user: SessionUser, id: string, format: SetCadFormat): Promise<SetCad> {
  const s = await getDrawingSet(user, id);
  if (!s) return { ok: false, error: 'notFound' };
  // a whole project's set from its shaft design, a replacement's from its machine room (R0: its number's first issue)
  const first = await firstIssuedAt(user.companyId, s);
  const r = s.roomDesign ? composeStoredRoom({ ...s, firstIssuedAt: first, calculation: s.calculation, roomDesign: s.roomDesign, logo: s.logo, clientLogo: s.clientLogo })
    : s.shaftDesign ? composeStored({ ...s, firstIssuedAt: first, calculation: s.calculation, shaftDesign: s.shaftDesign, logo: s.logo, clientLogo: s.clientLogo }) : null;
  if (!r) return { ok: false, error: 'notFound' };
  if ('ok' in r) return { ok: false, error: r.error === 'engineChanged' ? 'engineChanged' : 'notFound' };
  const views = 'derived' in r ? surveyViews(r.derived, r.input.plant) : inputViews(r.input);
  // the set as its title block names it: its number and revision, its sheets, the hash of its drawing
  const caption = `${r.input.project.name} · DIS. N° ${r.title.number} ${currentRevision(r.title)} · ${r.doc.pages.length} fogli · SHA-256 ${s.sha256.slice(0, 16)} · LiftPilot`;
  // dated as the set's issue (its revision's row), not the download: every download gives the same bytes
  const x = { views, sheet: r.doc.pages[0]?.shapes ?? [], paper: paperSheets(r), title: r.title, caption, date: s.createdAt };
  const body = format === 'dxf' ? new TextEncoder().encode(setToDxf(x)) : new Uint8Array(setToDwg(x));
  return { ok: true, body, mime: MIME[format], name: `tavole-${s.number}${s.revision ? `-R${s.revision}` : ''}.${format}`, setId: s.id };
}
