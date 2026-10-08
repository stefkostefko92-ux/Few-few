// The lift's rope rig on the shaft's sheets (shaft-rig.ts, Layout.rig), where the 3D puts it: in every plan the runs
// down to a machine below (under the pit, their openings in the pit's slab); in the plan of the headroom the pulleys over
// the shaft — hung under the slab between the cheeks of their frame, or dashed over it in the pulley room —, the level
// run between two of them, the car's and the counterweight's pulleys of a 2:1 roping and its dead ends, the governor of a
// machine below on its bracket; in section A-A the same seen from the side, the runs down to the machine, the openings
// of the slabs the ropes go through. Each load of sheet 1 where it acts: P1 on the pulleys over the shaft, P2 and P3 on
// the dead ends, P4 on the governor's bracket. Model entities for the drawing kernel; the shaft's own drawing is
// plan-view.ts and section-view.ts. Pure.
import { chain, circle, grow, line, path, rect, type Box, type Entity, type Pt } from '../drawing';
import { GOV_BRACKET, governorSpot } from './governor';
import { roofRefuge } from './roof';
import { cwPlateAt, type Section } from './section';
import { pulleyBox, type RigP2, type RigPulley, type ShaftRig } from './shaft-rig';
import type { Layout } from './types';

/** The wheel of a pulley inside its cheeks, the cheeks' plates along its plane, its frame's top plate under the slab and
 *  the axle past the cheeks [mm] (the 3D's: pulleys.ts). */
const WHEEL_IN = 18, CHEEK_L = 80, PLATE_L = 140, PLATE_OVER = 40, PLATE_T = 14, AXLE_OVER = 22, CHEEK_UNDER = 70;
/** A pulley standing in the pulley room: its side members past the wheel along its plane, and as high [mm] (pulleys.ts). */
const STAND_OVER = 110, STAND_H = 140;
/** The pit's slab as section A-A draws it [mm] (section-view.ts). */
const PIT_SLAB = 220;
/** A reference's circle at 1:25 [mm] (view.ts tag), and how far from what it names it is put. */
const TAG_R = 50, TAG_AT = [240, 340, 460, 620] as const;

/** A point `u` along a pulley's plane and `a` across it, from its centre. */
const on = (p: RigPulley, u: number, a: number): Pt => [p.c[0] + u * p.dir[0] - a * p.dir[1], p.c[1] + u * p.dir[1] + a * p.dir[0]];
const quadOn = (p: RigPulley, u0: number, a0: number, u1: number, a1: number): Pt[] => [on(p, u0, a0), on(p, u1, a0), on(p, u1, a1), on(p, u0, a1)];
const meets = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const around = (c: Pt, r: number): Box => ({ x0: c[0] - r, y0: c[1] - r, x1: c[0] + r, y1: c[1] + r });

/** A free place for a reference near `at`: round it at growing distances, clear of `taken` and inside `within`; the
 *  first place tried when none is. */
function tagNear(at: Pt, taken: Box[], within: Box): Pt {
  const spots: Pt[] = [];
  for (const d of TAG_AT) for (let k = 0; k < 8; k++) spots.push([at[0] + d * Math.cos((k * Math.PI) / 4 + Math.PI / 8), at[1] + d * Math.sin((k * Math.PI) / 4 + Math.PI / 8)]);
  const ok = (p: Pt): boolean => p[0] - TAG_R >= within.x0 && p[0] + TAG_R <= within.x1 && p[1] - TAG_R >= within.y0 && p[1] + TAG_R <= within.y1 && !taken.some((b) => meets(around(p, TAG_R), b));
  const got = spots.find(ok) ?? spots[0];
  taken.push(around(got, TAG_R));
  return got;
}

/** A pulley seen from above: the wheel between its cheeks and its axle; hung under the slab with its frame's top plate
 *  over it (dashed: over the cut), or all dashed over the slab on its stand's side members (`stand`). */
