// Guide rails: T profiles of the design's sizes (foot b, blade height h and thickness k) with the rolled shape of the
// real section (the foot tapering to its edges, a radius at the blade's root, the tip's chamfers), their blades
// pointing at the car or the counterweight, from the pit floor up under the slab. Cold-drawn rails (/A) are bright all
// over; on a machined rail (/B) the blade is planed bright and oiled, the foot left in its mill scale; the rolled
// profiles are dark. In 5 m lengths: a hairline at each joint, the fishplate of the rail's size behind it with its
// eight bolts. Every 2.5 m a bracket: the plate behind the foot held by two forged clips, the arm out to the wall in
// one piece or two (railfix.ts); on a counterweight rail Panev's support, its SG and two N1 clips instead
// (staffe.ts); the bridge bracket of a side counterweight. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { FISHPLATES, RAILS, type Layout, type RailType } from '@/shaft';
import type { Section } from '@/shaft/section';
import { KV_VERT } from '@/shaft/norme-vert';
import { Batch } from './geom';
import type { LiftMaterials } from './materials';
import { clippedPlate, fishplate, railFrameOf, wallArm } from './railfix';
import { cwSupport, railSupport } from './staffe';

const BRACKET_PITCH = 2500, RAIL_LENGTH = 5000, JOINT_GAP = 0.6;

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
    const type = r.kind === 'car' ? I.carRail : I.cwRail, { b, h, k } = RAILS[type], F = railFrameOf(r, h), [mBlade, mFoot] = finish(type, M);
    const sec = section(b, h, k);
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
    // a galvanized box in the rail's frame, from (a0, c0, z0) to (a1, c1, z1)
    const RF = F, galv = (a0: number, a1: number, c0: number, c1: number, za: number, zb: number): void => {
      const [p, q] = [F.plan(a0, c0), F.plan(a1, c1)];
      B.box(p[0], p[1], za, q[0], q[1], zb, M.galv);
    };
    const brackets: number[] = [];
    for (let z = z0 + 600; z < z1 - 200; z += BRACKET_PITCH) brackets.push(z);
    // the fishplates behind the joints, clear of the brackets
    const plateLen = FISHPLATES[type].l;
    for (const j of joints) if (!brackets.some((z) => Math.abs(z + 75 - j) < plateLen / 2 + 90)) fishplate(B, M, RF, type, j, galv);
    // a counterweight rail on Panev's supports (staffe.ts) where one fits; otherwise the plate with its two clips and
    // the arm out to the wall (or to the bridge)
    const panev = r.kind === 'cw' ? cwSupport(r, h, I.W, I.D) : null;
    for (const z of brackets) {
      if (panev) {
        railSupport(B, M, panev.wall, I.W, I.D, panev.foot, panev.reach, z, panev.mirror, b / 2, panev.sup);
        continue;
      }
      const outer = clippedPlate(B, M, RF, type, z + 75, galv);
      const toWall = r.bracketAxis === 'x' ? r.bracketTo - (r.x - F.dx * h) : r.bracketTo - (r.y - F.dy * h);
      const along = r.bracketAxis === 'x' ? Math.abs(F.dx) > 0.5 : Math.abs(F.dy) > 0.5;
      if (along) {
        // the wall behind the foot: the arm straight back from the plate
        const a1 = toWall * (r.bracketAxis === 'x' ? F.dx : F.dy), sa = a1 < 0 ? -1 : 1;
        if (Math.abs(a1) > 12) wallArm(B, M, RF, z, [sa, 0], [0, 1], 10, Math.abs(a1) - 10, 0, galv);
      } else {
        // the wall lies across the blade: the arm runs behind the plate, beside the foot, out to it
        const c1 = toWall * (r.bracketAxis === 'x' ? -F.dy : F.dx), sc = c1 < 0 ? -1 : 1;
        if (Math.abs(c1) > outer) wallArm(B, M, RF, z, [0, sc], [-1, 0], 0, Math.abs(c1), 55, galv);
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
