// The door panels of an entrance, landing or car, telescopic or centre opening, with what hangs and guides them: on
// each panel a hanger plate on its face toward the sill gap, two polyurethane rollers behind it running on the track
// (their tyres show over the plate, the nuts of their axles on it) and a counter-roller under the track, two shoes
// under the panel in the sill's groove. On the leading panel the lock's lever with its two rollers reaching into the
// gap (landing), or the coupler (car): its body on the hanger plate, two vanes hanging in front of the panel that close
// on the landing's rollers, and the clamp of the drive's belt. The fast panels of the car and the landing run on the
// tracks next to each other across the sill gap. The panels have folded, rounded edges. Everything rides with its
// panel. Plan and heights in millimetres. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { DoorLayout } from '@/shaft';
import { Batch, P, onWall, type Point } from './geom';
import type { LiftMaterials, Side } from './materials';
import { CAR_PANEL, LANDING_PANEL, carTracks, landingTracks, trackPlanes, type Tracks } from '@/shaft/sill';

export { CAR_PANEL, LANDING_PANEL, carTracks, landingTracks, trackPlanes, type Tracks };

export interface DoorPanels {
  group: THREE.Group;
  /** opening 0 (closed) … 1 (open) */
  set(k: number): void;
}

/** Over the panels' top [mm]: the running face of the track, the rollers' radius, the hanger plate's top. */
export const TRACK_TOP = 75, ROLLER_R = 34, HANGER_TOP = TRACK_TOP + ROLLER_R + 10;

/** What rides on the leading panel, by the edge of the car's sill at `v0` from the wall: the landing lock's lever and
 *  rollers, or the car's coupler with its vanes and the belt clamp up to the belt's lower strand at `belt` (height),
 *  which runs just in front of the hanger plate (carOperator). The vanes reach from v0 − 14, the lock's rollers up to
 *  v0 − 6: they overlap by 8 mm whatever the sill gap, and the rollers go between the vanes. `du`: a landing door set
 *  apart from its car door carries its lever that far along the wall, so the rollers stay where the coupler is. */
export type Lead = { kind: 'lock'; v0: number; du?: number } | { kind: 'coupler'; v0: number; belt: number };

/** The side of the panels' centre plane their hanger plates are on, toward the sill gap: away from the wall at a
 *  landing (+1), toward the landing on the car (−1). */
export const gapSide = (lead: Lead['kind']): 1 | -1 => (lead === 'lock' ? 1 : -1);

/** The panels' tracks from the wall [mm]: the fast panel's and the slow one's (a centre opening door runs on the fast one). */