function pulleyPlan(p: RigPulley, hung: boolean, seen: boolean, stand = false): Entity[] {
  const w = p.half - WHEEL_IN, st = seen ? 'outline' : 'hidden', out: Entity[] = [];
  if (hung) out.push(path(quadOn(p, -PLATE_L, -(p.half + PLATE_OVER), PLATE_L, p.half + PLATE_OVER), true, 'hidden'));
  else if (stand) for (const k of [-1, 1]) out.push(path(quadOn(p, -(p.r + STAND_OVER), k * (p.half - 10), p.r + STAND_OVER, k * p.half), true, 'hidden'));
  for (const s of [-1, 1]) out.push(path(quadOn(p, -CHEEK_L, s * (p.half - 10), CHEEK_L, s * p.half), true, seen ? 'thin' : 'hidden', seen ? 'steel' : undefined));
  out.push(path(quadOn(p, -p.r, -w, p.r, w), true, st, seen ? 'zinc' : undefined), line(on(p, 0, -(p.half + AXLE_OVER)), on(p, 0, p.half + AXLE_OVER), seen ? 'thin' : 'hidden'));
  return out;
}

/** A rope pack at `m` in plan: half `along` across the ropes, half `wide` along `across` (the ropes side by side). */
function pack(rig: ShaftRig, m: RigP2, along: number, wide: number): Pt[] {
  const [ax, ay] = rig.across, [bx, by] = [-ay, ax];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]): Pt => [m[0] + i * along * bx + j * wide * ax, m[1] + i * along * by + j * wide * ay]);
}

/** The rig in the plan at `level`. */
export function rigPlan(L: Layout, level: 'top' | 'main' | 'bottom' | 'pit'): Entity[] {
  const rig = L.rig;
  if (!rig) return [];
  const { W, D } = L.inputs, out: Entity[] = [], within: Box = { x0: 0, y0: 0, x1: W, y1: D };
  // the runs down to a machine below, at every level; under the pit their openings in its slab
  for (const m of rig.down) {
    out.push(path(pack(rig, m, rig.d / 2 + 2, rig.ropes), true, 'outline', 'steel'));
    if (level === 'pit' && rig.scheme === 'under') out.push(path(pack(rig, m, rig.d / 2 + 60, rig.ropes + 60), true, 'thin'));
  }
  if (level === 'pit') return out;
  // the car's pulley of a 2:1 roping on its crosshead: seen in the headroom, over the cut at a floor
  if (rig.car) out.push(...pulleyPlan(rig.car, false, level === 'top'));
  if (level !== 'top') return out;
  if (rig.cw) out.push(...pulleyPlan(rig.cw, false, true));
  // the references keep off the pulleys, the counterweight, the rails with their brackets, the place to stand and the
  // refuge's dimensions on the roof (plan-dims.ts: across it at 0,28 of its sides)
  const taken: Box[] = [...rig.head, ...(rig.car ? [rig.car] : []), ...(rig.cw ? [rig.cw] : [])].map(pulleyBox), { refuge: r, free } = roofRefuge(L);
  taken.push({ x0: L.cw.x, y0: L.cw.y, x1: L.cw.x + L.cw.w, y1: L.cw.y + L.cw.h }, grow(free, 80), ...L.rails.map((q) => grow({ x0: q.x, y0: q.y, x1: q.x, y1: q.y }, 200)));
  const ry = r.y0 + 0.28 * (r.y1 - r.y0), rx = r.x0 + 0.28 * (r.x1 - r.x0);
  taken.push({ x0: r.x0, y0: ry - 90, x1: r.x1, y1: ry + 90 }, { x0: rx - 90, y0: r.y0, x1: rx + 90, y1: r.y1 });
  // the pulleys over the shaft: hung under the slab, or over it in the pulley room; the level runs (their loads P1, P2,
  // P3 and P4 the head's references place: lib/tavole/head-loads.ts)
  for (const p of rig.head) out.push(...pulleyPlan(p, rig.hung, rig.hung, !rig.hung));
  for (const r of rig.runs) {
    const dx = r.b[0] - r.a[0], dy = r.b[1] - r.a[1], n = Math.hypot(dx, dy) || 1, ox = (-dy / n) * rig.ropes, oy = (dx / n) * rig.ropes;
    out.push(line([r.a[0] + ox, r.a[1] + oy], [r.b[0] + ox, r.b[1] + oy], rig.hung ? 'thin' : 'hidden'), line([r.a[0] - ox, r.a[1] - oy], [r.b[0] - ox, r.b[1] - oy], rig.hung ? 'thin' : 'hidden'));
  }
  // the dead ends of a 2:1 roping on their plates under the slab, P2 on the car's side and P3 on the counterweight's (with
  // the machine below the head's references place them)
  for (const e of rig.dead) {
    const q: RigPulley = { c: e.at, dir: e.dir, z: 0, r: 90, half: rig.ropes + 50 }, part = e.tag === 'P2' ? rig.car : rig.cw;
    out.push(path(quadOn(q, -90, -q.half, 90, q.half), true, 'hidden'), circle(e.at as Pt, Math.max(8, rig.d), 'outline', 'steel'));
    if (rig.scheme === null) out.push({ e: 'tag', at: tagNear(e.at as Pt, taken, within), text: e.tag, to: e.at as Pt });
    // where the slab is drilled for it: from the axes of the part it holds (its pulley's centre), a reference
    if (part) {
      for (const k of [0, 1] as const) {
        if (Math.abs(e.at[k] - part.c[k]) < 1) continue;
        const pts = [Math.min(e.at[k], part.c[k]), Math.max(e.at[k], part.c[k])];
        out.push(chain({ dir: k ? 'y' : 'x', pts, at: e.at[1 - k] + (k ? 140 : -140), from: e.at[1 - k] }));
      }
    }
  }
  out.push(...governorPlan(L));
  return out;
}

