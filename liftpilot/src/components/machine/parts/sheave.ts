// The traction sheave (D 560, four U grooves) with its ropes. Cast in one piece and painted, then turned: the rim,
// the grooves and the hub faces are bright machined metal, the web between them keeps the paint. The six
// lightening holes make the slow turn of the sheave visible.
// Loaded only through the installation's 3D stage (lift3d/boot.ts, lift3d/room.ts).
import * as THREE from 'three/webgpu';
import type { MachineMaterials } from '../materials';
import { DIM, V, P3, bolts, circle, latheZ, mesh, slab } from './common';

const RIM_IN = 0.236;
const WEB = 0.03; // web thickness

/** The grooves on the rim: how many, their pitch and the rope's radius (the machine's own units; the landing page's four
 *  of DIM, an installation's its ropes'). */
export interface Grooves {
  n: number;
  pitch: number;
  ropeR: number;
}
const FOUR: Grooves = { n: DIM.ropes, pitch: DIM.pitch, ropeR: DIM.ropeR };

/** Rim with the grooves: a closed ring profile (radius, axial), so it is turned on its own; at least as wide as with the
 *  four grooves of DIM. */
function rimGeometry({ n: ropes, pitch, ropeR }: Grooves): THREE.BufferGeometry {
  const { rp } = DIM;
  const w = Math.max(ropes * pitch, DIM.ropes * DIM.pitch) + 0.024, gw = Math.min(ropeR + 0.0011, pitch / 2 - 0.0012), rOut = rp + 0.004, bottom = rp - ropeR - 0.0004;
  const pts = [V(0.224, -WEB / 2), V(RIM_IN, -0.027), V(RIM_IN, -w / 2 + 0.004), V(RIM_IN + 0.004, -w / 2), V(rOut - 0.004, -w / 2), V(rOut, -w / 2 + 0.004)];
  for (let i = 0; i < ropes; i++) {
    const yc = -ropes * pitch / 2 + pitch * (i + 0.5);
    pts.push(V(rOut, yc - gw - 0.0012));
    for (let k = 0; k <= 12; k++) {
      const a = (Math.PI * k) / 12;
      pts.push(V(rOut - (rOut - bottom) * Math.pow(Math.sin(a), 0.7), yc - gw * Math.cos(a)));
    }
    pts.push(V(rOut, yc + gw + 0.0012));
  }
  pts.push(V(rOut, w / 2 - 0.004), V(rOut - 0.004, w / 2), V(RIM_IN + 0.004, w / 2), V(RIM_IN, w / 2 - 0.004), V(RIM_IN, 0.027), V(0.224, WEB / 2), V(0.224, -WEB / 2));
  const g = latheZ(pts, 160);
  g.computeTangents(); // the turning marks run round the sheave (materials.ts, machined)
  return g;
}

/** Hub with the fillets into the web (the part inside the web is hidden). */
function hubGeometry(): THREE.BufferGeometry {
  const f = WEB / 2;
  return latheZ([V(0.0001, -0.078), V(0.07, -0.078), V(0.078, -0.07), V(0.078, -0.032), V(0.081, -0.022), V(0.088, -f - 0.002), V(0.096, -f + 0.0005),
    V(0.096, f - 0.0005), V(0.088, f + 0.002), V(0.081, 0.022), V(0.078, 0.032), V(0.078, 0.07), V(0.07, 0.078), V(0.0001, 0.078)], 96);
}

/** Web: a flat ring between hub and rim with six round lightening holes. */
function webGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.absarc(0, 0, 0.242, 0, Math.PI * 2, false);
  const bore = new THREE.Path();
  bore.absarc(0, 0, 0.088, 0, Math.PI * 2, true);
  s.holes.push(bore);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const hole = new THREE.Path();
    hole.absarc(Math.cos(a) * 0.16, Math.sin(a) * 0.16, 0.043, 0, Math.PI * 2, true);
    s.holes.push(hole);
  }
  return slab(s, WEB, 0.004, 40);
}

/** The sheave centred on its own axis (local Z); the caller places it on the output shaft. */
export function sheave(M: MachineMaterials, grooves: Grooves = FOUR): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(rimGeometry(grooves), M.machined), mesh(webGeometry(), M.sheavePaint), mesh(hubGeometry(), M.sheavePaint));
  // shaft end plate clamping the sheave on the output shaft, with six screws
  const plate = latheZ([V(0.0001, 0.078), V(0.062, 0.078), V(0.062, 0.088), V(0.059, 0.091), V(0.0001, 0.091)], 64);
  plate.computeTangents();
  g.add(mesh(plate, M.machined));
  g.add(bolts(M.steel, circle(P3(0, 0, 0.091), 0.042, 6, 'z'), '+z', 0.0075));
  g.add(mesh(new THREE.CircleGeometry(0.009, 24), M.hole, 0, 0, 0.0912)); // centre hole of the shaft end
  return g;
}

function ropePath(z: number): THREE.CatmullRomCurve3 {
  const { rp, yWheel, ropeBottom } = DIM;
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 10; k++) pts.push(P3(-rp, ropeBottom + ((yWheel - ropeBottom) * k) / 10, z));
  for (let k = 1; k < 48; k++) {
    const a = Math.PI - (Math.PI * k) / 48;
    pts.push(P3(rp * Math.cos(a), yWheel + rp * Math.sin(a), z));
  }
  for (let k = 0; k <= 10; k++) pts.push(P3(rp, yWheel - ((yWheel - ropeBottom) * k) / 10, z));
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
}

/** The four ropes over the sheave, down through the floor on both sides. */
export function ropes(M: MachineMaterials): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < DIM.ropes; i++) {
    const z = DIM.zSheave + (i - (DIM.ropes - 1) / 2) * DIM.pitch;
    g.add(mesh(new THREE.TubeGeometry(ropePath(z), 420, DIM.ropeR, 12), M.rope));
  }
  return g;
}
