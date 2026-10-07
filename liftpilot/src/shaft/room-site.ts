// What the machine room's drawings (room-view.ts) take from below the room: the shaft's size and walls, how deep the
// hitches hang (the slab's openings, the ropes in section B-B), the governor, the dimensions that change the rope drop.
// A whole design gives them from its layout (layoutSite); a machine replacement from the survey of its room
// (src/lib/room). Model entities and numbers; pure.
import { chain, circle, edit as E, rect, type Box as DrawBox, type Edit, type Entity, type Pt } from '../drawing';
import { calataEdit } from './drop';
import { governorSpot, type GovernorSpot } from './governor';
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
  /** the governor drawn in the plan, and its footprint with its lettering (null: nothing drawn) */
  governor: { entities: Entity[]; box: DrawBox | null };
  /** the edit of a dimension of the rope drop, `less` shorter (the diverting pulley's dx), `exact`: along an axis only */
  calata: (less: number, exact: boolean) => Edit | null;
  /** the drawings may change the calculation's inputs (calc.h) */
  calcEdits: boolean;
  /** the rope drops surveyed in the shaft (from its inner corner of entrance A), dimensioned on the room's plan; null:
   *  the shaft's own plan dimensions them */
  drops: { car: Pt; cw: Pt } | null;
}

/** The site of a whole design: its shaft, its travel, its governor, its plan's edits. */
export function layoutSite(L: Layout): RoomSite {
  const I = L.inputs, H = hitchDepths(L), out: Entity[] = [], box = I.room ? governor(L, I.room, out) : null;
  return {
    W: I.W, D: I.D, wall: I.wall, ends: H.ends, mid: H.mid, governor: { entities: out, box },
    calata: (less, exact) => calataEdit(L, less, exact), calcEdits: true, drops: null,
  };
}

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

/** The governor over its rope where the 3D puts it (governor.ts): its base, the A-frame's cheeks, the sheave seen from
 *  above with the jaw's housing over it, the two strands through the slab; the model by the rated speed, written
 *  toward the wall it is nearer to, out of the machine's way. */
function governor(L: Layout, R: RoomInputs, out: Entity[]): DrawBox | null {
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
    const s = gx - R.shaftX < I.W / 2 ? -1 : 1;
    out.push({ e: 'text', at: [gx + s * (g.baseA + 60), gy - 30], text: `Limitatore ${g.model}`, size: 1.6, align: s < 0 ? 'r' : 'l', halo: true });
    out.push({ e: 'tag', at: [gx + s * (g.baseA + 200), gy + g.baseW + 230], text: 'P4', to: [gx + s * g.baseA, gy + g.baseW / 2] });
    // where it stands, as the shaft's plan dimensions its rope: from the shaft's wall on its side (below it) and its clamped
    // strand from the car rail's axis (on the side away from its name)
    const wallX = R.shaftX + (spot.side === 'left' ? 0 : I.W), ry = R.shaftY + spot.rail.y, sy = R.shaftY + spot.y1, cx = gx - s * (g.baseA + 70);
    out.push(chain({ dir: 'x', pts: [Math.min(wallX, gx), Math.max(wallX, gx)], at: gy - g.baseW - 140, from: spot.side === 'left' ? [sy, gy] : [gy, sy],
      text: ['Fune limitatore {v}'], edit: [E('plan.govX')] }));
    out.push(chain({ dir: 'y', pts: [Math.min(ry, sy), Math.max(ry, sy)], at: cx, from: ry <= sy ? [R.shaftX + spot.rail.x, gx] : [gx, R.shaftX + spot.rail.x],
      text: ['{v} da asse guida'], edit: [govYEdit(spot)] }));
    // its footprint with its lettering and reference (the lettering about 1,6 mm high, 1:50 at most)
    return { x0: gx - g.baseA - (s < 0 ? 900 : 0), y0: gy - g.baseW - 60, x1: gx + g.baseA + (s > 0 ? 900 : 0), y1: gy + g.baseW + 330 };
  }
  // a cantilever sling: no place worked out, the governor shown by the car rail opposite the counterweight
  out.push(rect(gx - 150, gy - 90, gx + 150, gy + 90, 'outline', 'paper'), circle([gx, gy], 125, 'thin'));
  out.push({ e: 'tag', at: [gx + 330, gy + 160], text: 'P4', to: [gx + 150, gy] });
  return { x0: gx - 150, y0: gy - 90, x1: gx + 420, y1: gy + 250 };
}