/** The governor of a machine below on its bracket from the side wall under the ceiling (registry limitatore.vano): its
 *  base on the bracket's plate out to the base's inner edge, the sheave and its rope's plane from the wall (a reference:
 *  the plan of the main floor sets it); P4 on it the head's references place (lib/tavole/head-loads.ts). */
function governorPlan(L: Layout): Entity[] {
  const g = governorSpot(L);
  if (!L.rig?.governor || !g) return [];
  const G = g.G, yc = (g.y1 + g.y2) / 2, wall = g.side === 'left' ? 0 : L.inputs.W, inner = g.x + (g.side === 'left' ? 1 : -1) * G.baseA;
  return [
    rect(Math.min(wall, inner), yc - G.baseW, Math.max(wall, inner), yc + G.baseW, 'thin', 'paper'),
    rect(g.x - G.baseA, yc - G.baseW, g.x + G.baseA, yc + G.baseW, 'outline', 'paper'), rect(g.x - G.half, yc - G.R - 14, g.x + G.half, yc + G.R + 14, 'outline', 'steel'),
    chain({ dir: 'x', pts: [Math.min(wall, g.x), Math.max(wall, g.x)], at: yc + G.baseW + 130, from: yc + G.baseW, text: ['Limitatore {v}'] }),
  ];
}

/** The outline of a pulley seen along the shaft's width (section A-A: plan y across, height up): its wheel's two rims
 *  in their plane, the hull round them. */
function pulleySide(p: RigPulley, z: number, P: (x: number, z: number) => Pt): Pt[] {
  const w = p.half - WHEEL_IN, pts: [number, number][] = [];
  for (let k = 0; k < 36; k++) {
    const t = (k * Math.PI) / 18;
    for (const a of [-w, w]) pts.push([p.c[1] + p.r * Math.cos(t) * p.dir[1] + a * p.dir[0], z + p.r * Math.sin(t)]);
  }
  // the convex hull (monotone chain)
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (xs: [number, number][]): [number, number][] => {
    const h: [number, number][] = [];
    for (const q of xs) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    return h.slice(0, -1);
  };
  return [...half(pts), ...half([...pts].reverse())].map(([y, zz]) => P(y, zz));
}

/** The room over the shaft as section A-A names it, where (`y` across the depth) and at what height (`z`): the pulley
 *  room of a machine below in the widest stretch its pulleys leave free (over them when none is 800 mm wide), else the
 *  machine room in the middle. */
export function roomName(L: Layout, z: number): { text: string; y: number; z: number } {
  const rig = L.rig, D = L.inputs.D;
  if (rig?.scheme !== 'room') return { text: 'LOCALE MACCHINA', y: D / 2, z };
  const spans = rig.head.map((p) => {
    const e = Math.abs(p.dir[1]) * p.r + Math.abs(p.dir[0]) * p.half;
    return [p.c[1] - e - 60, p.c[1] + e + 60] as const;
  }).sort((a, b) => a[0] - b[0]);
  let best = { a: 0, b: 0 }, at = 0;
  for (const [a, b] of [...spans, [D, D] as const]) {
    if (a - at > best.b - best.a) best = { a: at, b: a };
    at = Math.max(at, b);
  }
  if (best.b - best.a >= 800) return { text: 'LOCALE PULEGGE DI RINVIO', y: (best.a + best.b) / 2, z };
  return { text: 'LOCALE PULEGGE DI RINVIO', y: D / 2, z: Math.max(z, ...rig.head.map((p) => p.z + p.r + 180)) };
}

