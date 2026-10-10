// The worm gearbox: a cast housing with the worm below the wheel, the round wheel covers bolted on both faces,
// the worm bearing caps at the ends, stiffening ribs, a cast foot bolted to the bedplate, the lifting eye, the
// breather and the oil sight glass.
// Loaded only through the installation's 3D stage (src/components/lift3d/boot.ts), lazily.
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { MachineMaterials } from '../materials';
import { DIM, V, P3, bolts, circle, cylY, cylZ, hexZ, latheX, latheZ, mesh, slab } from './common';

const HALF = 0.2; // housing half width (X) and wheel chamber radius, over the rounded edges
const FACE = 0.145; // housing faces at z = ±FACE
const BASE = 0.175; // housing bottom, on the foot
const B = 0.012; // edge radius of the casting

/** Housing seen along Z: the worm chamber below, the round wheel chamber on top ("tombstone"). */
function housingGeometry(): THREE.BufferGeometry {
  const w = HALF - B, y0 = BASE + B, f = 0.02;
  const s = new THREE.Shape();
  s.moveTo(-w + f, y0);
  s.lineTo(w - f, y0);
  s.absarc(w - f, y0 + f, f, -Math.PI / 2, 0, false);
  s.lineTo(w, DIM.yWheel);
  s.absarc(0, DIM.yWheel, w, 0, Math.PI, false);
  s.lineTo(-w, y0 + f);
  s.absarc(-w + f, y0 + f, f, Math.PI, Math.PI * 1.5, false);
  return slab(s, 2 * FACE, B, 48);
}

/** Front wheel cover with the output bearing boss (the sheave side). */
function frontCover(): THREE.BufferGeometry {
  return latheZ([V(0.0001, FACE - 0.005), V(0.17, FACE - 0.005), V(0.17, FACE + 0.016), V(0.166, FACE + 0.02), V(0.114, FACE + 0.02), V(0.105, FACE + 0.028),
    V(0.105, 0.2), V(0.1, 0.205), V(0.088, 0.205), V(0.085, 0.209), V(0.085, 0.232), V(0.081, 0.236), V(0.0001, 0.236)], 96);
}
/** Rear wheel cover with the bearing cap. */
function rearCover(): THREE.BufferGeometry {
  return latheZ([V(0.0001, FACE - 0.005), V(0.17, FACE - 0.005), V(0.17, FACE + 0.016), V(0.166, FACE + 0.02), V(0.08, FACE + 0.02), V(0.074, FACE + 0.026),
    V(0.074, FACE + 0.04), V(0.07, FACE + 0.044), V(0.0001, FACE + 0.044)], 96).rotateY(Math.PI);
}
/** Worm bearing cap on the +X end (mirrored for the other end). */
function bearingCap(): THREE.BufferGeometry {
  const x = HALF - 0.004;
  return latheX([V(0.0001, x), V(0.075, x), V(0.075, x + 0.018), V(0.071, x + 0.022), V(0.05, x + 0.022), V(0.046, x + 0.03), V(0.046, x + 0.036),
    V(0.043, x + 0.039), V(0.0001, x + 0.039)], 64);
}

/** Tapered stiffening rib on the +X face (mirrored for the other face). */
function ribGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.004, 0); s.lineTo(0.034, 0); s.quadraticCurveTo(0.012, 0.1, 0.008, 0.26); s.lineTo(-0.004, 0.26); s.closePath();
  return slab(s, 0.016, 0.003, 12);
}

export function gearbox(M: MachineMaterials): THREE.Group {
  const { yWorm, yWheel } = DIM;
  const g = new THREE.Group();
  g.add(mesh(housingGeometry(), M.paint));
  g.add(mesh(new RoundedBoxGeometry(0.5, 0.04, 0.43, 2, 0.008), M.paint, 0, DIM.yBed + 0.02, 0)); // cast foot
  g.add(bolts(M.steel, [P3(-0.22, DIM.yBed + 0.04, -0.18), P3(-0.22, DIM.yBed + 0.04, 0.18), P3(0.22, DIM.yBed + 0.04, -0.18), P3(0.22, DIM.yBed + 0.04, 0.18)], '+y', 0.011));
  const rib = ribGeometry();
  for (const z of [-0.105, 0.105]) {
    g.add(mesh(rib, M.paint, HALF, BASE, z));
    g.add(mesh(rib.clone().rotateY(Math.PI), M.paint, -HALF, BASE, z));
  }
  // wheel covers, twelve bolts each
  g.add(mesh(frontCover(), M.paint, 0, yWheel, 0), mesh(rearCover(), M.paint, 0, yWheel, 0));
  g.add(bolts(M.steel, circle(P3(0, yWheel, FACE + 0.02), 0.145, 12, 'z'), '+z'), bolts(M.steel, circle(P3(0, yWheel, -FACE - 0.02), 0.145, 12, 'z'), '-z'));
  const shaft = cylZ(0.05, 0.04, 48);
  shaft.computeTangents();
  g.add(mesh(shaft, M.machined, 0, yWheel, 0.25)); // output shaft into the sheave hub
  g.add(mesh(new THREE.TorusGeometry(0.056, 0.005, 12, 48), M.rubber, 0, yWheel, 0.237)); // shaft seal
  // worm bearing caps, six bolts each
  const cap = bearingCap();
  g.add(mesh(cap, M.paintDark, 0, yWorm, 0), mesh(cap.clone().rotateY(Math.PI), M.paintDark, 0, yWorm, 0));
  g.add(bolts(M.steel, circle(P3(HALF + 0.018, yWorm, 0), 0.062, 6, 'x'), '+x', 0.0075), bolts(M.steel, circle(P3(-HALF - 0.018, yWorm, 0), 0.062, 6, 'x'), '-x', 0.0075));
  // lifting eye on top of the wheel chamber
  const top = yWheel + HALF;
  g.add(mesh(cylY(0.019, 0.008, 24), M.steel, 0, top + 0.002, 0), mesh(new THREE.TorusGeometry(0.027, 0.0075, 16, 40), M.steel, 0, top + 0.041, 0));
  // breather on the shoulder of the wheel chamber, turned to the surface
  const a = Math.PI / 3, br = new THREE.Group();
  br.position.set(Math.cos(a) * HALF, yWheel + Math.sin(a) * HALF, 0.07);
  br.rotation.z = a - Math.PI / 2;
  br.add(mesh(hexZ(0.014, 0.012).rotateX(Math.PI / 2), M.steel, 0, 0.004, 0), mesh(new THREE.SphereGeometry(0.013, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.steel, 0, 0.01, 0));
  g.add(br);
  // oil sight glass on the front face, at the level of the worm; drain plug below it
  const glassAt = P3(0.13, 0.27, FACE);
  const ring = latheZ([V(0.0125, 0), V(0.023, 0), V(0.023, 0.005), V(0.02, 0.008), V(0.0125, 0.008)], 40);
  g.add(mesh(ring, M.steel, glassAt.x, glassAt.y, glassAt.z), mesh(cylZ(0.0128, 0.006, 32), M.glass, glassAt.x, glassAt.y, glassAt.z + 0.003));
  g.add(mesh(hexZ(0.011, 0.01), M.steel, 0.13, 0.2, FACE + 0.005));
  return g;
}
