// The diverting pulley in section B-B of the machine room (room-view.ts): the pulley with its centre lines; on its own
// stand over the slab's opening when its axle is above the slab, hung under the slab when it is below (in the bedplate
// its plates hold it: rinvio-view.ts); its diameter beside it, over the floor next to it or under the slab inside the
// shaft, with a leader to its rim. Model entities.
import { circle, line, rect, type Entity, type Pt } from '../drawing';
import type { MachineSpec, RoomGeo } from './machine-room';

/** `s0`, `s1`: the shaft's walls along the drop line, which the lettering under the slab keeps within. */
export function pulleySection(M: MachineSpec, G: RoomGeo, s0: number, s1: number): Entity[] {
  const R = G.room, pu = G.pulleyAt, zp = G.pulleyZ, r = M.Dp / 2, out: Entity[] = [], b = M.base ?? 0;
  out.push(circle([pu, zp], r, 'outline', 'paper'), circle([pu, zp], r - M.d, 'thin'), circle([pu, zp], r * 0.28, 'outline', 'steel'));
  out.push(line([pu - r - 40, zp], [pu + r + 40, zp], 'axis'), line([pu, zp - r - 40], [pu, zp + r + 40], 'axis'));
  const framed = M.rinvio?.on === 'frame' && zp - r >= 0;
  if (!framed && zp > -R.slab) {
    const u0 = pu - r - 110, u1 = pu + r + 110;
    out.push(rect(u0, b, u1, b + 140, 'outline'), rect(pu - 80, Math.min(b, zp - 70), pu + 80, Math.max(b + 140, zp + 70), 'thin'));
    for (const x of [u0, u1 - 70]) out.push(rect(x, b, x + 70, b + 12, 'outline', 'steel'));
  } else if (!framed) out.push(rect(pu - 140, -R.slab - 14, pu + 140, -R.slab, 'outline', 'steel'), rect(pu - 80, zp - 70, pu + 80, -R.slab - 14, 'thin'));
  const text = `Ø${M.Dp}`;
  if (zp - r >= 0) {
    // over the floor: beside the pulley at its axle's height, on the side with room for it
    const right = pu + r + 330 < s1 + 200;
    out.push({ e: 'text', at: [right ? pu + r + 50 : pu - r - 50, zp - 40], text, size: 2.2, align: right ? 'l' : 'r', halo: true });
    return out;
  }
  // under the slab inside the shaft, never across its walls: past the pulley, before it, else by the far wall; a leader
  // to the rim
  const zt = Math.min(zp - r, -R.slab) - 160, xr = pu + r + 60, xl = pu - r - 60;
  const [xt, at]: [number, 'l' | 'r'] = xr + 360 < s1 - 40 ? [xr, 'l'] : xl - 360 > s0 + 40 && xl < s1 - 40 ? [xl, 'r'] : [s1 - 60, 'r'];
  const rim: Pt = [pu + (xt > pu ? 1 : -1) * r * Math.SQRT1_2, zp - r * Math.SQRT1_2];
  out.push(line(rim, [xt, zt + 90], 'dim'), { e: 'text', at: [xt, zt], text, size: 2.2, align: at, halo: true });
  return out;
}