/** The solid stretches of a slab from `a` to `b` across the depth with the openings `cuts`. */
export function solid(a: number, b: number, cuts: readonly (readonly [number, number])[]): [number, number][] {
  const out: [number, number][] = [];
  let at = a;
  for (const [c0, c1] of [...cuts].sort((p, q) => p[0] - q[0])) {
    if (c0 > at + 1) out.push([at, Math.min(c0, b)]);
    at = Math.max(at, c1);
  }
  if (b > at + 1) out.push([at, b]);
  return out;
}

/** The openings of the pit's slab across the depth where the ropes of a machine under the pit go through it (as its
 *  plan draws them: 60 mm round the pack). */
export function pitHoles(L: Layout): [number, number][] {
  const rig = L.rig;
  if (rig?.scheme !== 'under') return [];
  return rig.down.map((m): [number, number] => {
    const e = Math.abs(rig.across[1]) * (rig.ropes + 60) + Math.abs(rig.across[0]) * (rig.d / 2 + 60);
    return [m[1] - e, m[1] + e];
  });
}

/** The height the car's and the counterweight's ropes go up to in section A-A: the pulleys over the shaft of a machine
 *  below, else the slab (`ceiling`). */
export const ropeTop = (L: Layout, ceiling: number): number => (L.rig?.head.length ? L.rig.head[0].z : ceiling);

/** The rig in section A-A with the car at the floor `zf` (`atTop`: the top floor, the car's pulley also where the
 *  counterweight on its buffer lets it go); `zTop`: the top of the view. */
export function rigSection(L: Layout, S: Section, P: (x: number, z: number) => Pt, zf: number, atTop: boolean, zTop: number): Entity[] {
  const rig = L.rig;
  if (!rig) return [];
  const out: Entity[] = [], ceil = S.ceiling, slab = L.inputs.room?.slab ?? 0;
  const bx = (y0: number, z0: number, y1: number, z1: number, st: Parameters<typeof rect>[4], fill?: Parameters<typeof rect>[5]): Entity => path([P(y0, z0), P(y1, z0), P(y1, z1), P(y0, z1)], true, st, fill);
  // the pit's slab over a room under it: what it carries
  if (rig.scheme === 'under') out.push({ e: 'text', at: P(L.inputs.D / 2, S.pitFloor - PIT_SLAB / 2 - 40), text: 'SOLETTA PORTANTE SU LOCALE ACCESSIBILE: ≥ 5000 N/m² E P5-P8', size: 1.5, align: 'c', halo: true });
  // the runs down to the machine from the pulleys over the shaft
  const zh = rig.head.length ? rig.head[0].z : ceil;
  for (const m of rig.down) out.push(line(P(m[1], zh), P(m[1], rig.downTo), 'thin'));
  // the pulleys over the shaft: hung from their frames under the slab, or standing in the pulley room
  for (const p of rig.head) {
    const ch = Math.abs(p.dir[1]) * CHEEK_L + Math.abs(p.dir[0]) * p.half;
    if (rig.hung) {
      const pl = Math.abs(p.dir[1]) * PLATE_L + Math.abs(p.dir[0]) * (p.half + PLATE_OVER);
      out.push(bx(p.c[1] - ch, p.z - CHEEK_UNDER, p.c[1] + ch, ceil - PLATE_T, 'thin'), bx(p.c[1] - pl, ceil - PLATE_T, p.c[1] + pl, ceil, 'outline', 'steel'));
    } else {
      // on its stand on the pulley room's floor: the side members across the opening, the cheeks up to the axle
      const floor = ceil + slab, sm = Math.abs(p.dir[1]) * (p.r + STAND_OVER) + Math.abs(p.dir[0]) * p.half;
      out.push(bx(p.c[1] - sm, floor, p.c[1] + sm, floor + STAND_H, 'thin', 'zinc'), bx(p.c[1] - ch, floor + STAND_H, p.c[1] + ch, p.z + CHEEK_UNDER, 'thin'));
    }
    out.push(path(pulleySide(p, p.z, P), true, 'outline', 'zinc'), circle(P(p.c[1], p.z), Math.max(15, 0.12 * p.r), 'thin', 'paper'));
  }
  for (const r of rig.runs) out.push(line(P(r.a[1], r.z), P(r.b[1], r.z), 'thin'));
  if (rig.head.length) {
    const p = rig.head[0], to: Pt = rig.hung ? P(p.c[1], ceil - PLATE_T / 2) : P(p.c[1], ceil + slab);
    out.push({ e: 'tag', at: P(p.c[1] - 330, rig.hung ? ceil - 150 : ceil + slab + 150), text: 'P1', to });
  }
  // a 2:1 roping: the car's pulley on its crosshead (where the counterweight lets it go: dashed), the counterweight's on
  // its frame, the dead ends on their plates under the slab with their sockets, P2 and P3
  if (rig.car) {
    out.push(path(pulleySide(rig.car, zf + rig.car.z, P), true, 'outline', 'zinc'));
    if (atTop) out.push(path(pulleySide(rig.car, zf + S.moveUp + rig.car.z, P), true, 'space'));
  }
  if (rig.cw) out.push(path(pulleySide(rig.cw, cwPlateAt(S, zf) + rig.cw.z, P), true, 'outline', 'zinc'));
  rig.dead.forEach((e, i) => {
    const h = Math.abs(e.dir[1]) * 90 + Math.abs(e.dir[0]) * (rig.ropes + 50);
    out.push(bx(e.at[1] - h, ceil - 16, e.at[1] + h, ceil, 'outline', 'steel'), line(P(e.at[1], ceil - 16), P(e.at[1], e.z), 'outline'));
    out.push({ e: 'tag', at: P(e.at[1] + (i ? 1 : -1) * 260, Math.min(zTop, ceil) - 420), text: e.tag, to: P(e.at[1], ceil - 8) });
  });
  out.push(...governorSection(L, S, P));
  return out;
}

