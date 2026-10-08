// Dimensions of section A-A by view: the whole shaft (pit, travel and the floors' rises by the landings, headroom,
// total height, the counterweight on its buffer and its run-by, its screen), the headroom with the car at the top
// floor, the car at a floor with its heights (and the door's own frame or the linings over the landing doors), the
// pit with buffers, their strokes, where they stand and the counterweight's screen. Each value names what it measures
// and its extension lines start at it: the landings, the walls and the slabs, the operator, the door's lintel, the
// car, the frame, the buffers and their bases, the counterweight. Values are the real ones even where the travel is
// drawn compressed; the overtravels of the car are shown as dashed lines with their symbols. Each height says which
// input its new value changes (edit.ts): a height of the section (v.*), a floor's rise, of the doors, of the linings or
// of the call stations; a refuge space's height by choosing its type.
import { chain, edit as E, line, type Edit, type Entity, type Pt } from '../drawing';
import { bufferType } from './buffers';
import { cwNiche } from './niche';
import { bufferPlan, pitSpace } from './pit';
import { callStationOf } from './callstation';
import { portalOf } from './frame';
import { hasImbotti, marbleHeight } from './imbotti';
import { KV_VERT } from './norme-vert';
import { refugePick } from './plan-picks';
import { detailDims } from './section-details';
import { mapZ, stilesOf, type ZMap } from './section-view';
import { screenOf, type Section } from './section';
import type { Layout } from './types';
import type { BufferType } from './vertical';

export type SectionKind = 'full' | 'top' | 'floor' | 'pit';

const fmt = (v: number): string => String(Math.round(v));

/** Half widths of a buffer in the section (section-buffer.ts): its base, its top. */
const bufferHalf = (t: BufferType): { base: number; top: number } => ({ base: 90, top: t === 'oil' ? 62 : 60 });

type From = readonly (number | null | undefined)[];

