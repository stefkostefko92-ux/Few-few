// The car at its extreme positions in section A-A (UNI EN 81-20:2020, 5.2.5.6–5.2.5.8; registries spazi.*): the refuge
// space on the roof where the car stands at its highest position — the counterweight on its compressed buffer and the
// jump —, as h_refuge measures it; in the pit's detail the car on its compressed buffers, dashed: the platform, the
// safety plank and the apron under the car sill with its bevel. The details dimension, from there, what the checks
// measure with the least each needs: in the headroom the refuge to the ceiling (h_refuge), the balustrade's, the
// crosshead's and the operator's clearances (h_clear); in the pit the lowest parts of the car and the apron over the pit
// floor (p_refuge, p_apron). Pure.
import { chain, edit as E, line, path, type Edit, type Entity, type Pt } from '../drawing';
import { KV_VERT } from './norme-vert';
import { refugePick } from './plan-picks';
import { roofSpaces } from './plan-view';
import type { Section } from './section';
import type { Layout } from './types';

/** The apron's vertical part and its bevel's drop under the car sill [mm] (5.4.5.1). */
const apronDrop = (): number => KV_VERT.apron + KV_VERT.apronBevel * Math.tan((KV_VERT.apronBevelAngle * Math.PI) / 180);

/** The stiles' axes of the sling in the section (section-view.ts stilesOf, repeated so as not to import the view). */
const stileX = (L: Layout): number =>
  (L.frame.kind === 'central' ? L.frame.axis : (L.rails.find((r) => r.kind === 'car')?.y ?? L.car.y + L.car.h / 2));

/** Dashed box with its diagonals: a space for the maintenance person. */
function cross(P: (x: number, z: number) => Pt, x0: number, z0: number, x1: number, z1: number): Entity[] {
  return [path([P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)], true, 'space'), line(P(x0, z0), P(x1, z1), 'space'), line(P(x0, z1), P(x1, z0), 'space')];
}

/** The refuge space on the roof with the car at its highest position, the car floor then at `zHigh`. */
export function refugeHigh(L: Layout, P: (x: number, z: number) => Pt, zHigh: number): Entity[] {
  const { refuge: r } = roofSpaces(L), V = L.inputs.vertical, h = KV_VERT.refugeH[V.topRefuge], roof = zHigh + V.carOutH;
  return [...cross(P, r.y0, roof, r.y1, roof + h), { e: 'mark', at: P((r.y0 + r.y1) / 2 + 60, roof + h * 0.72), sym: 'tri' }];
}

/** The car on its compressed buffers, dashed: the platform, the safety plank and the apron under the sill of each
 *  entrance the cut passes through. */
export function carLowest(L: Layout, P: (x: number, z: number) => Pt, S: Section): Entity[] {
  const I = L.inputs, V = I.vertical, c = L.car, zl = -S.moveDown, out: Entity[] = [];
  const b = (x0: number, z0: number, x1: number, z1: number): Entity => path([P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)], true, 'hidden');
  out.push(b(c.y, zl - V.platform, c.y + c.h, zl));
  const ax = stileX(L), half = KV_VERT.crossheadHalf;
  out.push(b(ax - half, zl - V.frameBelow, ax + half, zl - V.frameBelow + 150));
  const v0 = I.landingDepth + I.sillGap, drop = KV_VERT.apron, bevel = apronDrop() - drop;
  for (const [x, s] of [[v0, 1], [I.D - v0, -1]] as const) {
    if (!L.doors.some((d) => d.wall === (s > 0 ? 'front' : 'rear'))) continue;
    out.push(path([P(x, zl), P(x, zl - drop), P(x + s * KV_VERT.apronBevel, zl - drop - bevel)], false, 'hidden'));
  }
  return out;
}

/** The dimensions of the extreme positions in the headroom's (`top`) and the pit's (`pit`) details. */
export function extremeDims(L: Layout, S: Section, kind: 'top' | 'pit', zf: number): Entity[] {
  const I = L.inputs, V = I.vertical, K = KV_VERT, c = L.car, out: Entity[] = [];
  const inside = (x: number, pts: number[], text: string, edit: Edit | null, from?: (number | undefined)[]): void => {
    const len = Math.abs(pts[1] - pts[0]);
    out.push(chain({ dir: 'y', at: x, pts, text: [text], edit: [edit ? { ...edit, value: len } : null], ...(from ? { from } : {}) }));
  };
  if (kind === 'top') {
    // the car at its highest position: the refuge's height on its roof and, from there to the ceiling, the clearances
    const zH = zf + S.moveUp, roof = zH + V.carOutH, r = roofSpaces(L).refuge, h = K.refugeH[V.topRefuge];
    inside(r.y0 + 70, [roof, roof + h], 'H. Rifugio {v}', refugePick('v.topRefuge', V.topRefuge));
    inside(r.y0 + 180, [roof, S.ceiling], `{v} ≥ ${h}`, E('v.headroom', V.carOutH + S.moveUp));
    if (V.parapet > 0) inside(c.y + c.h - 60, [roof + V.parapet, S.ceiling], `{v} ≥ ${K.headBalustrade}`, E('v.headroom', V.carOutH + V.parapet + S.moveUp));
    inside(stileX(L) - K.crossheadHalf + 40, [zH + V.frameTop, S.ceiling], `{v} ≥ ${K.headShoe}`, E('v.headroom', V.frameTop + S.moveUp));
    const op = L.doors.find((d) => d.wall === 'front' || d.wall === 'rear');
    if (op && V.opTop > V.carOutH + 60) {
      const x = op.wall === 'front' ? c.y + 60 : c.y + c.h - 160;
      inside(x, [zH + V.opTop, S.ceiling], `{v} ≥ ${K.headEquip}`, E('v.headroom', V.opTop + S.moveUp));
    }
    return out;
  }
  // the car on its compressed buffers: its lowest parts (the buffer's plate under the safety plank) and the apron's edge
  // over the pit floor; with no run-by left the buffers' bases no longer move them, the pit does
  const zl = -S.moveDown, runby = S.carRunby >= 0, apron = apronDrop(), need = Math.max(K.pitClear, K.refugeH[V.pitRefuge]);
  inside(stileX(L) + K.crossheadHalf + 60, [S.pitFloor, zl - V.frameBelow], `{v} Parti basse ≥ ${need}`, E('v.carBufferBase', S.carStroke - V.carBufferH));
  if (L.doors.some((d) => d.wall === 'front' || d.wall === 'rear')) {
    const front = L.doors.some((d) => d.wall === 'front'), x = front ? I.landingDepth + I.sillGap + 60 : I.D - I.landingDepth - I.sillGap - 60;
    inside(x, [S.pitFloor, zl - apron], `{v} Grembiule ≥ ${K.apronClear}`,
      runby ? E('v.carBufferBase', S.carStroke - V.frameBelow - V.carBufferH + apron) : E('v.pit', S.carStroke + apron));
  }
  return out;
}
