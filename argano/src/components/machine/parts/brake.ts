// The drum brake between gearbox and motor: two shaped arms pivoted on a bracket at the bottom, lined shoes on the
// drum, the pressure springs with their nuts on the tie rod, the release magnet between the arm tops with its
// plungers, and the hand release lever with its red knob.
// Loaded only through boot.ts, after the prefers-reduced-motion and save-data gate of MachineStage.tsx.
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { MachineMaterials } from '../materials';
import { DIM, V, cylX, cylZ, hexZ, latheX, latheZ, mesh, slab, springZ } from './common';

const Z_ARM = 0.152; // arm centre planes, z = ±Z_ARM
const Y_PIVOT = 0.2;
const Y_ROD = 0.5; // tie rod with the springs
const Y_MAGNET = 0.585;

/** Drum turned from one piece: the braking band, a recessed web and the hub (axis X, centred). */
function drumGeometry(): THREE.BufferGeometry {
  const h = [V(0.0001, -0.055), V(0.045, -0.055), V(0.048, -0.052), V(0.048, -0.03), V(0.105, -0.03), V(0.105, -0.047), V(0.108, -0.05), V(0.117, -0.05), V(0.12, -0.047)];
  const pts = [...h, ...h.slice().reverse().map((p) => V(p.x, -p.y))];
  const g = latheX(pts, 96);
  g.computeTangents();
  return g;
}

/** Annular sector around +x (the shoe seen along the drum axis). */
function sector(r1: number, r2: number, half: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(r1 * Math.cos(-half), r1 * Math.sin(-half));
  s.absarc(0, 0, r2, -half, half, false);
  s.absarc(0, 0, r1, half, -half, true);
  return s;
}

/** Brake arm seen along Z: pivot boss at the bottom, widest at the shoe, the magnet plunger boss at the top. */
function armShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.022, Y_PIVOT);
  s.quadraticCurveTo(0.037, 0.27, 0.033, DIM.yWorm);
  s.quadraticCurveTo(0.029, 0.45, 0.02, Y_ROD + 0.02);
  s.lineTo(0.02, Y_MAGNET);
  s.absarc(0, Y_MAGNET, 0.02, 0, Math.PI, false);
  s.lineTo(-0.02, Y_ROD + 0.02);
  s.quadraticCurveTo(-0.029, 0.45, -0.033, DIM.yWorm);
  s.quadraticCurveTo(-0.037, 0.27, -0.022, Y_PIVOT);
  s.absarc(0, Y_PIVOT, 0.022, Math.PI, Math.PI * 2, false);
  return s;
}

/** Release magnet lying between the arm tops: the coil housing between two end flanges, a seam band (axis Z). */
function magnetGeometry(): THREE.BufferGeometry {
  return latheZ([V(0.0001, -0.1), V(0.055, -0.1), V(0.058, -0.097), V(0.058, -0.084), V(0.055, -0.081), V(0.052, -0.08), V(0.052, -0.006), V(0.0545, -0.005),
    V(0.0545, 0.005), V(0.052, 0.006), V(0.052, 0.08), V(0.055, 0.081), V(0.058, 0.084), V(0.058, 0.097), V(0.055, 0.1), V(0.0001, 0.1)], 72);
}

export function brake(M: MachineMaterials): { group: THREE.Group; drum: THREE.Object3D } {
  const { yWorm, xDrum } = DIM;
  const g = new THREE.Group();
  const drum = mesh(drumGeometry(), M.machined, xDrum, yWorm, 0);
  const shaft = cylX(0.03, 0.14, 32);
  shaft.computeTangents();
  g.add(drum, mesh(shaft, M.machined, xDrum, yWorm, 0));

  // bracket on the bedplate carrying the two arm pivots
  g.add(mesh(new RoundedBoxGeometry(0.09, 0.03, 0.42, 2, 0.005), M.paintDark, xDrum, DIM.yBed + 0.015, 0));
  const cheek = new RoundedBoxGeometry(0.05, 0.075, 0.008, 2, 0.003);
  const lining = slab(sector(0.1205, 0.1268, 0.6), 0.088, 0.0015, 16).rotateY(-Math.PI / 2);
  const shoe = slab(sector(0.1265, 0.135, 0.64), 0.07, 0.002, 16).rotateY(-Math.PI / 2);
  const arm = slab(armShape(), 0.024, 0.003, 16);
  for (const side of [1, -1]) {
    const turn = side > 0 ? 0 : Math.PI;
    const l = mesh(lining.clone().rotateY(turn), M.lining, xDrum, yWorm, 0);
    const s = mesh(shoe.clone().rotateY(turn), M.paintDark, xDrum, yWorm, 0);
    g.add(l, s);
    g.add(mesh(arm, M.paint, xDrum, 0, side * Z_ARM));
    g.add(mesh(cylZ(0.013, 0.012, 20), M.steel, xDrum, yWorm, side * 0.137)); // shoe pin
    for (const dz of [-0.019, 0.019]) g.add(mesh(cheek, M.paintDark, xDrum, Y_PIVOT - 0.02, side * Z_ARM + dz));
    g.add(mesh(cylZ(0.009, 0.05, 20), M.steel, xDrum, Y_PIVOT, side * Z_ARM)); // pivot pin
    // pressure spring between the arm and its nuts on the tie rod
    g.add(mesh(springZ(xDrum, Y_ROD, side * 0.168, side * 0.232, 0.02, 0.0042, 6), M.spring));
    g.add(mesh(cylZ(0.026, 0.004, 32), M.steel, xDrum, Y_ROD, side * 0.166), mesh(cylZ(0.026, 0.004, 32), M.steel, xDrum, Y_ROD, side * 0.234));
    g.add(mesh(hexZ(0.014, 0.011), M.steel, xDrum, Y_ROD, side * 0.2425), mesh(hexZ(0.014, 0.008), M.steel, xDrum, Y_ROD, side * 0.2535));
    g.add(mesh(cylZ(0.012, 0.042, 20), M.steel, xDrum, Y_MAGNET, side * 0.119)); // plunger onto the arm
  }
  g.add(mesh(cylZ(0.008, 0.53, 16), M.steel, xDrum, Y_ROD, 0)); // tie rod

  g.add(mesh(magnetGeometry(), M.frame, xDrum, Y_MAGNET, 0));
  g.add(mesh(new RoundedBoxGeometry(0.05, 0.028, 0.06, 2, 0.005), M.frame, xDrum, Y_MAGNET + 0.066, 0)); // coil terminal box
  g.add(mesh(cylX(0.008, 0.02, 16), M.rubber, xDrum + 0.034, Y_MAGNET + 0.066, 0)); // its cable gland

  // hand release lever: a cam on top of the magnet, behind its terminal box, the bar and the red knob
  const lever = new THREE.Group(), L = 0.14;
  lever.position.set(xDrum, Y_MAGNET + 0.058, -0.055);
  lever.rotation.z = -0.9;
  lever.add(mesh(cylZ(0.016, 0.018, 24), M.steel, 0, 0, 0));
  lever.add(mesh(new RoundedBoxGeometry(0.012, L, 0.01, 2, 0.003), M.steel, 0, L / 2, 0));
  lever.add(mesh(latheZ([V(0.0001, -0.03), V(0.011, -0.03), V(0.015, -0.02), V(0.016, 0.01), V(0.013, 0.028), V(0.0001, 0.032)], 32).rotateX(-Math.PI / 2), M.red, 0, L + 0.028, 0));
  g.add(lever);
  return { group: g, drum };
}
