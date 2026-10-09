// The fittings of the shaft, from the drawings' own models: in the pit the access ladder, the control box with its
// stops, light switch and socket, and the pit's lamp where src/shaft/pit-kit.ts places them (the plan of the pit and
// the pit's detail of section A-A draw the same: the ladder in use, its stiles KV_VERT.ladderOverSill over the sill, its
// rungs at ladderRungs; no ladder in a pit that needs a door), the counterweight's screen as src/shaft/screen.ts sizes
// it (from its lower edge over the pit floor up to its height, across the counterweight and its rails, on to the wall
// where the gap is too wide) on its frame of angles; along the shaft the lighting, one fitting a floor and one under
// the slab, on their conduit (in their niche when the shaft has one), and the cable trunking in its chase. Plan and
// heights in millimetres, into the shaft's batch. Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import type { Layout } from '@/shaft';
import { KV } from '@/shaft/norme';
import { KV_VERT } from '@/shaft/norme-vert';
import { lampHeights, nichesOf } from '@/shaft/niche';
import { ladderRungs, pitKit, type PitItem } from '@/shaft/pit-kit';
import { cwScreen } from '@/shaft/screen';
import type { Section } from '@/shaft/section';
import { onWall, type Batch } from './geom';
import { freeSides } from './governor';
import type { LiftMaterials } from './materials';

// a lamp's height without a niche [mm]
const LAMP_H = 600;
// the ladder's stiles along the wall (KV_VERT.ladderW: 300 clear between them), their brackets off the wall and the
// rungs' radius (within F.3.2 c)); the screen's sheet and its frame of flat bars, wide and thick, behind the sheet on
// the car's side of its zone (the counterweight's buffer may reach under the rest) [mm]
const STILE = 35, STANDOFF = 30, RUNG_R = 15, SHEET = 2, BAR = 30, BAR_T = 2;

/** The access ladder in use: two stiles from the pit floor to `top` over the lowest landing z0, on brackets off the
 *  wall, the rungs between them where the drawings put them. */
function ladder(B: Batch, M: LiftMaterials, it: PitItem, W: number, D: number, zBot: number, z0: number, top: number): void {
  const a0 = it.u - it.w / 2, a1 = it.u + it.w / 2, zTop = z0 + top;
  for (const [s0, s1] of [[a0, a0 + STILE], [a1 - STILE, a1]] as const) {
    B.wallBox(it.wall, W, D, s0, s1, STANDOFF, it.d, zBot, zTop, M.galv);
    for (let z = zBot + 400; z < zTop - 150; z += 1200) B.wallBox(it.wall, W, D, s0, s1, 0, STANDOFF, z, z + 50, M.galv);
  }
  const vr = (STANDOFF + it.d) / 2, [ax, ay] = onWall(it.wall, W, D, a0 + STILE, vr), [bx, by] = onWall(it.wall, W, D, a1 - STILE, vr);
  for (const z of ladderRungs(z0 - zBot)) B.rod([ax, ay, z0 + z], [bx, by, z0 + z], RUNG_R, M.galv, 10);
}

/** The pit's control box: a case for each device (KV_VERT.pitBoxH high) at its height over the lowest landing z0 — a
 *  stop with its red mushroom head, the light's switch beside the 2P+PE socket. */
function controlBox(B: Batch, M: LiftMaterials, it: PitItem, W: number, D: number, z0: number, devices: readonly (readonly [number, 'stop' | 'light'])[]): void {
  const h = KV_VERT.pitBoxH, d = it.d, out = (u: number, v: number): readonly [number, number] => onWall(it.wall, W, D, u, v);
  for (const [at, kind] of devices) {
    const z = z0 + at;
    B.wallBox(it.wall, W, D, it.u - it.w / 2, it.u + it.w / 2, 0, d, z - h / 2, z + h / 2, M.base);
    if (kind === 'stop') {
      const [x0, y0] = out(it.u, d), [x1, y1] = out(it.u, d + 22);
      B.rod([x0, y0, z], [x1, y1, z], 22, M.red, 18);
      continue;
    }
    const sw = it.u - it.w / 4, so = it.u + it.w / 4;
    B.wallBox(it.wall, W, D, sw - 18, sw + 18, d, d + 6, z - 25, z + 25, M.chrome);
    B.wallBox(it.wall, W, D, so - 24, so + 24, d, d + 3, z - 24, z + 24, M.chrome);
    for (const k of [-1, 1]) {
      const [x0, y0] = out(so + k * 9, d + 3.5), [x1, y1] = out(so + k * 9, d + 1);
      B.rod([x0, y0, z], [x1, y1, z], 2.5, M.rubber, 8);
    }
  }
}

