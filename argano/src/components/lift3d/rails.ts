// Guide rails: T profiles of the design's sizes (foot b, blade height h and thickness k) with the rolled shape of the
// real section (the foot tapering to its edges, a radius at the blade's root, the tip's chamfers), their blades
// pointing at the car or the counterweight, from the pit floor up under the slab. Cold-drawn rails (/A) are bright all
// over; on a machined rail (/B) the blade is planed bright and oiled, the foot left in its mill scale; the rolled
// profiles are dark. In 5 m lengths: a hairline at each joint, the fishplate behind it, four bolts each side through
// the foot. Every 2.5 m a bracket: the plate behind the foot held by two clips with their bolts, an angle out to the
// wall and the wall plate on its two anchors; the bridge bracket of a side counterweight. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { RAILS, type Layout, type Rail, type RailType } from '@/shaft';
import type { Section } from '@/shaft/section';
import { KV_VERT } from '@/shaft/norme-vert';
import { Batch, type Point } from './geom';
import type { LiftMaterials } from './materials';

const BRACKET_PITCH = 2500, RAIL_LENGTH = 5000, JOINT_GAP = 0.6;

const DIRS: Record<Rail['dir'], readonly [number, number]> = { right: [1, 0], left: [-1, 0], back: [0, 1], front: [0, -1] };

/** The rail's own frame in plan: a along the blade from the back of the foot (0) to the tip (h), c across it. */
function frame(r: Rail, h: number) {
  const [dx, dy] = DIRS[r.dir], fx = r.x - dx * h, fy = r.y - dy * h;
  return {
    dx, dy,
    plan: (a: number, c: number): readonly [number, number] => [fx + dx * a - dy * c, fy + dy * a + dx * c],
  };
}

/** The section's two parts in the rail's frame [mm]: the blade (tip and faces) and the foot with the root's radii. */
function section(b: number, h: number, k: number): { blade: [number, number][]; foot: [number, number][] } {
  const tf = Math.max(8, 0.16 * h), te = Math.max(5, 0.1 * h), fr = Math.min(6, 0.6 * k), ch = Math.min(1.2, k / 6);
  const blade: [number, number][] = [[tf - 1, -k / 2], [h - ch, -k / 2], [h, -k / 2 + ch], [h, k / 2 - ch], [h - ch, k / 2], [tf - 1, k / 2]];
  const arc = (s: 1 | -1): [number, number][] => Array.from({ length: 5 }, (_, i) => {
    const t = Math.PI + (i / 4) * (Math.PI / 2);
    return [tf + fr + fr * Math.cos(t), s * (k / 2 + fr + fr * Math.sin(t))];
  });
  const foot: [number, number][] = [[0, -b / 2], [0, b / 2], [te, b / 2], ...arc(1), ...arc(-1).reverse(), [te, -b / 2]];
  return { blade, foot };
}

/** Finishes of a rail type: the blade's and the foot's. */
function finish(type: RailType, M: LiftMaterials): readonly [THREE.Material, THREE.Material] {
  if (!RAILS[type].iso) return [M.railFoot, M.railFoot];
  return type.endsWith('/A') ? [M.railDrawn, M.railDrawn] : [M.railBlade, M.railFoot];
}