export function doorPanels(wall: Side, W: number, D: number, d: DoorLayout, z0: number, tr: Tracks, t: number, material: THREE.Material, M: LiftMaterials, lead: Lead): DoorPanels {
  const group = new THREE.Group(), L = d.width, ov = 20, h = d.height, zt = z0 + h, along = wall === 'front' || wall === 'rear';
  const axis = along ? P(1, 0, 0) : P(0, 1, 0);
  const panels: { mesh: THREE.Mesh; travel: number; base: THREE.Vector3; dir: THREE.Vector3 }[] = [];
  const pt = (u: number, v: number, z: number): Point => {
    const [x, y] = onWall(wall, W, D, u, v);
    return [x, y, z];
  };
  // a panel from a0 to a1 on the track at v; its hanger, shoes and what rides on it, in the panel's own frame
  const add = (a0: number, a1: number, track: number, travel: number, leading: 'low' | 'high' | null): void => {
    const [x0, y0] = onWall(wall, W, D, a0, track), [x1, y1] = onWall(wall, W, D, a1, track + t);
    const du = Math.abs(a1 - a0) / 1000, dt = t / 1000;
    const mesh = new THREE.Mesh(along ? new RoundedBoxGeometry(du, h / 1000, dt, 2, 0.003) : new RoundedBoxGeometry(dt, h / 1000, du, 2, 0.003), material);
    mesh.position.copy(P((x0 + x1) / 2, (y0 + y1) / 2, z0 + h / 2));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const B = new Batch(), vc = track + t / 2, lo = Math.min(a0, a1), hi = Math.max(a0, a1), span = hi - lo;
    // the hanger plate on the panel's face toward the gap, over its top; the rollers behind it on the track, their axles
    // through it with the nuts on its face (the slow panel's further in, so the two panels' do not meet stacked open);
    // the counter-roller under the track
    const s = gapSide(lead.kind), face = vc + s * (t / 2), back = face + s * 3, zr = zt + TRACK_TOP + ROLLER_R;
    // the plate: its top corners cut, a slot between the rollers (the track shows through), bolted to the panel
    const p0 = lo + 30, p1 = hi - 30, zh = zt + HANGER_TOP, um = (lo + hi) / 2;
    const slot = p1 - p0 > 280 ? [[[p0 + 110, zt + 60], [p1 - 110, zt + 60], [p1 - 110, zt + 84], [p0 + 110, zt + 84]] as const] : [];
    B.outline(wall, W, D, [[p0, zt - 40], [p1, zt - 40], [p1, zh - 24], [p1 - 24, zh], [p0 + 24, zh], [p0, zh - 24]], face, back, M.galv, slot);
    for (const u of [p0 + 30, um, p1 - 30]) B.rod(pt(u, back, zt - 20), pt(u, back + s * 5, zt - 20), 8, M.rail, 6);
    const inset = track === tr.slow && d.kind !== 'C2' ? 105 : 75;
    const rollers = span > 2 * inset + 150 ? [lo + inset, hi - inset] : [lo + span / 4, hi - span / 4];
    for (const u of rollers) {
      B.rod(pt(u, vc - 10, zr), pt(u, vc + 10, zr), ROLLER_R, M.roller, 28);
      B.rod(pt(u, vc - 11.5, zr), pt(u, vc + 11.5, zr), 13, M.rail, 16);
      B.rod(pt(u, vc + s * 11.5, zr), pt(u, face, zr), 7, M.rail, 10);
      B.rod(pt(u, back, zr), pt(u, back + s * 6, zr), 10, M.rail, 6);
    }
    const zc = zt + 50 - 14;
    B.rod(pt(um, vc - 8, zc), pt(um, vc + 8, zc), 12, M.roller, 18);
    B.rod(pt(um, vc + s * 8, zc), pt(um, face, zc), 5, M.rail, 8);
    B.rod(pt(um, back, zc), pt(um, back + s * 5, zc), 8, M.rail, 6);
    // shoes in the sill's groove
    for (const u of [lo + 55, hi - 55]) B.wallBox(wall, W, D, u - 30, u + 30, vc - 4.5, vc + 4.5, z0 - 13, z0 + 2, M.rubber);
    if (leading) {
      const e = leading === 'low' ? lo : hi, k = leading === 'low' ? 1 : -1, ue = (a: number, b: number): [number, number] => [e + k * a, e + k * b];
      if (lead.kind === 'lock') {
        // the lock's lever under the hanger plate, its two rollers reaching into the gap between the coupler's vanes
        const du = lead.du ?? 0, [a0, a1] = ue(45, 155);
        B.wallBox(wall, W, D, a0 + du, a1 + du, face, back, zt - 112, zt - 40, M.galv);
        for (const off of [70, 130]) {
          const u = e + k * off + du;
          B.rod(pt(u, back, zt - 70), pt(u, lead.v0 - 18, zt - 70), 6, M.rail, 10);
          B.rod(pt(u, lead.v0 - 20, zt - 70), pt(u, lead.v0 - 6, zt - 70), 16, M.roller, 18);
        }
      } else {
        // the coupler: its body on the hanger plate, the two vanes on it hanging in front of the panel, the pivots of
        // their links on the vanes' outer sides (nothing of the car reaches past the vanes toward the landing)
        const vf = lead.v0 - 14, body = back + s * 8, vm = (vf + body) / 2;
        B.wallBox(wall, W, D, ...ue(20, 180), back, body, zt - 30, zt + 62, M.frame);
        for (const [off, out] of [[38, -1], [155, 1]] as const) {
          B.wallBox(wall, W, D, ...ue(off, off + 8), vf, body, zt - 300, zt + 50, M.galv);
          const side = out < 0 ? off : off + 8;
          for (const z of [zt + 28, zt - 8]) B.rod(pt(e + k * side, vm, z), pt(e + k * (side + out * 3), vm, z), 5, M.rail, 6);
        }
        // the clamp from the hanger plate up to the drive's lower strand
        B.wallBox(wall, W, D, um - 12, um + 12, back, back + s * 4, zt + 100, lead.belt + 3, M.galv);
      }
    }
    const parts = new THREE.Group();
    B.into(parts);
    for (const child of [...parts.children]) {
      if (child instanceof THREE.Mesh) child.geometry.translate(-mesh.position.x, -mesh.position.y, -mesh.position.z);
      mesh.add(child);
    }
    panels.push({ mesh, travel, base: mesh.position.clone(), dir: axis.clone().normalize() });
    group.add(mesh);
  };
  if (d.kind === 'C2') {
    const mid = (d.u0 + d.u1) / 2;
    add(d.u0, mid + ov / 2, tr.fast, -L / 2, 'high');
    add(mid - ov / 2, d.u1, tr.fast, L / 2, null);
  } else if (d.stack === 'low') {
    // the fast panel away from the stack; the slow one next to the stack
    add(d.u1 - L / 2 - ov, d.u1, tr.fast, -L, 'high');
    add(d.u0 - ov, d.u0 + L / 2, tr.slow, -L / 2, null);
  } else {
    add(d.u0, d.u0 + L / 2 + ov, tr.fast, L, 'low');
    add(d.u0 + L / 2, d.u1 + ov, tr.slow, L / 2, null);
  }
  return {
    group,
    set(k) {
      for (const p of panels) p.mesh.position.copy(p.base).addScaledVector(p.dir, (p.travel * k) / 1000);
    },
  };
}
