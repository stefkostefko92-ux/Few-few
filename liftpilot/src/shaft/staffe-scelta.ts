// Which Panev bracket takes each counterweight rail. Chosen by hand (ShaftInputs.panev.cw): that article where it takes
// the rail, else none (the check says by how much it misses). By default the shortest SU or SD whose printed range takes
// the rail's distance from its wall and whose plate fits there (staffe.ts); when none does, an SC on the wall behind
// the rail's foot, where the rail stands near a corner (staffe-sc.ts). A solution to the site's drawing (pp. 61-62)
// is never placed by the software: the rail keeps a generic bracket labelled with its articles, and the check asks for
// the drawing. Pure: the layout checks it, the plan draws it, the 3D builds it, the bill of materials counts it.
import { RAILS } from './rails';
import { SUPPORTS, armMargin, onItsWall, supportCode, supportFor, type Support } from './staffe';
import { isCwSpecial, type CwChoice, type CwSpecial } from './staffe-ids';
import { SC_SUPPORTS, scMiss, scPlace, type ScPlace, type ScSupport } from './staffe-sc';
import type { DoorLayout, HeadWalls, Rail, ShaftInputs, Wall } from './types';

/** An SU or SD with its foot square to the wall (staffe.ts's geometry). */
export interface ArmBracket { kind: 'arm'; wall: Wall; foot: number; reach: number; mirror: boolean; sup: Support; inset: number }
/** An SC on the wall behind the rail's foot: the rail's axis at u along it, its foot `gap` from it. */
export interface SlideBracket { kind: 'slide'; wall: Wall; u: number; gap: number; sc: ScSupport; place: ScPlace; inset: number }
export type CwBracket = ArmBracket | SlideBracket;

/** The articles of a bracket as the plan and the bill of materials name them. */
export const bracketCode = (b: CwBracket): string => (b.kind === 'arm' ? `${supportCode(b.sup)} + SG 80 ${b.sup.sg}` : `${b.sc.code} + SG ${b.sc.sg.w} ${b.sc.sg.l}`);

/** The solution to the site's drawing chosen for the counterweight rails, if any. */
export const cwSpecialOf = (I: ShaftInputs): CwSpecial | null => {
  const c = I.panev?.cw;
  return c && isCwSpecial(c) ? c : null;
};

/** The wall behind a rail's foot (its blade points away from it): the rail's axis along it, the foot's back from it,
 *  the stretch of it free around the axis (its corners where the walls stand at that height, door frames, niches).
 *  Null inside a niche, or where a door frame stands at the axis. */
function behindFoot(I: ShaftInputs, doors: readonly DoorLayout[], r: Rail, span?: readonly [number, number], head?: HeadWalls) {
  if (span) return null;
  const h = RAILS[I.cwRail].h, H = { front: 0, rear: 0, left: 0, right: 0, ...head };
  const [wall, u, gap]: [Wall, number, number] = r.dir === 'right' ? ['left', r.y, r.x - h] : r.dir === 'left' ? ['right', r.y, I.W - r.x - h]
    : r.dir === 'back' ? ['front', r.x, r.y - h] : ['rear', r.x, I.D - r.y - h];
  const across = wall === 'front' || wall === 'rear';
  let lo = across ? H.left : H.front, hi = (across ? I.W - H.right : I.D - H.rear);
  const cuts = [...doors.filter((d) => d.wall === wall).map((d) => [d.frame0, d.frame1] as const),
    ...(I.niches ?? []).filter((n) => n.wall === wall).map((n) => [n.at, n.at + n.width] as const)];
  for (const [a, b] of cuts) {
    if (b <= u) lo = Math.max(lo, b);
    else if (a >= u) hi = Math.min(hi, a);
    else return null;
  }
  return { wall, u, gap: gap - H[wall], lo, hi, inset: -H[wall] };
}

/** The bracket of a counterweight rail (`span`: inside its niche; `head`: the walls where they stand in the headroom),
 *  or null: none of the catalogue takes it, a solution to drawing is chosen, or the blade does not run along a wall. */
export function cwBracket(I: ShaftInputs, doors: readonly DoorLayout[], r: Rail, span?: readonly [number, number], head?: HeadWalls): CwBracket | null {
  const pick: CwChoice | undefined = I.panev?.cw, { h, b } = RAILS[I.cwRail];
  if (pick && isCwSpecial(pick)) return null;
  const g = onItsWall(r, h, I.W, I.D, span, head);
  if (g && (!pick || !pick.startsWith('SC'))) {
    const sup = pick ? SUPPORTS.find((s) => supportCode(s) === pick && armMargin(g, s) >= 0) : supportFor(g.reach, g.back, g.ahead);
    if (sup) return { kind: 'arm', wall: g.wall, foot: g.foot, reach: g.reach, mirror: g.mirror, sup, inset: g.inset };
    if (pick) return null;
  }
  const w = behindFoot(I, doors, r, span, head);
  if (!w) return null;
  for (const sc of SC_SUPPORTS) {
    if (pick && sc.code !== pick) continue;
    const place = scPlace(sc, w.u, w.gap, w.lo, w.hi, b / 2);
    if (place) return { kind: 'slide', wall: w.wall, u: w.u, gap: w.gap, sc, place, inset: w.inset };
  }
  return null;
}

/** How well the catalogue takes a counterweight rail [mm]: the room the bracket chosen leaves; when none takes it, below
 *  0 by how much the nearest misses (among the article chosen by hand, if any). Null when no wall can carry it. */
export function cwBracketMargin(I: ShaftInputs, doors: readonly DoorLayout[], r: Rail, span?: readonly [number, number], head?: HeadWalls): number | null {
  const pick = I.panev?.cw, h = RAILS[I.cwRail].h, g = onItsWall(r, h, I.W, I.D, span, head), br = cwBracket(I, doors, r, span, head);
  if (br) return br.kind === 'arm' && g ? armMargin(g, br.sup) : br.kind === 'slide' ? br.place.slack : null;
  const misses: number[] = [];
  if (g) for (const s of SUPPORTS) if (!pick || supportCode(s) === pick) misses.push(armMargin(g, s));
  const w = behindFoot(I, doors, r, span, head);
  if (w && (!pick || pick.startsWith('SC'))) for (const sc of SC_SUPPORTS) if (!pick || sc.code === pick) misses.push(scMiss(sc, w.u, w.gap, w.lo, w.hi));
  return misses.length ? Math.min(-1, Math.max(...misses)) : null;
}