/** The governor of a machine below on its bracket in section A-A — dashed when it stands in front of the cut, between it
 *  and the one looking —: the bracket's plate and the braces under it, the base, the sheave face on, its two strands down
 *  the shaft, P4 on the bracket (its axle's height under the slab: registry limitatore.vano, the note on sheet 1). */
function governorSection(L: Layout, S: Section, P: (x: number, z: number) => Pt): Entity[] {
  const g = governorSpot(L), zg = L.rig?.governor?.z;
  if (zg === undefined || !g) return [];
  const G = g.G, yc = (g.y1 + g.y2) / 2, zb = zg - G.axle, out: Entity[] = [], front = g.x > L.car.x + L.car.w / 2;
  const st = (s: 'outline' | 'thin'): 'outline' | 'thin' | 'hidden' => (front ? 'hidden' : s);
  const bx = (y0: number, z0: number, y1: number, z1: number, s: 'outline' | 'thin', fill?: Parameters<typeof rect>[5]): Entity =>
    path([P(y0, z0), P(y1, z0), P(y1, z1), P(y0, z1)], true, st(s), front ? undefined : fill);
  // (the strands down to the tension pulley in the pit: 3D governor.ts)
  for (const y of [g.y1, g.y2]) out.push(line(P(y, zg), P(y, S.pitFloor + 480), front ? 'hidden' : 'fine'));
  for (const w of [-80, 80]) out.push(line(P(yc + w, zb - GOV_BRACKET.brace), P(yc + w, zb - GOV_BRACKET.plate), st('thin')));
  out.push(bx(yc - G.baseW, zb - GOV_BRACKET.plate, yc + G.baseW, zb, 'outline', 'steel'), bx(yc - G.baseW + 20, zb, yc + G.baseW - 20, zg + G.top, 'thin', 'paper'));
  out.push(circle(P(yc, zg), G.R, st('outline'), front ? undefined : 'paper'), circle(P(yc, zg), 0.25 * G.R, st('thin')));
  out.push({ e: 'tag', at: P(yc - G.baseW - 330, zb - 220), text: 'P4', to: P(yc - G.baseW, zb - GOV_BRACKET.plate / 2) });
  return out;
}
