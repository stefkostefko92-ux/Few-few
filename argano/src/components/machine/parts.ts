// Geometry of a geared traction machine, built from primitives in metres: bedplate on rubber pads, worm gearbox
// (worm below the wheel), drum brake with its magnet and springs, flange motor with cooling fins, emergency
// handwheel on the worm shaft and the traction sheave with its ropes. The machine is the calculator's example A:
// sheave D 560, 4 ropes of 10 mm, ratio 1:43, 7.5 kW (src/calc/presets.ts); nothing here is a real product.
// Loaded only through boot.ts, after the prefers-reduced-motion and save-data gate of MachineStage.tsx.
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { MachineMaterials } from './materials';

export const DIM = {
  yWorm: 0.34, // worm, brake and motor axis
  yWheel: 0.5, // wheel and sheave axis
  zSheave: 0.34,
  rp: 0.28, // pitch radius: D 560
  ropes: 4,
  ropeR: 0.005,
  pitch: 0.018, // groove spacing
  ropeBottom: -0.3, // the ropes go through the floor
};
export const ROPE_LENGTH = 2 * (DIM.yWheel - DIM.ropeBottom) + Math.PI * DIM.rp;

type Mat = THREE.Material;
const V = (x: number, y: number) => new THREE.Vector2(x, y);

function mesh(geometry: THREE.BufferGeometry, material: Mat, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
/** Cylinder with its axis along X. */
const cylX = (r: number, len: number, seg = 32) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
/** Cylinder with its axis along Z. */
const cylZ = (r: number, len: number, seg = 32) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);

/** Hexagon bolt heads placed on a ring (axis Z, facing +Z). */
function boltRing(material: Mat, n: number, radius: number, x: number, y: number, z: number, head = 0.009): THREE.InstancedMesh {
  const geo = cylZ(head, 0.011, 6);
  const bolts = new THREE.InstancedMesh(geo, material, n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    bolts.setMatrixAt(i, m.makeTranslation(x + Math.cos(a) * radius, y + Math.sin(a) * radius, z));
  }
  bolts.castShadow = true;
  return bolts;
}

/** Sheave outline turned on a lathe: hub, web, rim and the U grooves (axis along local Z after the rotation). */
function sheaveGeometry(): THREE.BufferGeometry {
  const { rp, ropes, pitch, ropeR } = DIM;
  const w = ropes * pitch + 0.024, rOut = rp + 0.004, bottom = rp - ropeR - 0.0004, gw = ropeR + 0.0011;
  const pts: THREE.Vector2[] = [V(0.0001, -0.078), V(0.074, -0.078), V(0.078, -0.074), V(0.078, -0.022), V(0.094, -0.014), V(0.222, -0.014),
    V(0.236, -0.024), V(0.236, -w / 2), V(rOut - 0.004, -w / 2), V(rOut, -w / 2 + 0.004)];
  for (let i = 0; i < ropes; i++) {
    const yc = -ropes * pitch / 2 + pitch * (i + 0.5);
    pts.push(V(rOut, yc - gw - 0.0012));
    for (let k = 0; k <= 12; k++) {
      const a = (Math.PI * k) / 12;
      pts.push(V(rOut - (rOut - bottom) * Math.pow(Math.sin(a), 0.7), yc - gw * Math.cos(a)));
    }
    pts.push(V(rOut, yc + gw + 0.0012));
  }
  pts.push(V(rOut, w / 2 - 0.004), V(rOut - 0.004, w / 2), V(0.236, w / 2), V(0.236, 0.024), V(0.222, 0.014), V(0.094, 0.014),
    V(0.078, 0.022), V(0.078, 0.074), V(0.074, 0.078), V(0.0001, 0.078));
  return new THREE.LatheGeometry(pts, 128).rotateX(Math.PI / 2);
}

function ropePath(z: number): THREE.CatmullRomCurve3 {
  const { rp, yWheel, ropeBottom } = DIM;
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 10; k++) pts.push(new THREE.Vector3(-rp, ropeBottom + ((yWheel - ropeBottom) * k) / 10, z));
  for (let k = 1; k < 48; k++) {
    const a = Math.PI - (Math.PI * k) / 48;
    pts.push(new THREE.Vector3(rp * Math.cos(a), yWheel + rp * Math.sin(a), z));
  }
  for (let k = 0; k <= 10; k++) pts.push(new THREE.Vector3(rp, yWheel - ((yWheel - ropeBottom) * k) / 10, z));
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
}

