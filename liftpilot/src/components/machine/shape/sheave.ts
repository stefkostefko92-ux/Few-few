// The traction sheave of a maker's machine at the calculation's size: pitch diameter D, width E, the grooves of n
// ropes of diameter d; a rim on three curved spokes from the hub, cast in one piece and painted yellow as the maker
// delivers it, the shaft's end plate with its screws. Our own drawing of a three-spoke sheave, sized by the sheet.
// Loaded only through boot.ts (lazy).
import * as THREE from 'three/webgpu';
import type { MachineMaterials } from '../materials';
import { V, P3, bolts, circle, latheZ, mesh, slab } from '../parts/common';

/** Rope pitch on the sheave [m], as the slab's openings take it (shaft/machine-room.ts, ropeWidths). */
const pitchOf = (d: number): number => Math.max(d + 6, 1.7 * d) / 1000;

/** The rim with the grooves: a closed ring profile (radius, axial), turned on its own. */
function rim(rp: number, w: number, n: number, d: number, rIn: number): THREE.BufferGeometry {
  const ropeR = d / 2000, pitch = Math.min(pitchOf(d), (w - 0.012) / n), rOut = rp + ropeR * 0.6 + 0.002, bottom = rp - ropeR - 0.0004, gw = Math.min(ropeR + 0.0011, pitch / 2 - 0.0005);
  const pts = [V(rIn, -w / 2 + 0.004), V(rIn + 0.004, -w / 2), V(rOut - 0.004, -w / 2), V(rOut, -w / 2 + 0.004)];
  for (let i = 0; i < n; i++) {
    const yc = -n * pitch / 2 + pitch * (i + 0.5);
    pts.push(V(rOut, yc - gw - 0.0006));
    for (let k = 0; k <= 12; k++) {
      const a = (Math.PI * k) / 12;
      pts.push(V(rOut - (rOut - bottom) * Math.pow(Math.sin(a), 0.7), yc - gw * Math.cos(a)));
    }
    pts.push(V(rOut, yc + gw + 0.0006));
  }
  pts.push(V(rOut, w / 2 - 0.004), V(rOut - 0.004, w / 2), V(rIn + 0.004, w / 2), V(rIn, w / 2 - 0.004), V(rIn, -w / 2 + 0.004));
  return latheZ(pts, 160);
}

/** One spoke from the hub to the rim, curved, tapering outward; drawn along +X and turned into place. */
function spoke(rh: number, rIn: number, t: number): THREE.BufferGeometry {
  const a0 = 0.5 * rh, a1 = 0.32 * rh, bend = 0.14 * (rIn - rh), x0 = rh * 0.7, x1 = rIn + 0.006, s = new THREE.Shape();
  s.moveTo(x0, -a0);
  s.quadraticCurveTo((x0 + x1) / 2, -a1 + bend, x1, -a1 * 1.6);
  s.lineTo(x1, a1 * 1.6);
  s.quadraticCurveTo((x0 + x1) / 2, a1 + bend, x0, a0);
  s.closePath();
  return slab(s, t, Math.min(0.006, t / 5), 24);
}

/** The sheave centred on its axis (local Z), the rope plane at z = 0. */
export function shapedSheave(M: MachineMaterials, D: number, E: number, n: number, d: number): THREE.Group {
  const g = new THREE.Group(), rp = D / 2000, w = E / 1000, rIn = rp - Math.max(0.032, 0.09 * rp), rh = Math.max(0.055, 0.2 * rp), t = Math.min(0.7 * w, 0.075);
  g.add(mesh(rim(rp, w, n, d, rIn), M.yellow));
  const one = spoke(rh, rIn, t);
  for (let i = 0; i < 3; i++) g.add(mesh(one.clone().rotateZ(Math.PI / 2 + (i * 2 * Math.PI) / 3), M.yellow));
  const hl = w / 2 + 0.01;
  g.add(mesh(latheZ([V(0.0001, -hl), V(rh - 0.006, -hl), V(rh, -hl + 0.006), V(rh, hl - 0.006), V(rh - 0.006, hl), V(0.0001, hl)], 72), M.yellow));
  // the shaft's end plate clamping the sheave on the output shaft, with its screws
  const pr = 0.62 * rh, plate = latheZ([V(0.0001, hl), V(pr, hl), V(pr, hl + 0.01), V(pr - 0.003, hl + 0.013), V(0.0001, hl + 0.013)], 64);
  plate.computeTangents();
  g.add(mesh(plate, M.machined), bolts(M.steel, circle(P3(0, 0, hl + 0.013), pr * 0.68, 6, 'z'), '+z', 0.0075));
  return g;
}
