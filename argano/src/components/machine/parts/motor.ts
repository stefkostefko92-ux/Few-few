// The motor on the worm axis: a finned cast frame between two end shields, the fan cover with its grille, the
// terminal box with its lid and gland, the nameplate on a pad between the fins, two cast feet bolted to the
// bedplate; past the fan cover the emergency handwheel on the shaft end, and the supply conduit behind.
// Loaded only through boot.ts, after the prefers-reduced-motion and save-data gate of MachineStage.tsx.
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { MachineMaterials } from '../materials';
import { DIM, V, P3, bolts, circle, cylX, cylZ, hexZ, latheX, mesh } from './common';

const X0 = 0.356, X1 = 0.766; // frame between the end shields
const R = 0.126; // frame core
const FIN = 0.024; // fin height
const XC = (X0 + X1) / 2;

/** Cooling fins all round the frame, except under the feet, under the terminal box and at the nameplate pad. */
function fins(M: MachineMaterials): THREE.InstancedMesh {
  const fin = new RoundedBoxGeometry(X1 - X0 - 0.034, FIN, 0.0065, 2, 0.0026);
  const angles: number[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + Math.PI / 40;
    const deg = ((a * 180) / Math.PI) % 360;
    const near = (c: number, span: number) => Math.abs(((deg - c + 540) % 360) - 180) < span;
    if (near(270, 38) || near(90, 22) || near(0, 13)) continue;
    angles.push(a);
  }
  const inst = new THREE.InstancedMesh(fin, M.paint, angles.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), axis = new THREE.Vector3(1, 0, 0);
  const rc = R + FIN / 2 - 0.002;
  angles.forEach((a, i) => {
    // local Y turned onto the radius (0, sin a, cos a)
    q.setFromAxisAngle(axis, Math.PI / 2 - a);
    inst.setMatrixAt(i, m.compose(P3(XC, DIM.yWorm + Math.sin(a) * rc, Math.cos(a) * rc), q, one));
  });
  inst.castShadow = true;
  inst.receiveShadow = true;
  return inst;
}

function feet(M: MachineMaterials): THREE.Group {
  const g = new THREE.Group();
  const plate = new RoundedBoxGeometry(0.085, 0.016, 0.34, 2, 0.004);
  const web = new RoundedBoxGeometry(0.052, 0.09, 0.12, 2, 0.007);
  for (const x of [0.445, 0.68]) {
    g.add(mesh(plate, M.paint, x, DIM.yBed + 0.008, 0), mesh(web, M.paint, x, DIM.yBed + 0.055, 0));
    g.add(bolts(M.steel, [P3(x, DIM.yBed + 0.016, -DIM.zBeam), P3(x, DIM.yBed + 0.016, DIM.zBeam)], '+y', 0.01));
  }
  return g;
}

function terminalBox(M: MachineMaterials): THREE.Group {
  const g = new THREE.Group(), x = 0.53, y = DIM.yWorm + R;
  g.add(mesh(new RoundedBoxGeometry(0.11, 0.035, 0.1, 2, 0.006), M.paint, x, y + 0.004, 0)); // pedestal
  g.add(mesh(new RoundedBoxGeometry(0.135, 0.058, 0.125, 2, 0.008), M.paint, x, y + 0.045, 0));
  g.add(mesh(new RoundedBoxGeometry(0.145, 0.012, 0.135, 2, 0.004), M.paintDark, x, y + 0.08, 0)); // lid
  g.add(bolts(M.steel, [P3(x - 0.058, y + 0.086, -0.053), P3(x + 0.058, y + 0.086, -0.053), P3(x - 0.058, y + 0.086, 0.053), P3(x + 0.058, y + 0.086, 0.053)], '+y', 0.005));
  g.add(mesh(cylZ(0.013, 0.022, 24), M.rubber, x, y + 0.042, -0.07)); // cable gland, at the back
  g.add(mesh(hexZ(0.017, 0.008), M.rubber, x, y + 0.042, -0.064));
  return g;
}

/** Aluminium nameplate riveted on a flat pad of the frame, facing the viewer. */
function nameplate(M: MachineMaterials): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new RoundedBoxGeometry(0.13, 0.05, 0.012, 2, 0.003), M.paint, XC, DIM.yWorm, R - 0.004));
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.038, 0.0012), M.plate, XC, DIM.yWorm, R + 0.0026));
  g.add(bolts(M.steel, [P3(XC - 0.046, DIM.yWorm + 0.015, R + 0.0032), P3(XC + 0.046, DIM.yWorm + 0.015, R + 0.0032), P3(XC - 0.046, DIM.yWorm - 0.015, R + 0.0032),
    P3(XC + 0.046, DIM.yWorm - 0.015, R + 0.0032)], '+z', 0.0022));
  return g;
}