/** Two I-beams on rubber pads with end cross members. */
function bedplate(M: MachineMaterials): THREE.Group {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  const fw = 0.035, h = 0.12, tf = 0.01, tw = 0.004;
  s.moveTo(-fw, 0); s.lineTo(fw, 0); s.lineTo(fw, tf); s.lineTo(tw, tf); s.lineTo(tw, h - tf); s.lineTo(fw, h - tf); s.lineTo(fw, h);
  s.lineTo(-fw, h); s.lineTo(-fw, h - tf); s.lineTo(-tw, h - tf); s.lineTo(-tw, tf); s.lineTo(-fw, tf); s.closePath();
  const beam = new THREE.ExtrudeGeometry(s, { depth: 1.4, bevelEnabled: false }).rotateY(Math.PI / 2);
  for (const z of [-0.16, 0.16]) {
    g.add(mesh(beam, M.frame, -0.46, 0.02, z));
    for (const x of [-0.36, 0.84]) g.add(mesh(new THREE.BoxGeometry(0.1, 0.02, 0.09), M.rubber, x, 0.01, z));
  }
  for (const x of [-0.49, 0.97]) g.add(mesh(new RoundedBoxGeometry(0.06, 0.1, 0.4, 2, 0.006), M.frame, x, 0.08, 0));
  return g;
}

/** Worm gearbox: housing, wheel covers with bolt rings, bearing caps, lifting eye and oil plug. */
function gearbox(M: MachineMaterials): THREE.Group {
  const { yWorm, yWheel } = DIM;
  const g = new THREE.Group();
  g.add(mesh(new RoundedBoxGeometry(0.46, 0.54, 0.4, 5, 0.035), M.paint, -0.03, 0.41, 0));
  for (const z of [0.2, -0.2]) {
    const side = Math.sign(z);
    g.add(mesh(cylZ(0.19, 0.024, 64), M.paint, -0.03, yWheel, z + side * 0.012));
    g.add(boltRing(M.steel, 10, 0.168, -0.03, yWheel, z + side * 0.026));
  }
  g.add(mesh(cylZ(0.1, 0.05, 48), M.paintDark, 0, yWheel, 0.25)); // output bearing boss
  g.add(mesh(cylZ(0.045, 0.06, 32), M.steel, 0, yWheel, 0.29)); // output shaft
  for (const x of [0.215, -0.275]) g.add(mesh(cylX(0.075, 0.03, 48), M.paintDark, x, yWorm, 0)); // worm bearing caps
  const eye = mesh(new THREE.TorusGeometry(0.032, 0.009, 12, 32), M.steel, -0.03, 0.72, 0);
  g.add(eye, mesh(cylX(0.012, 0.03), M.steel, -0.03, 0.69, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 6), M.steel, 0.12, 0.69, 0.1)); // oil filler plug
  return g;
}

/** Drum brake between gearbox and motor: shoes on the drum, arms, magnet on top, springs on the tie rod. */
function brake(M: MachineMaterials): { group: THREE.Group; drum: THREE.Mesh } {
  const { yWorm } = DIM;
  const g = new THREE.Group();
  const drum = mesh(cylX(0.12, 0.1, 64), M.steel, 0.295, yWorm, 0);
  g.add(drum);
  for (const side of [1, -1]) {
    const shoe = new THREE.CylinderGeometry(0.127, 0.127, 0.09, 24, 1, true, side > 0 ? -0.62 : Math.PI - 0.62, 1.24).rotateZ(Math.PI / 2);
    g.add(mesh(shoe, M.lining, 0.295, yWorm, 0), mesh(new RoundedBoxGeometry(0.05, 0.4, 0.028, 2, 0.006), M.paint, 0.295, 0.34, side * 0.152));
    g.add(mesh(cylZ(0.012, 0.05, 16), M.steel, 0.295, 0.17, side * 0.152)); // arm pivot
    // pressure spring on the tie rod, outside each arm
    const coil: THREE.Vector3[] = [];
    for (let k = 0; k <= 160; k++) {
      const a = (k / 160) * Math.PI * 2 * 7;
      coil.push(new THREE.Vector3(0.295 + Math.cos(a) * 0.022, 0.53 + Math.sin(a) * 0.022, side * (0.172 + (k / 160) * 0.07)));
    }
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 320, 0.0042, 6), M.steel));
    g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.012, 6).rotateX(Math.PI / 2), M.steel, 0.295, 0.53, side * 0.25));
  }
  g.add(mesh(cylZ(0.008, 0.5, 12), M.steel, 0.295, 0.53, 0)); // tie rod
  g.add(mesh(cylZ(0.058, 0.26, 48), M.paintDark, 0.295, 0.6, 0)); // magnet
  for (const z of [0.13, -0.13]) g.add(mesh(cylZ(0.06, 0.012, 48), M.steel, 0.295, 0.6, z));
  return { group: g, drum };
}

