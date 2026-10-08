// What the machine room's drawings (room-view.ts) take from below the room: the shaft's size and walls, how deep the
// hitches hang (the slab's openings, the ropes in section B-B), the governor, the dimensions that change the rope drop.
// A whole design gives them from its layout (layoutSite); a machine replacement from the survey of its room
// (src/lib/room). Model entities and numbers; pure.
import { chain, circle, edit as E, rect, textWidth, type Box as DrawBox, type Edit, type Entity, type Pt } from '../drawing';
import { calataEdit } from './drop';
import { governorSpot, type GovernorSpot } from './governor';
import type { Rope } from './heb';
import { hitchDepths } from './machine-room';
import { govYEdit } from './plan-governor';
import type { RoomInputs } from './room';
import type { Box } from './room-floor';
import type { Layout } from './types';

export interface RoomSite {
  /** the shaft under the room: its inner width (along x) and depth (along y), its walls [mm] */
  W: number;
  D: number;
  wall: number;
  /** how far below the room's floor the car's and the counterweight's hitches hang: at the ends of the travel and with
   *  the car halfway [mm] */
  ends: readonly (readonly [number, number])[];
  mid: readonly [number, number];
  /** the governor drawn in the plan, and its footprint with its lettering and dimensions (null: nothing drawn); `marks`:
   *  tight boxes of its body, its name and its reference P4 (a lettering placed beside it keeps off them) */
  governor: { entities: Entity[]; box: DrawBox | null; marks?: readonly DrawBox[] };
  /** the governor's rope where it goes through the room's floor, both strands (room axes): the HEB beams keep off it, as
   *  the checks and the 3D lay them; none in a replacement's survey */
  govRopes: readonly Rope[];
  /** the edit of a dimension of the rope drop, `less` shorter (the diverting pulley's dx), `exact`: along an axis only;
   *  `slant`: the true distance along a drop line askew (drop.ts calataEdit) */
  calata: (less: number, exact: boolean, slant?: boolean) => Edit | null;
  /** the drawings may change the calculation's inputs (calc.h) */
  calcEdits: boolean;
  /** the rope drops surveyed in the shaft (from its inner corner of entrance A), dimensioned on the room's plan; null:
   *  the shaft's own plan dimensions them */
  drops: { car: Pt; cw: Pt } | null;
  /** the other pieces lifted in the room besides the new machine [kg] (a replacement's existing machine): the hook's
   *  rated load counts the heaviest (room-hook.ts) */
  pieces?: readonly number[];
  /** the governor's footprint on the floor as the room's checks take it (room-floor.ts Box; missing: none) */
  govFoot?: Box | null;
  /** the car rails' axis across the shaft (y, room axes) the governor's place is given from; missing: none */
  railY?: number | null;
}

/** The site of a whole design: its shaft, its travel, its governor, its plan's edits. */
export function layoutSite(L: Layout): RoomSite {
  const I = L.inputs, H = hitchDepths(L), out: Entity[] = [], marks: DrawBox[] = [], box = I.room ? governor(L, I.room, out, marks) : null;
  return {
    W: I.W, D: I.D, wall: I.wall, ends: H.ends, mid: H.mid, governor: { entities: out, box, marks }, govRopes: I.room ? governorRopes(L, I.room) : [],
    calata: (less, exact, slant) => calataEdit(L, less, exact, slant), calcEdits: true, drops: null, govFoot: I.room ? governorFootprint(L, I.room) : null,
    railY: I.room ? railAxisY(L, I.room) : null,
  };
}

/** The car rails' axis across the shaft (y, room axes) when the governor's place is given from it; null: none. */
export function railAxisY(L: Layout, R: Pick<RoomInputs, 'shaftY'>): number | null {
  const spot = governorSpot(L);
  return spot ? R.shaftY + spot.rail.y : null;
}

/** The governor's rope where it goes through the room's floor, both strands (room axes); none without one placed. */
export const governorRopes = (L: Layout, R: Pick<RoomInputs, 'shaftX' | 'shaftY'>): Rope[] => {
  const spot = governorSpot(L);
  return spot ? [spot.y1, spot.y2].map((y) => ({ at: [R.shaftX + spot.x, R.shaftY + y] as const, r: spot.G.rope })) : [];
};

/** Where the governor stands in the room's plan (room axes): over its rope where the 3D puts it (governor.ts), or — a
 *  cantilever sling, no place worked out — by the car rail opposite the counterweight; null: neither. */
function governorPlace(L: Layout, R: RoomInputs): { spot: GovernorSpot | null; gx: number; gy: number } | null {
  const spot = governorSpot(L);
  if (spot) return { spot, gx: R.shaftX + spot.x, gy: R.shaftY + (spot.y1 + spot.y2) / 2 };
  const railR = L.rails.filter((r) => r.kind === 'car').sort((a, b) => (L.cwSide === 'left' ? b.x - a.x : a.x - b.x))[0];
  return railR ? { spot: null, gx: R.shaftX + railR.x + (railR.dir === 'left' ? 120 : -120), gy: R.shaftY + railR.y + 250 } : null;
}

/** The governor's outline on the floor as the plan draws it (its base, sheave and the strands' openings; the symbol of a
 *  cantilever sling's) [x0, y0, x1, y1], room axes; null: none drawn. */
