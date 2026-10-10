// The bedplate the machine stands on and the floor openings of the ropes.
// Loaded only through the installation's 3D stage (src/components/lift3d/boot.ts), lazily.
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { MachineMaterials } from '../materials';
import { DIM, mesh } from './common';

/** The I-beams at `irons` across Z on anti-vibration mounts (rubber between steel plates), joined by end cross members
 *  40 mm past the outer ones: three, the sheave between the last two. */
export function bedplate(M: MachineMaterials, irons: readonly number[]): THREE.Group {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  const fw = 0.035, h = 0.12, tf = 0.01, tw = 0.004;
  s.moveTo(-fw, 0); s.lineTo(fw, 0); s.lineTo(fw, tf); s.lineTo(tw, tf); s.lineTo(tw, h - tf); s.lineTo(fw, h - tf); s.lineTo(fw, h);
  s.lineTo(-fw, h); s.lineTo(-fw, h - tf); s.lineTo(-tw, h - tf); s.lineTo(-tw, tf); s.lineTo(-fw, tf); s.closePath();
  const beam = new THREE.ExtrudeGeometry(s, { depth: 1.52, bevelEnabled: false }).rotateY(Math.PI / 2); // x -0.46 … 1.06
  const plate = new RoundedBoxGeometry(0.12, 0.004, 0.1, 1, 0.0015);
  const rubber = new RoundedBoxGeometry(0.1, 0.013, 0.085, 2, 0.004);
  for (const z of irons) {
    g.add(mesh(beam, M.frame, -0.46, 0.02, z));
    for (const x of [-0.36, 0.95]) g.add(mesh(plate, M.frame, x, 0.002, z), mesh(rubber, M.rubber, x, 0.0105, z), mesh(plate, M.frame, x, 0.018, z));
  }
  const z0 = irons[0] - 0.04, z1 = irons[irons.length - 1] + 0.04, cross = new RoundedBoxGeometry(0.06, 0.1, z1 - z0, 2, 0.006);
  for (const x of [-0.49, 1.09]) g.add(mesh(cross, M.frame, x, 0.08, (z0 + z1) / 2)); // the handwheel dips between the beams
  return g;
}

/** The rope openings in the floor, each with its raised steel curb. */
export function floorOpenings(M: MachineMaterials): THREE.Group {
  const g = new THREE.Group();
  const curb = new THREE.Shape();
  curb.moveTo(-0.045, -0.075); curb.lineTo(0.045, -0.075); curb.lineTo(0.045, 0.075); curb.lineTo(-0.045, 0.075); curb.closePath();
  const inner = new THREE.Path();
  inner.moveTo(-0.028, -0.058); inner.lineTo(-0.028, 0.058); inner.lineTo(0.028, 0.058); inner.lineTo(0.028, -0.058); inner.closePath();
  curb.holes.push(inner);
  const ring = new THREE.ExtrudeGeometry(curb, { depth: 0.022, bevelEnabled: false }).rotateX(-Math.PI / 2);
  const hole = new THREE.PlaneGeometry(0.058, 0.118).rotateX(-Math.PI / 2);
  for (const x of [-DIM.rp, DIM.rp]) {
    g.add(mesh(ring, M.frame, x, 0, DIM.zSheave));
    const dark = new THREE.Mesh(hole, M.hole);
    dark.position.set(x, 0.0015, DIM.zSheave);
    g.add(dark);
  }
  return g;
}