export function buildRails(L: Layout, S: Section, M: LiftMaterials): THREE.Group {
  const g = new THREE.Group(), B = new Batch(), I = L.inputs;
  const z0 = S.pitFloor, z1 = S.ceiling - KV_VERT.railTopGap;
  for (const r of L.rails) {
    const type = r.kind === 'car' ? I.carRail : I.cwRail, { b, h, k } = RAILS[type], F = frame(r, h), [mBlade, mFoot] = finish(type, M);
    const sec = section(b, h, k), half = b / 2, te = Math.max(5, 0.1 * h), tf = Math.max(8, 0.16 * h);
    const shape = (pts: [number, number][]): THREE.Shape => new THREE.Shape(pts.map(([a, c]) => {
      const [x, y] = F.plan(a, c);
      return new THREE.Vector2(x / 1000, y / 1000);
    }));
    // lengths of 5 m from the pit floor, a hairline between them
    const joints: number[] = [];
    for (let z = z0; z < z1; z += RAIL_LENGTH) {
      const top = Math.min(z + RAIL_LENGTH - JOINT_GAP, z1);
      if (z > z0) joints.push(z);
      for (const [pts, m] of [[sec.blade, mBlade], [sec.foot, mFoot]] as const) {
        const geo = new THREE.ExtrudeGeometry(shape(pts), { depth: (top - z) / 1000, bevelEnabled: false, curveSegments: 2 });
        // the section lies in the plan (x, y), extruded along +Z: turn it so the extrusion goes up and plan y goes to −Z
        geo.rotateX(-Math.PI / 2);
        B.add(geo.translate(0, z / 1000, 0), m);
      }
    }
    const span = (a0: number, a1: number, c0: number, c1: number, za: number, zb: number, m: THREE.Material): void => {
      const [p, q] = [F.plan(a0, c0), F.plan(a1, c1)];
      B.box(p[0], p[1], za, q[0], q[1], zb, m);
    };
    const at = (a: number, c: number, z: number): Point => {
      const [x, y] = F.plan(a, c);
      return [x, y, z];
    };
    // a hexagon bolt head (and its washer) on a face at a, pointing along +a (s = 1) or −a (s = −1)
    const bolt = (a: number, c: number, z: number, s: 1 | -1, r = 9.5): void => {
      B.rod(at(a, c, z), at(a + s * 2, c, z), r + 4, M.galv, 16);
      B.rod(at(a + s * 2, c, z), at(a + s * 9, c, z), r, M.galv, 6);
    };
    const brackets: number[] = [];
    for (let z = z0 + 600; z < z1 - 200; z += BRACKET_PITCH) brackets.push(z);
    // fishplates behind the joints, four bolts each side through the foot's flanges
    const cm = k / 2 + (half - k / 2) / 2, af = (te + tf) / 2;
    for (const j of joints) {
      if (brackets.some((z) => Math.abs(z - j) < 250)) continue;
      span(-14, 0, -half + 4, half - 4, j - 140, j + 140, M.railFoot);
      for (const dz of [-105, -45, 45, 105]) for (const c of [-cm, cm]) bolt(af, c, j + dz, 1, 8);
    }
    for (const z of brackets) {
      // plate behind the foot; two clips over the foot's edges, bolted through the plate beside the foot
      span(-12, 0, -half - 32, half + 32, z, z + 150, M.galv);
      for (const s of [-1, 1]) {
        span(te - 1, te + 9, s * (half - 14), s * (half + 20), z + 45, z + 105, M.galv);
        bolt(te + 9, s * (half + 8), z + 75, 1);
      }
      // the angle out to the wall (or to the bridge) and the wall plate with its two anchors
      const toWall = r.bracketAxis === 'x' ? r.bracketTo - (r.x - F.dx * h) : r.bracketTo - (r.y - F.dy * h);
      const along = r.bracketAxis === 'x' ? Math.abs(F.dx) > 0.5 : Math.abs(F.dy) > 0.5;
      if (along) {
        const a1 = toWall * (r.bracketAxis === 'x' ? F.dx : F.dy), s = a1 < 0 ? 1 : -1;
        span(Math.min(-12, a1), Math.max(-12, a1), -45, 45, z, z + 8, M.galv);
        span(Math.min(-12, a1), Math.max(-12, a1), 37, 45, z, z + 100, M.galv);
        const face = a1 < 0 ? a1 + 12 : a1 - 12;
        span(Math.min(a1, face), Math.max(a1, face), -80, 80, z - 30, z + 170, M.galv);
        for (const c of [-56, 56]) bolt(face, c, z + 120, s as 1 | -1);
      } else {
        // the wall lies across the blade: the angle runs beside the foot
        const c1 = toWall * (r.bracketAxis === 'x' ? -F.dy : F.dx), s = c1 < 0 ? 1 : -1;
        span(-60, -12, Math.min(0, c1), Math.max(0, c1), z, z + 8, M.galv);
        span(-20, -12, Math.min(0, c1), Math.max(0, c1), z, z + 100, M.galv);
        const face = c1 < 0 ? c1 + 12 : c1 - 12;
        span(-110, 30, Math.min(c1, face), Math.max(c1, face), z - 30, z + 170, M.galv);
        for (const a of [-85, 5]) {
          B.rod(at(a, face, z + 120), at(a, face + s * 2, z + 120), 13.5, M.galv, 16);
          B.rod(at(a, face + s * 2, z + 120), at(a, face + s * 9, z + 120), 9.5, M.galv, 6);
        }
      }
    }
  }
  if (L.bridge) {
    const bridge = L.bridge;
    for (let z = z0 + 600; z < z1 - 200; z += BRACKET_PITCH) B.box(bridge.x - 40, bridge.y0, z, bridge.x + 40, bridge.y1, z + 120, M.steel);
  }
  B.into(g);
  return g;
}