/** Flange motor with cooling fins, fan cover and terminal box, on two feet. */
function motor(M: MachineMaterials): THREE.Group {
  const { yWorm } = DIM;
  const g = new THREE.Group();
  g.add(mesh(cylX(0.135, 0.4, 64), M.paint, 0.56, yWorm, 0));
  for (const x of [0.365, 0.755]) g.add(mesh(cylX(0.142, 0.02, 64), M.paint, x, yWorm, 0));
  const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.37, 0.024, 0.006), M.paint, 22);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  let n = 0;
  for (let i = 0; i < 26 && n < 22; i++) {
    const a = (i / 26) * Math.PI * 2;
    if (Math.abs(Math.sin(a) + 1) < 0.35 || Math.abs(Math.sin(a) - 1) < 0.08) continue; // feet below, terminal box above
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), a - Math.PI / 2);
    p.set(0.56, yWorm + Math.sin(a) * 0.146, Math.cos(a) * 0.146);
    fins.setMatrixAt(n++, m.compose(p, q, s));
  }
  fins.count = n;
  fins.castShadow = true;
  g.add(fins);
  g.add(mesh(cylX(0.13, 0.12, 64), M.paintDark, 0.83, yWorm, 0)); // fan cover
  const grille = mesh(new THREE.CircleGeometry(0.128, 64).rotateY(Math.PI / 2), M.grille, 0.891, yWorm, 0);
  g.add(grille);
  g.add(mesh(new RoundedBoxGeometry(0.13, 0.075, 0.12, 2, 0.01), M.paintDark, 0.52, yWorm + 0.17, 0));
  g.add(mesh(cylZ(0.014, 0.03, 16), M.rubber, 0.52, yWorm + 0.165, -0.07)); // cable gland, at the back
  for (const x of [0.43, 0.69]) g.add(mesh(new RoundedBoxGeometry(0.06, 0.075, 0.3, 2, 0.006), M.paint, x, 0.178, 0));
  return g;
}

/** Emergency handwheel on the motor shaft, past the fan cover (it turns with the worm). */
function handwheel(M: MachineMaterials): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.TorusGeometry(0.14, 0.011, 16, 96).rotateY(Math.PI / 2), M.yellow));
  g.add(mesh(cylX(0.032, 0.05), M.yellow));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spoke = mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.12, 12), M.yellow, 0, Math.cos(a) * 0.085, Math.sin(a) * 0.085);
    spoke.rotation.x = a;
    g.add(spoke);
  }
  g.add(mesh(cylX(0.012, 0.075, 16), M.rubber, 0.04, 0.14, 0)); // grip
  return g;
}

export interface Machine {
  group: THREE.Group;
  sheave: THREE.Object3D;
  /** Parts that turn with the worm (i times faster than the sheave). */
  worm: THREE.Object3D[];
}

export function buildMachine(M: MachineMaterials): Machine {
  const { yWorm, yWheel, zSheave, rp, ropes, pitch } = DIM;
  const group = new THREE.Group();
  const b = brake(M);
  group.add(bedplate(M), gearbox(M), b.group, motor(M));
  group.add(mesh(cylX(0.022, 0.07, 24), M.steel, 0.925, yWorm, 0)); // motor shaft end
  const wheel = handwheel(M);
  wheel.position.set(0.965, yWorm, 0);
  group.add(wheel);

  const sheave = new THREE.Group();
  sheave.position.set(0, yWheel, zSheave);
  sheave.add(mesh(sheaveGeometry(), M.sheave), boltRing(M.steel, 6, 0.056, 0, 0, 0.083, 0.008));
  group.add(sheave);

  for (let i = 0; i < ropes; i++) {
    const z = zSheave + (i - (ropes - 1) / 2) * pitch;
    group.add(mesh(new THREE.TubeGeometry(ropePath(z), 420, DIM.ropeR, 10), M.rope));
  }
  for (const x of [-rp, rp]) {
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.11).rotateX(-Math.PI / 2), M.hole);
    hole.position.set(x, 0.0015, zSheave);
    group.add(hole);
  }
  // flexible conduit from the terminal box down to the floor, behind the motor
  const conduit = new THREE.CatmullRomCurve3([new THREE.Vector3(0.52, yWorm + 0.165, -0.085), new THREE.Vector3(0.53, yWorm + 0.16, -0.2),
    new THREE.Vector3(0.6, 0.2, -0.3), new THREE.Vector3(0.64, 0.02, -0.34), new THREE.Vector3(0.7, 0.0, -0.36)]);
  group.add(mesh(new THREE.TubeGeometry(conduit, 64, 0.011, 10), M.rubber));
  return { group, sheave, worm: [wheel, b.drum] };
}