export function governorFootprint(L: Layout, R: RoomInputs): Box | null {
  const at = governorPlace(L, R);
  if (!at) return null;
  const { spot, gx, gy } = at;
  if (!spot) return [gx - 150, gy - 90, gx + 150, gy + 90];
  const g = spot.G, ys = [gy - g.baseW, gy + g.baseW, gy - g.R - 14, gy + g.R + 14, R.shaftY + spot.y1 - 25, R.shaftY + spot.y2 + 25];
  const half = Math.max(g.baseA, g.half, 25);
  return [gx - half, Math.min(...ys), gx + half, Math.max(...ys)];
}

/** A reference's circle (view.ts tag) at 1:25, the plan's scale, as a box round it [mm]. */
const TAG_R = 1.9 * 25;
const tagBox = (c: Pt): DrawBox => ({ x0: c[0] - TAG_R, y0: c[1] - TAG_R, x1: c[0] + TAG_R, y1: c[1] + TAG_R });

/** The governor over its rope where the 3D puts it (governor.ts): its base, the A-frame's cheeks, the sheave seen from
 *  above with the jaw's housing over it, the two strands through the slab; the model by the rated speed, written
 *  toward the wall it is nearer to, out of the machine's way. Its body's, its name's and its reference's boxes into
 *  `marks` (the name as wide as at 1:25). */
function governor(L: Layout, R: RoomInputs, out: Entity[], marks: DrawBox[]): DrawBox | null {
  const at = governorPlace(L, R), I = L.inputs;
  if (!at) return null;
  const { spot, gx, gy } = at;
  if (spot) {
    const g = spot.G, fw = g.baseW - 6;
    out.push(rect(gx - g.baseA, gy - g.baseW, gx + g.baseA, gy + g.baseW, 'outline', 'paper'));
    for (const sx of [-1, 1]) out.push(rect(gx + sx * 26, gy - fw, gx + sx * 40, gy + fw, 'thin'));
    out.push(rect(gx - g.half, gy - g.R - 14, gx + g.half, gy + g.R + 14, 'outline', 'steel'), rect(gx - 26, gy - 48, gx + 26, gy + 48, 'thin'));
    for (const y of [spot.y1, spot.y2]) {
      const c: Pt = [gx, R.shaftY + y];
      out.push(rect(c[0] - 25, c[1] - 25, c[0] + 25, c[1] + 25, 'thin'), circle(c, g.rope, 'outline', 'steel'));
    }
    const s = gx - R.shaftX < I.W / 2 ? -1 : 1, name = `Limitatore ${g.model}`, p4: Pt = [gx + s * (g.baseA + 200), gy + g.baseW + 230];
    out.push({ e: 'text', at: [gx + s * (g.baseA + 60), gy - 30], text: name, size: 1.6, align: s < 0 ? 'r' : 'l', halo: true });
    out.push({ e: 'tag', at: p4, text: 'P4', to: [gx + s * g.baseA, gy + g.baseW / 2] });
    const bx = Math.max(g.baseA, g.half), by = Math.max(g.baseW, g.R + 14), nx = gx + s * (g.baseA + 60), nw = textWidth(name, { size: 1.6, cond: true }) * 25;
    marks.push({ x0: gx - bx, y0: gy - by, x1: gx + bx, y1: gy + by }, { x0: Math.min(nx, nx + s * nw), y0: gy - 40, x1: Math.max(nx, nx + s * nw), y1: gy + 20 }, tagBox(p4));
    // where it stands, as the shaft's plan dimensions its rope: from the shaft's wall on its side (below it) and its clamped
    // strand from the car rail's axis (on the side away from its name)
    const wallX = R.shaftX + (spot.side === 'left' ? 0 : I.W), ry = R.shaftY + spot.rail.y, sy = R.shaftY + spot.y1, cx = gx - s * (g.baseA + 70);
    out.push(chain({ dir: 'x', pts: [Math.min(wallX, gx), Math.max(wallX, gx)], at: gy - g.baseW - 140, from: spot.side === 'left' ? [sy, gy] : [gy, sy],
      text: ['Fune limitatore {v}'], edit: [E('plan.govX')] }));
    out.push(chain({ dir: 'y', pts: [Math.min(ry, sy), Math.max(ry, sy)], at: cx, from: ry <= sy ? [R.shaftX + spot.rail.x, gx] : [gx, R.shaftX + spot.rail.x],
      text: ['{v} da asse guida'], edit: [govYEdit(spot)] }));
    // its footprint with its lettering and reference (the lettering about 1,6 mm high, 1:50 at most) and the row of its
    // dimension from the shaft's wall under it, with that lettering (the upright one's lettering steps round the others
    // and keeps off the machine itself: room-view.ts)
    return { x0: Math.min(gx - g.baseA - (s < 0 ? 900 : 0), wallX), y0: gy - g.baseW - 340, x1: Math.max(gx + g.baseA + (s > 0 ? 900 : 0), wallX), y1: gy + g.baseW + 330 };
  }
  // a cantilever sling: no place worked out, the governor shown by the car rail opposite the counterweight
  out.push(rect(gx - 150, gy - 90, gx + 150, gy + 90, 'outline', 'paper'), circle([gx, gy], 125, 'thin'));
  out.push({ e: 'tag', at: [gx + 330, gy + 160], text: 'P4', to: [gx + 150, gy] });
  marks.push({ x0: gx - 150, y0: gy - 125, x1: gx + 150, y1: gy + 125 }, tagBox([gx + 330, gy + 160]));
  return { x0: gx - 150, y0: gy - 90, x1: gx + 420, y1: gy + 250 };
}