export function motor(M: MachineMaterials): THREE.Group {
  const { yWorm } = DIM;
  const g = new THREE.Group();
  g.add(mesh(cylX(R, X1 - X0 - 0.02, 96), M.paint, XC, yWorm, 0), fins(M), feet(M), terminalBox(M), nameplate(M));
  // drive-end shield with its bolt ring, toward the brake; non-drive end shield toward the fan
  const de = latheX([V(0.0001, X0), V(0.132, X0), V(0.14, X0 + 0.004), V(0.145, X0 + 0.009), V(0.145, X0 + 0.018), V(0.14, X0 + 0.022), V(0.128, X0 + 0.024),
    V(0.126, X0 + 0.03), V(0.0001, X0 + 0.03)], 96);
  const nde = latheX([V(0.0001, X1 - 0.03), V(0.126, X1 - 0.03), V(0.128, X1 - 0.022), V(0.138, X1 - 0.018), V(0.138, X1 - 0.004), V(0.134, X1), V(0.0001, X1)], 96);
  g.add(mesh(de, M.paint, 0, yWorm, 0), mesh(nde, M.paint, 0, yWorm, 0));
  g.add(bolts(M.steel, circle(P3(X0, yWorm, 0), 0.12, 8, 'x'), '-x', 0.0065));
  // fan cover: pressed steel with a rounded end, and its slotted grille
  const cover = latheX([V(0.0001, X1 - 0.004), V(0.128, X1 - 0.004), V(0.133, X1), V(0.133, 0.885), V(0.131, 0.894), V(0.125, 0.901), V(0.114, 0.905), V(0.104, 0.9055)], 96);
  g.add(mesh(cover, M.paintDark, 0, yWorm, 0));
  g.add(mesh(new THREE.CircleGeometry(0.105, 64).rotateY(Math.PI / 2), M.grille, 0.9052, yWorm, 0));
  const end = cylX(0.022, 0.06, 32);
  end.computeTangents();
  g.add(mesh(end, M.machined, 0.935, yWorm, 0)); // shaft end through the fan cover
  return g;
}

/** Grip radius of the handwheel: the handwheel radius of example A (rh, src/calc/presets.ts). */
const GRIP = 0.2;
/** Mid-surface of the dished web: the hub stands 18 mm proud of the rim. */
const dish = (r: number) => 0.018 * (1 - (r - 0.05) / 0.126);

/**
 * Emergency handwheel on the motor shaft end, as lift machines have it: a smooth dished disc with a rolled rim to
 * grip, no spokes and no handle, painted yellow, the directions of travel painted on its face (materials.ts). It
 * turns with the worm.
 */
export function handwheel(M: MachineMaterials): THREE.Group {
  const g = new THREE.Group();
  const rc = GRIP - 0.01, rb = 0.016, ac = 0.004, t = 0.0035; // rim bead centre, bead radius, half web thickness
  const pts = [V(0.0001, -0.06), V(0.03, -0.06), V(0.034, -0.056), V(0.034, -0.03), V(0.042, -0.024), V(0.042, 0.006), V(0.046, 0.012), V(0.052, dish(0.052) - t)];
  for (let r = 0.07; r < 0.172; r += 0.02) pts.push(V(r, dish(r) - t));
  for (let deg = 209; deg <= 542; deg += 9) pts.push(V(rc + rb * Math.cos((deg * Math.PI) / 180), ac + rb * Math.sin((deg * Math.PI) / 180)));
  for (let r = 0.17; r > 0.06; r -= 0.02) pts.push(V(r, dish(r) + t));
  pts.push(V(0.052, dish(0.052) + t), V(0.046, 0.026), V(0.042, 0.031), V(0.042, 0.036), V(0.038, 0.04), V(0.0001, 0.04));
  g.add(mesh(latheX(pts, 128), M.handwheel));
  g.add(mesh(cylX(0.021, 0.004, 32), M.steel, 0.042, 0, 0), mesh(hexZ(0.015, 0.011).rotateY(Math.PI / 2), M.steel, 0.0495, 0, 0)); // washer and nut
  return g;
}

/** Flexible conduit from the terminal box gland down to the floor, behind the motor. */
export function conduit(M: MachineMaterials): THREE.Mesh {
  const y = DIM.yWorm + R + 0.042;
  const path = new THREE.CatmullRomCurve3([P3(0.53, y, -0.08), P3(0.535, y - 0.004, -0.2), P3(0.6, 0.22, -0.3), P3(0.66, 0.03, -0.35), P3(0.76, 0.012, -0.38), P3(0.9, 0.012, -0.4)]);
  return mesh(new THREE.TubeGeometry(path, 80, 0.011, 12), M.rubber);
}