export function buildPit(L: Layout, S: Section, M: LiftMaterials, B: Batch): void {
  const { W, D } = L.inputs, zBot = S.pitFloor, z0 = S.levels[0] ?? 0, k = pitKit(L);
  // the cameras look in from the right: the shaft's lamps go on the left wall when it is free
  const lamps = freeSides(L)[0];

  // the ladder and the control box where the plan of the pit and section A-A put them (no ladder past 2500 mm: a door)
  if (k.ladder) ladder(B, M, k.ladder, W, D, zBot, z0, k.ladderTop);
  if (k.box) controlBox(B, M, k.box, W, D, z0, [[k.stop, 'stop'], [k.light, 'light'], ...(k.lowStop !== null ? [[k.lowStop, 'stop'] as const] : [])]);
  // the pit's lamp under the landing, with or without the ladder
  if (k.lamp) {
    const l = k.lamp, z = z0 + l.at;
    B.wallBox(l.wall, W, D, l.u - l.w / 2, l.u + l.w / 2, 0, l.d, z - l.h / 2, z + l.h / 2, M.galv);
    B.wallBox(l.wall, W, D, l.u - l.w / 2 + 10, l.u + l.w / 2 - 10, l.d, l.d + 3, z - l.h / 2 + 10, z + l.h / 2 - 10, M.carLight);
  }

  // the counterweight's screen as the drawings size it: the perforated sheet on the car's side of its zone, on a frame
  // of flat bars at its ends (down to the pit floor) and along its lower and upper edges
  const s = cwScreen(L), lo = zBot + s.low, hi = zBot + s.high, f0 = s.v1 - SHEET - BAR_T, f1 = s.v1 - SHEET;
  B.wallBox(s.wall, W, D, s.u0, s.u1, f1, s.v1, lo, hi, M.screen);
  for (const [a, b] of [[s.u0, s.u0 + BAR], [s.u1 - BAR, s.u1]] as const) B.wallBox(s.wall, W, D, a, b, f0, f1, zBot, hi, M.galv);
  for (const z of [lo, hi - BAR]) B.wallBox(s.wall, W, D, s.u0 + BAR, s.u1 - BAR, f0, f1, z, z + BAR, M.galv);

  // shaft lighting: a compact fitting in each recess of its niche, the conduit in the wall behind; without the niche on
  // that wall by the back corner, a fitting a floor and one under the slab on their conduit
  const ln = nichesOf(L.inputs).find((n) => n.use === 'light');
  if (ln) {
    const u = ln.at + ln.width / 2, w = Math.min(100, ln.width / 2 - 20), v0 = -ln.depth, H = KV.nicheLightH;
    const [cx, cy] = onWall(ln.wall, W, D, u - w - 15, v0 + 10);
    B.rod([cx, cy, zBot + 1000], [cx, cy, S.ceiling], 10, M.galv, 8);
    for (const z of lampHeights(S, H)) {
      B.wallBox(ln.wall, W, D, u - w, u + w, v0, v0 + 45, z + 60, z + H - 60, M.galv);
      B.wallBox(ln.wall, W, D, u - w + 12, u + w - 12, v0 + 45, v0 + 48, z + 75, z + H - 75, M.carLight);
    }
  } else if (lamps) {
    const u = D - 130, [cx, cy] = onWall(lamps, W, D, u - 60, 25);
    B.rod([cx, cy, zBot + 1000], [cx, cy, S.ceiling], 10, M.galv, 8);
    for (const z of lampHeights(S, LAMP_H)) {
      B.wallBox(lamps, W, D, u - 35, u + 35, 0, 50, z, z + LAMP_H, M.galv);
      B.wallBox(lamps, W, D, u - 22, u + 22, 50, 53, z + 20, z + LAMP_H - 20, M.carLight);
    }
  }

  // the cable trunking in its chase, pit floor to slab: the channel and its cover
  for (const n of nichesOf(L.inputs).filter((x) => x.use === 'duct')) {
    const u = n.at + n.width / 2, hw = Math.min(50, n.width / 2 - 10), d = Math.min(60, n.depth - 10), v0 = -n.depth;
    if (hw <= 5 || d <= 5) continue;
    B.wallBox(n.wall, W, D, u - hw, u + hw, v0, v0 + d - 3, zBot, S.ceiling, M.galv);
    B.wallBox(n.wall, W, D, u - hw + 3, u + hw - 3, v0 + d - 3, v0 + d, zBot, S.ceiling, M.galv);
  }
}
