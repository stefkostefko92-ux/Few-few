// The machine room in the relazione tecnica of a replacement: the room and the shaft under it as surveyed, the drops (with
// a direct drive, how the new sheave's ropes slant to them), where the new machine stands on its support with the
// diverting pulley, its mounts and fixings, what else the survey found, and its plan and section B-B laid out by the
// drawing kernel (the openings in the slab: tecnica-site.ts). Italian. Pure.
import { COND, PALETTE, concreteTile } from '@/drawing';
import { KV_VERT } from '@/shaft/norme-vert';
import { mountsText } from '@/shaft/room-mounts';
import { cropped, surveyView } from '../tavole/views';
import type { MachineSpec } from '@/shaft/machine-room';
import type { RoomDerived } from '../room/derive';
import type { Survey } from '../room/survey';
import { fallSlants, foundText, slantText, supportName } from '../tavole/survey-data';
import { hebNote } from '../tavole/room-rows';
import { lowerKeeping } from './label-case';
import { rinvioRow } from './machine-shape';
import type { ReportBlock, ReportDoc } from './model';

/** The colours, the concrete speckle and the lettering of the views. */
export const TECNICA_DRAWING: NonNullable<ReportDoc['drawing']> = { palette: PALETTE, patterns: { concrete: concreteTile() }, cond: COND, images: {} };

/** The report's text frame [mm] and the most height a view may take. */
const AREA = { x0: 0, y0: 0, x1: 172, y1: 150 };

const WALL: Readonly<Record<string, string>> = { front: 'anteriore', rear: 'posteriore', left: 'sinistra', right: 'destra' };

/** The rows of the room as surveyed and of the new machine in it. */
export function roomRows(s: Survey, d: RoomDerived, fmt: (x: number, dp?: number) => string): [string, string][] {
  const R = s.room, M = d.M, G = d.G, mm = (x: number): string => `${fmt(Math.round(x), 0)} mm`;
  return [
    ['Locale macchina', `${fmt(R.W, 0)} × ${fmt(R.D, 0)} mm in pianta, altezza libera ${mm(R.H)}${R.ridge > R.H ? `, al colmo ${mm(R.ridge)}` : ''}; soletta sul vano ${mm(R.slab)}`],
    ['Porta e quadro di manovra', `porta ${fmt(R.doorW, 0)} × ${fmt(R.doorH, 0)} mm sulla parete ${WALL[R.doorWall]}; quadro ${fmt(R.panelW, 0)} × ${fmt(R.panelD, 0)} × ${fmt(R.panelH, 0)} mm sulla parete ${WALL[R.panelWall]}`],
    ['Vano sotto il locale', `${fmt(s.shaft.W, 0)} × ${fmt(s.shaft.D, 0)} mm, muri di ${mm(s.shaft.wall)}; il suo angolo interno a ${fmt(R.shaftX, 0)} e ${fmt(R.shaftY, 0)} mm dai muri del locale`],
    ['Calate rilevate (dall’angolo interno del vano)', `funi lato cabina a x ${fmt(s.car.x, 0)}, y ${fmt(s.car.y, 0)} mm; funi lato contrappeso a x ${fmt(s.cw.x, 0)}, y ${fmt(s.cw.y, 0)} mm: distanza ${mm(d.calata.measured)}`],
    // (direct drive: the calculation's drops are the existing sheave's; the new one's falls slant to them — round 36)
    ...calataText(d, fmt),
    ['Posizione dell’argano', `${G && Math.abs(G.sheaveAt - (M.ropeIn + M.D / 2)) > 0.5
      ? 'puleggia di frizione centrata tra le calate esistenti (tiro diretto, come nel calcolo)'
      : 'lato cabina della puleggia di frizione sulla calata della cabina'}; ${G?.dir === -1
      ? `motore verso la calata della cabina${R.motor ? '' : ' (argano girato di 180° dal software: con il motore verso il contrappeso uscirebbe dal locale)'}`
      : 'motore verso il contrappeso'}`],
    // (as sheet 1 names it, its designations kept: UPN 200, SICOR XTE3022 — round 37)
    ['Basamento', `${lowerKeeping(supportName(d, true))}; asse della puleggia di frizione a ${mm(M.axis)} sul pavimento del locale`],
    ...(M.rinvio ? [rinvioRow(M.rinvio, fmt)] : []),
    // the mounts and the fixings (on the existing support kept, the anchors in tension of the bearings pulled up — round
    // 37); the HEB beams' bearings; what else the survey found (round 36)
    ...(G ? [['Antivibranti e fissaggi', mountsText(G, M, { kept: d.site.kept, uplift: d.site.uplift })] as [string, string]] : []),
    ...(d.heb ? [['Putrelle HEB sui muri del vano', hebNote('').text] as [string, string]] : []),
    ['Limitatore, aperture e basamento esistenti (rilievo)', lowerKeeping(foundText(s))],
  ];
}

/** The drops: with a direct drive the surveyed ones beside the existing sheave's diameter the calculation takes, and how
 *  much each fall of the new sheave slants down to them (both alike, or the counterweight's alone with the sheave aligned
 *  with the car's drop) with the least wrap angle of the calculation; else the calculation's drops beside the surveyed. */
function calataText(d: RoomDerived, fmt: (x: number, dp?: number) => string): [string, string][] {
  const { ctx, res } = d.analysis, M = d.M, mm = (x: number): string => `${fmt(Math.round(x), 0)} mm`, off = mm(Math.abs(d.calata.measured - d.calata.calc));
  if (M.Dp > 0 || M.rinvio) return [['Calate della nuova macchina (dal calcolo)', `${mm(d.calata.calc)} (scarto dal rilievo ${off})`]];
  const oldD = ctx.compare && ctx.O.D > 0 ? ctx.O.D : 0, s = fallSlants(d), inward = (x: number): string => (x < 0 ? ' (verso l’interno)' : '');
  const falls = s.aligned
    ? ` allineata alla calata della cabina: il ramo lato cabina scende verticale, quello lato contrappeso inclinato di ${slantText(s.cw)} mm fino alla calata${inward(s.cw)}`
    : `: ogni ramo inclinato di ${slantText(s.car)} mm per lato fino alle calate${inward(s.car)}`;
  return [
    ['Calate esistenti', `rilevate ${mm(d.calata.measured)}, ${oldD ? `coerenti con la puleggia esistente Ø ${fmt(oldD, 0)} del calcolo` : 'confrontate con il calcolo'} (scarto ${off}, al più ${KV_VERT.dropTol} mm)`],
    ['Inclinazione delle funi della nuova puleggia', `nuova puleggia Ø ${fmt(M.D, 0)}${falls}; `
      + `angolo di avvolgimento ${fmt(res.alphaDeg, 1)}° (dal calcolo); i fori nella soletta seguono le funi al loro livello`],
  ];
}

/** The plan and section B-B of the room with the machine M, each under its title; none when a view does not fit. */
export function surveyBlocks(d: RoomDerived, M: MachineSpec): ReportBlock[] {
  const out: ReportBlock[] = [];
  for (const [kind, title] of [['plan', 'Pianta del locale macchina'], ['section', 'Sezione B-B lungo le calate']] as const) {
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