export function sectionDims(L: Layout, S: Section, kind: SectionKind, carFloor: number, zmap: ZMap | null): Entity[] {
  const I = L.inputs, V = I.vertical, out: Entity[] = [], Z = (z: number): number => mapZ(zmap, z), T = I.wall;
  const P = (x: number, z: number): Pt => [x, Z(z)];
  const row = { left: 0, right: 0 };
  // the lettering and the edits say the real heights, measured before the travel is drawn shorter
  const real = (pts: number[], text?: (string | null)[], edit?: (Edit | null)[]) => {
    const len = pts.slice(1).map((z, i) => Math.abs(z - pts[i]));
    return {
      pts: pts.map(Z),
      text: len.map((v, i) => { const t = text?.[i]; return t == null ? fmt(v) : t.replace('{v}', fmt(v)); }),
      edit: edit?.map((e, i) => (e ? { ...e, value: len[i] } : null)),
    };
  };
  /** A chain beside the section, in the next row on its side (or in the row given: chains that do not overlap). */
  const side = (s: 'left' | 'right', pts: number[], text?: (string | null)[], edit?: (Edit | null)[], from?: From, at?: number): void => {
    out.push(chain({ dir: 'y', side: s, row: at ?? row[s]++, ...real(pts, text, edit), from }));
  };
  const inside = (x: number, pts: number[], text?: (string | null)[], edit?: (Edit | null)[], from?: From): void => {
    out.push(chain({ dir: 'y', at: x, ...real(pts, text, edit), from }));
  };
  // along the section (the plan's y, never drawn shorter), under it
  let below = 0;
  const under = (pts: number[], text: (string | null)[], edit: Edit[], from?: From): void => {
    out.push(chain({ dir: 'x', side: 'bottom', row: below++, pts, text, edit, from }));
  };
  const zf = S.levels[carFloor] ?? 0, roof = zf + V.carOutH, c = L.car, n = V.floors.length, x0 = c.y, x1 = c.y + c.h;
  // the crosshead's and the safety plank's ends (section-view.ts)
  const stiles = stilesOf(L), [h0, h1] = [Math.min(...stiles) - KV_VERT.crossheadHalf, Math.max(...stiles) + KV_VERT.crossheadHalf];
  // a buffer's stroke: entered, or for a polyurethane pad 90 % of its height (the height takes the change)
  const strokeEdit = (sd: 'car' | 'cw'): Edit => (bufferType(V, sd) === 'pu' ? E(`v.${sd}BufferH`, 0, 1 / KV_VERT.puStroke) : E(`v.${sd}BufferStroke`));
  const bp = bufferPlan(L), carX = bp.rows[0] ?? c.y + c.h / 2, cwAt = bp.spots.find((b) => b.kind === 'cw')?.c[1] ?? L.cw.y + L.cw.h / 2;
  const carB = bufferHalf(bufferType(V, 'car')), cwB = bufferHalf(bufferType(V, 'cw'));
  // the faces the extension lines start at: the front wall's landing face (the shaft's slabs end there), the rear's
  const front = -T, rear = I.D + T;

  if (kind === 'full') {
    // by the landings: each floor's rise; the pit, the travel (its last rise takes a new travel) and the headroom (a new
    // total height); the total
    side('left', S.levels, S.levels.slice(1).map(() => 'Interpiano {v}'), S.levels.slice(1).map((_, i) => E(`f.${i}.rise`)));
    const last = n - 2, before = S.top - (V.floors[last]?.rise ?? 0);
    side('left', [S.pitFloor, 0, S.top, S.ceiling], [`Fossa ${V.pit}`, `Corsa ${S.top}`, `Testata ${V.headroom}`], [E('v.pit'), E(`f.${last}.rise`, -before), E('v.headroom')],
      [front, undefined, undefined, front]);
    side('left', [S.pitFloor, S.ceiling], [`${V.pit + S.top + V.headroom} Altezza Totale Vano`], [E('v.headroom', -(V.pit + S.top))], [front, front]);
  }
  if (kind === 'top' || kind === 'floor') {
    // by the landing: the operator's top, the landing door's clear height (the lintel's underside), the call station's
    // top button
    const fr = portalOf(I), lintel = fr.depth === null ? front : 0;
    side('left', [zf, zf + V.opTop], ['{v} H. Ingombro Max Operatore'], [E('v.opTop')], [undefined, x0 - I.carDoorDepth]);
    side('left', [zf, zf + I.doorHeight], ['{v} H. Luce Porta di piano'], [E('doorHeight')], [undefined, lintel]);
    side('left', [zf, zf + callStationOf(I).height], ['{v} H. Pulsante più alto'], [E('cs.height')], [undefined, front]);
    if (hasImbotti(I)) {
      // over the landing door: the portal's head (or its own frame's) and the top lining up to the marble
      const h = marbleHeight(I);
      side('left', [zf, zf + I.doorHeight + fr.head, zf + h], ['{v}', 'Imb. sup. {v}'], [E('doorHeight', -fr.head), E('imb.top')], [undefined, front, front]);
      side('left', [zf, zf + h], ['{v} H. sotto il marmo'], [E('imb.height')], [undefined, front]);
    } else if (fr.depth !== null) {
      // the door's own frame: its header over the clear opening (in the shaft), the opening in the wall
      side('left', [zf + I.doorHeight, zf + I.doorHeight + fr.head], ['Tel. {v}'], [E('frame.head')], [0, 0]);
      side('left', [zf, zf + I.doorHeight + fr.head], ['{v} H. vano telaio'], [E('doorHeight', -fr.head)], [undefined, front]);
    }
    if (kind === 'top') side('left', [zf, S.ceiling], ['Testata {v}'], [E('v.headroom', -(S.top - zf))], [undefined, front]);
    // by the rear wall: the car's height outside, the frame's top
    side('right', [zf, roof], ['{v} H. Esterno Cabina'], [E('v.carOutH')], [x1, x1]);
    side('right', [zf, zf + V.frameTop], ['{v} Ingombro Arcata'], [E('v.frameTop')], [x1, h1]);
    // inside the car: its clear height, the car door's (from the car's front wall), the platform under its floor
    inside(c.y + c.h / 2 + 40, [zf, zf + V.carH], ['{v} H. Interno Cabina'], [E('v.carH')]);
    inside(c.y + 200, [zf, zf + I.doorHeight], ['{v} H. Luce Porta'], [E('doorHeight')], [null, x0 + I.carWall]);
    inside(c.y + c.h - 60, [zf - V.platform, zf], ['{v} Pianale'], [E('v.platform')]);
  }
  if (kind === 'top') {
    if (V.parapet > 0) side('right', [roof, roof + V.parapet], ['{v} H. Parapetto'], [E('v.parapet')], [x1, x1 - 60]);
    side('right', [roof, S.ceiling], ['{v} Tetto cabina – soffitto'], [E('v.headroom', V.carOutH)], [x1, undefined]);
    // car past the top floor with the counterweight on its compressed buffer: its run-by takes the change
    const up = roof + S.moveUp;
    out.push(line(P(c.y - 60, up), P(c.y + c.h + 60, up), 'hidden'), { e: 'mark', at: P(c.y + c.h + 150, up), sym: 'overUp' });
    inside(c.y + c.h - 120, [roof, up], ['{v} Extracorsa sup.'], [E('v.cwRunby', -(S.cwStroke + S.jump))]);
  }
  if (kind === 'pit' || kind === 'full') {
    const plateCar = -V.frameBelow, low = plateCar - S.moveDown;
    // the car's buffer on its base (the run-by of the car is set by the height of the buffers' plinths), with the car at
    // the lowest floor the run-by over it and the frame under the car's floor (in the pit's detail: the whole section
    // leaves them to it)
    if (kind === 'pit') {
      side('left', [S.pitFloor, S.pitFloor + V.carBufferBase, S.carBufferTop, plateCar, 0], ['{v} Base Ammort.', '{v} Ammort.', '{v} Extracorsa', '{v} Ingombro inf. arcata'],
        [E('v.carBufferBase'), E('v.carBufferH'), E('v.carBufferBase', V.pit - V.frameBelow - V.carBufferH, -1), E('v.frameBelow')],
        [front, carX - carB.base, carX - carB.top, h0, undefined]);
    }
    if (kind === 'pit') {
      side('left', [S.pitFloor, 0], ['Fossa {v}'], [E('v.pit')], [front, undefined]);
      out.push(line(P(c.y - 60, low), P(c.y + c.h + 60, low), 'hidden'), { e: 'mark', at: P(c.y - 170, low), sym: 'overDown' });
      // the car buffer's stroke left of it, the refuge space's height inside it
      inside(carX - carB.top - 110, [S.carBufferTop - S.carStroke, S.carBufferTop], ['Corsa {v}'], [strokeEdit('car')], [carX - carB.top, carX - carB.top]);
      const ps = pitSpace(L);
      inside(ps.y0 + 120, [S.pitFloor, S.pitFloor + KV_VERT.refugeH[V.pitRefuge]], ['H. Rifugio {v}'], [refugePick('v.pitRefuge', V.pitRefuge)]);
      // where the buffers stand from the front wall: the car's row(s) (pit.ts); the counterweight's under its middle at the
      // back (its wall gap moves it, the car keeps its depth), along its wall on a side
      const D = I.D, q = c.h / 4, [r0, r1] = bp.rows, keep = [{ key: 'plan.B', value: L.B }] as const, pf = S.pitFloor;
      if (r1 === undefined) under([0, bp.y, D], ['{v} Ammort. cabina', null], [E('plan.bufY'), E('plan.bufY', D, -1)], [undefined, pf, undefined]);
      else under([0, r0 ?? bp.y, r1, D], ['{v} Ammort. cabina', null, null], [E('plan.bufY', q), E('plan.B', -2 * I.carWall, 2), E('plan.bufY', D - q, -1)], [undefined, pf, pf, undefined]);
      const nd = cwNiche(I, L.cwSide)?.depth ?? 0;
      under([0, cwAt, D], ['{v} Ammort. contrappeso', null], L.cwSide === 'rear'
        ? [E('cwWallGap', D + nd - I.cwDepth / 2, -1, keep), E('cwWallGap', nd - I.cwDepth / 2, 1, keep)]
        : [E('plan.cwBufPos'), E('plan.cwBufPos', D, -1)], [undefined, pf, undefined]);
    }
    // the counterweight's buffer on its base; with the car at the top floor (whole section) its run-by over it and the
    // counterweight itself on the same row; its screen in the pit; its stroke right of it
    const plate = S.pitFloor + S.cwLow + (S.top - zf), cwF = L.cw.y + L.cw.h, screenX = L.cwSide === 'rear' ? L.cw.y - 15 : L.cw.y + L.cw.h + 40;
    side('right', [S.pitFloor, S.pitFloor + V.cwBufferBase, S.cwBufferTop, ...(kind === 'full' ? [plate] : [])], ['{v} Base Ammort.', '{v} Ammort.', ...(kind === 'full' ? ['{v} Extracorsa'] : [])],
      [E('v.cwBufferBase'), E('v.cwBufferH'), ...(kind === 'full' ? [E('v.cwRunby')] : [])], [rear, cwAt + cwB.base, cwAt + cwB.top, ...(kind === 'full' ? [cwF] : [])], 0);
    if (kind === 'full') side('right', [plate, plate + V.cwH], ['{v} H. Ingombro Totale Contrappeso'], [E('v.cwH')], [cwF, cwF], 0);
    row.right = Math.max(row.right, 1);
    side('right', [S.pitFloor, S.pitFloor + screenOf(V)], ['{v} H. Protezione Contrappeso in Fossa'], [E('v.cwScreen')], [rear, screenX]);
    inside(cwAt + cwB.top + 110, [S.cwBufferTop - S.cwStroke, S.cwBufferTop], ['Corsa {v}'], [strokeEdit('cw')], [cwAt + cwB.top, cwAt + cwB.top]);
  }
  // the car at its extreme positions (the refuge's height with the car at its highest), the plate under the sill, the
  // pit's control box, the screen's lower edge (section-details.ts)
  out.push(...detailDims(L, S, kind, carFloor, zmap, row));
  return out;
}
