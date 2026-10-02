// The machine room in the relazione tecnica of a replacement: the room and the shaft under it as surveyed, the drops,
// where the new machine stands on its support with the diverting pulley, the openings its ropes need in the slab, and
// its plan and section B-B laid out by the drawing kernel. Italian. Pure.
import { COND, PALETTE, concreteTile } from '@/drawing';
import { ropeWidths, slabHoles } from '@/shaft/machine-room';
import { cropped, surveyView } from '../tavole/views';
import type { MachineSpec } from '@/shaft/machine-room';
import type { RoomDerived } from '../room/derive';
import type { Survey } from '../room/survey';
import { supportName } from '../tavole/survey-data';
import { rinvioRow } from './machine-shape';
import type { ReportBlock, ReportDoc } from './model';

/** The colours, the concrete speckle and the lettering of the views. */
export const TECNICA_DRAWING: NonNullable<ReportDoc['drawing']> = { palette: PALETTE, patterns: { concrete: concreteTile() }, cond: COND, images: {} };

/** The report's text frame [mm] and the most height a view may take. */
const AREA = { x0: 0, y0: 0, x1: 172, y1: 150 };

const WALL: Readonly<Record<string, string>> = { front: 'anteriore', rear: 'posteriore', left: 'sinistra', right: 'destra' };

/** The openings the new machine's ropes (and a pulley dipping into the slab) need, 30 mm clear: their size in plan. */
export function slabOpenings(d: RoomDerived): { length: number; width: number; wheel: boolean }[] {
  if (!d.G) return [];
  const w = ropeWidths(d.M.n, d.M.d);
  return slabHoles(d.M, d.G, d.G.room.slab, d.site.ends).map((h) => ({ length: h.u1 - h.u0, width: 2 * ((h.wheel ? Math.max(w.ropes, w.pulley) : w.ropes) + 30), wheel: h.wheel }));
}

/** The rows of the room as surveyed and of the new machine in it. */
export function roomRows(s: Survey, d: RoomDerived, fmt: (x: number, dp?: number) => string): [string, string][] {
  const R = s.room, M = d.M, G = d.G, mm = (x: number): string => `${fmt(Math.round(x), 0)} mm`;
  return [
    ['Locale del macchinario', `${fmt(R.W, 0)} × ${fmt(R.D, 0)} mm in pianta, altezza libera ${mm(R.H)}${R.ridge > R.H ? `, al colmo ${mm(R.ridge)}` : ''}; soletta sul vano ${mm(R.slab)}`],
    ['Porta e quadro di manovra', `porta ${fmt(R.doorW, 0)} × ${fmt(R.doorH, 0)} mm sulla parete ${WALL[R.doorWall]}; quadro ${fmt(R.panelW, 0)} × ${fmt(R.panelD, 0)} × ${fmt(R.panelH, 0)} mm sulla parete ${WALL[R.panelWall]}`],
    ['Vano sotto il locale', `${fmt(s.shaft.W, 0)} × ${fmt(s.shaft.D, 0)} mm, muri di ${mm(s.shaft.wall)}; il suo angolo interno a ${fmt(R.shaftX, 0)} e ${fmt(R.shaftY, 0)} mm dai muri del locale`],
    ['Calate rilevate (dall\'angolo interno del vano)', `funi lato cabina a x ${fmt(s.car.x, 0)}, y ${fmt(s.car.y, 0)} mm; funi lato contrappeso a x ${fmt(s.cw.x, 0)}, y ${fmt(s.cw.y, 0)} mm: distanza ${mm(d.calata.measured)}`],
    ['Calate della nuova macchina (dal calcolo)', `${mm(d.calata.calc)} (scarto dal rilievo ${mm(Math.abs(d.calata.measured - d.calata.calc))})`],
    ['Posizione dell\'argano', G && Math.abs(G.sheaveAt - (M.ropeIn + M.D / 2)) > 0.5
      ? 'puleggia di trazione centrata tra le calate esistenti (tiro diretto, come nel calcolo)'
      : 'lato cabina della puleggia di trazione sulla calata della cabina; motore verso il contrappeso'],
    ['Basamento', `${supportName(d).toLowerCase()}; asse della puleggia di trazione a ${mm(M.axis)} sul pavimento del locale`],
    ...(M.rinvio ? [rinvioRow(M.rinvio, fmt)] : []),
  ];
}

/** The plan and section B-B of the room with the machine M, each under its title; none when a view does not fit. */
export function surveyBlocks(d: RoomDerived, M: MachineSpec): ReportBlock[] {
  const out: ReportBlock[] = [];
  for (const [kind, title] of [['plan', 'Pianta del locale del macchinario'], ['section', 'Sezione B-B lungo le calate']] as const) {
    const v = ((): ReturnType<typeof surveyView> => {
      try {
        return surveyView(d, kind, AREA, M);
      } catch {
        return null;
      }
    })();
    if (!v) continue;
    const c = cropped(v);
    out.push({ t: 'h3', text: title }, { t: 'plan', shapes: c.shapes, w: c.w, h: c.h, scale: `Scala 1:${c.scale} sul foglio A4 stampato al 100%` });
  }
  return out;
}
