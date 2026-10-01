// The ropes of the installation in 3D: n ropes side by side along the sheave's axis, over the wheels of the rope rig
// (src/lib/lift/rig.ts). The straight runs follow the car and the counterweight every frame (unit tubes, scaled);
// the arcs on the wheels are built once and ride with a moving wheel (the car and counterweight pulleys of a 2:1
// roping). Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { belt, type Belt, type RopeRig } from '@/lib/lift';
import type { LiftMaterials } from './materials';

export interface RopeModel {
  group: THREE.Group;
  /** car floor s and counterweight plate w [m] */
  set(s: number, w: number): void;
}

const Y = new THREE.Vector3(0, 1, 0);

export function buildRopes(rig: RopeRig, n: number, d: number, M: LiftMaterials): RopeModel {
  const group = new THREE.Group(), rr = d / 2000, pitch = Math.max(d + 6, 1.7 * d) / 1000;
  // one unit tube per world, shared by its straight runs: disposed with the world (never shared across worlds)
  const unit = new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)), 1, 1, 10);
  const [ox, oy] = rig.origin, [dx, dy] = rig.dir;
  // a point of the rope plane (u, y) for rope i, in world metres; the ropes spread across the plane
  const world = (u: number, y: number, i: number, out = new THREE.Vector3()): THREE.Vector3 => {
    const off = (i - (n - 1) / 2) * pitch;
    const px = ox / 1000 + u * dx - off * dy, py = oy / 1000 + u * dy + off * dx;
    return out.set(px, y, -py);
  };
  const sheaveAt = rig.elements(0, 0).findIndex((e) => e.kind === 'wheel' && Math.abs(e.u - rig.sheave.u) < 1e-9 && Math.abs(e.y - rig.sheave.y) < 1e-9);
  const ref: Belt = belt(rig.elements(0, 0));
  // runs up to the sheave carry the car side's texture, the rest the counterweight side's
  const runMeshes = ref.runs.map((_, j) => Array.from({ length: n }, () => {
    const m = new THREE.Mesh(unit, j < sheaveAt ? M.ropeCar : M.ropeCw);
    m.castShadow = true;
    group.add(m);
    return m;
  }));
  // arcs: built at the reference state; the ones on moving wheels are shifted each frame
  const wheelIdx = rig.elements(0, 0).map((e, k) => (e.kind === 'wheel' ? k : -1)).filter((k) => k > 0);
  const arcMeshes = ref.arcs.map((a, j) => {
    const meshes = Array.from({ length: n }, (_, i) => {
      const pts: THREE.Vector3[] = [], steps = Math.max(6, Math.ceil((Math.abs(a.sweep) * a.r) / 0.02));
      for (let k = 0; k <= steps; k++) {
        const ang = a.a0 + (a.sweep * k) / steps;
        pts.push(world(a.c[0] + a.r * Math.cos(ang), a.c[1] + a.r * Math.sin(ang), i));
      }
      const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps * 2, rr, 10), wheelIdx[j] < sheaveAt ? M.ropeCar : M.ropeCw);
      group.add(m);
      return m;
    });
    return { meshes, c0: a.c, el: wheelIdx[j] };
  });
  const a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Quaternion();
  return {
    group,
    set(s, w) {
      const els = rig.elements(s, w), bl = belt(els);
      bl.runs.forEach(([p0, p1], j) => {
        for (let i = 0; i < n; i++) {
          world(p0[0], p0[1], i, a);
          world(p1[0], p1[1], i, b);
          const m = runMeshes[j]?.[i];
          if (!m) continue;
          const len = a.distanceTo(b);
          m.position.copy(a);
          m.quaternion.copy(len > 1e-6 ? q.setFromUnitVectors(Y, b.sub(a).normalize()) : q.identity());
          m.scale.set(rr, Math.max(len, 1e-4), rr);
        }
      });
      for (const arc of arcMeshes) {
        const e = els[arc.el];
        if (e?.kind !== 'wheel') continue;
        const du = e.u - arc.c0[0], dv = e.y - arc.c0[1];
        for (const m of arc.meshes) m.position.set(du * dx, dv, -du * dy);
      }
    },
  };
}
