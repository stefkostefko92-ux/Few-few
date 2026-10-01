// The ropes of the installation in 3D: n ropes side by side along each wheel's axle, over the wheels of the rope rig
// (src/lib/lift/rig.ts), piece by piece in their vertical planes. The straight runs follow the car and the
// counterweight every frame (unit tubes, scaled); a run that joins two pieces is one run, its ends in their own
// planes (the ropes turn over its length); the arcs on the wheels are built once and ride with a moving wheel (the car
// and counterweight pulleys of a 2:1 roping); the ends of a 1:1 roping fan out to the sockets of their hitches. Loaded
// only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { belt, type Pt2, type RopePiece, type RopePlane, type RopeRig } from '@/lib/lift';
import type { LiftMaterials } from './materials';

export interface RopeModel {
  group: THREE.Group;
  /** car floor s and counterweight plate w [m] */
  set(s: number, w: number): void;
}

const Y = new THREE.Vector3(0, 1, 0);
// the sockets of a 1:1 hitch sit wider apart than the ropes run: across the rope plane and staggered along it [m]
const HITCH_PITCH = 0.05, HITCH_STAGGER = 0.022;

/** Plan positions [mm] of the rope ends on a 1:1 hitch at u [m] along the plane (the car's drop or the counterweight's). */
export function hitchSpots(plane: RopePlane, n: number, u: number): (readonly [number, number])[] {
  const [ox, oy] = plane.origin, [dx, dy] = plane.dir;
  return Array.from({ length: n }, (_, i) => {
    const off = (i - (n - 1) / 2) * HITCH_PITCH * 1000, along = (u + (i % 2 ? HITCH_STAGGER : -HITCH_STAGGER)) * 1000;
    return [ox + along * dx - off * dy, oy + along * dy + off * dx] as const;
  });
}

interface Run {
  p0: Pt2;
  pl0: RopePlane;
  p1: Pt2;
  pl1: RopePlane;
  car: boolean;
}

/** The straight runs of the rope in order, pieces joined on their shared vertical run; car side up to the sheave. */
function runsOf(pieces: readonly RopePiece[], isSheave: (k: number, j: number) => boolean): Run[] {
  const out: Run[] = [];
  let passed = false;
  pieces.forEach((pc, k) => {
    belt(pc.els).runs.forEach(([p0, p1], j) => {
      if (isSheave(k, j)) passed = true;
      const last = out[out.length - 1];
      if (k > 0 && j === 0 && last) {
        last.p1 = p1;
        last.pl1 = pc.plane;
      } else out.push({ p0, pl0: pc.plane, p1, pl1: pc.plane, car: !passed });
    });
  });
  return out;
}

export function buildRopes(rig: RopeRig, n: number, d: number, M: LiftMaterials, hitched: boolean): RopeModel {
  const group = new THREE.Group(), rr = d / 2000, pitch = Math.max(d + 6, 1.7 * d) / 1000;
  // one unit tube per world, shared by its straight runs: disposed with the world (never shared across worlds)
  const unit = new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)), 1, 1, 10);
  // a point (u, y) of plane p for rope i, in world metres; the ropes spread across the plane, wider at a hitch
  const world = (p: RopePlane, u: number, y: number, i: number, out = new THREE.Vector3(), atHitch = false): THREE.Vector3 => {
    const off = (i - (n - 1) / 2) * (atHitch ? HITCH_PITCH : pitch), du = atHitch ? (i % 2 ? HITCH_STAGGER : -HITCH_STAGGER) : 0;
    const [ox, oy] = p.origin, [dx, dy] = p.dir, px = ox / 1000 + (u + du) * dx - off * dy, py = oy / 1000 + (u + du) * dy + off * dx;
    return out.set(px, y, -py);
  };
  const ref = rig.pieces(0, 0), S = rig.sheave;
  const isSheave = (k: number, j: number): boolean => {
    const e = ref[k].els[j];
    return e.kind === 'wheel' && ref[k].plane === S.plane && Math.abs(e.u - S.u) < 1e-9 && Math.abs(e.y - S.y) < 1e-9;
  };
  const runMeshes = runsOf(ref, isSheave).map((r) => Array.from({ length: n }, () => {
    const m = new THREE.Mesh(unit, r.car ? M.ropeCar : M.ropeCw);
    m.castShadow = true;
    group.add(m);
    return m;
  }));
  // arcs: built at the reference state; the ones on moving wheels (piece k, element el) are shifted each frame
  let passed = false;
  const arcMeshes = ref.flatMap((pc, k) => {
    const wheels = pc.els.map((e, j) => (e.kind === 'wheel' && j > 0 && j < pc.els.length - 1 ? j : -1)).filter((j) => j > 0);
    return belt(pc.els).arcs.map((a, idx) => {
      const el = wheels[idx];
      if (isSheave(k, el)) passed = true;
      const meshes = Array.from({ length: n }, (_, i) => {
        const pts: THREE.Vector3[] = [], steps = Math.max(6, Math.ceil((Math.abs(a.sweep) * a.r) / 0.02));
        for (let q = 0; q <= steps; q++) {
          const ang = a.a0 + (a.sweep * q) / steps;
          pts.push(world(pc.plane, a.c[0] + a.r * Math.cos(ang), a.c[1] + a.r * Math.sin(ang), i));
        }
        const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps * 2, rr, 10), passed ? M.ropeCw : M.ropeCar);
        group.add(m);
        return m;
      });
      return { meshes, c0: a.c, k, el, plane: pc.plane };
    });
  });
  const a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Quaternion();
  return {
    group,
    set(s, w) {
      const pcs = rig.pieces(s, w), runs = runsOf(pcs, isSheave);
      runs.forEach((r, j) => {
        for (let i = 0; i < n; i++) {
          // a 1:1 roping ends on the hitches of the car (first run) and of the counterweight (last run)
          world(r.pl0, r.p0[0], r.p0[1], i, a, hitched && j === 0);
          world(r.pl1, r.p1[0], r.p1[1], i, b, hitched && j === runs.length - 1);
          const m = runMeshes[j]?.[i];
          if (!m) continue;
          const len = a.distanceTo(b);
          m.position.copy(a);
          m.quaternion.copy(len > 1e-6 ? q.setFromUnitVectors(Y, b.sub(a).normalize()) : q.identity());
          m.scale.set(rr, Math.max(len, 1e-4), rr);
        }
      });
      for (const arc of arcMeshes) {
        const e = pcs[arc.k]?.els[arc.el];
        if (e?.kind !== 'wheel') continue;
        const du = e.u - arc.c0[0], dv = e.y - arc.c0[1], [dx, dy] = arc.plane.dir;
        for (const m of arc.meshes) m.position.set(du * dx, dv, -du * dy);
      }
    },
  };
}
