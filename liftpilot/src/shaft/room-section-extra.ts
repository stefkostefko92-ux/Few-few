// What section B-B of the machine room shows besides the machine and its support (room-section-view.ts): the room's
// door and control panel where the view sees them (beyond the cut; on a wall the cut runs into, its opening dashed in
// the wall), so their heights stand on their side; the upstands round the slab's openings (registry locale.fori); a 2:1
// roping's hitches with P2 and P3 (locale.attacchi); the lifting hook with the free height under it (locale.gancio); the
// free height over the machine's rotating parts (m_above); the notes in words (the mounts and fixings of the support, the
// HEB beams' bearings), each where it keeps off what is drawn. Lettering measured as the kernel draws it (TEXT.min at
// least: room-label.ts). Model entities: u along the drop line, z over the room's floor [mm]; pure.
import { TEXT, chain, line, rect, rowsRoom, textWidth, wrap, type Align, type Box, type Entity, type Pt } from '../drawing';
import type { MachineSpec, RoomGeo } from './machine-room';
import { KV_VERT } from './norme-vert';
import { rotatingTopAt } from './room-above';
import { WALL, holesOf } from './room-draw';
import { panelBox, wallBox } from './room-floor';
import type { Hook } from './room-hook';
import { AT, firstClear, gridNear, leaderFrom, leastOn, letteringBox, placeOf, segMeets, takenBy, type Tries } from './room-label';
import type { RoomSite } from './room-site';

type Side = 'left' | 'right';

/** Where a room point stands along the drop line (u) and across it (v, toward the view: beyond the cut). */
const uv = (G: RoomGeo, p: Pt): [number, number] => {
  const dx = p[0] - G.carDrop[0], dy = p[1] - G.carDrop[1];
  return [dx * G.ux + dy * G.uy, -dx * G.uy + dy * G.ux];
};

/** The control panel's corners in plan (room axes). */
const panelCorners = (G: RoomGeo): Pt[] => {
  const [p0, p1, p2, p3] = panelBox(G.room);
  return [[p0, p1], [p2, p1], [p2, p3], [p0, p3]];
};

/** Whether section B-B sees the control panel (beyond its cut): else its height is given on the plan. */
export const panelSeen = (G: RoomGeo): boolean => Math.max(...panelCorners(G).map((p) => uv(G, p)[1])) > 1;

/** The door and the control panel as the section sees them: beyond the cut drawn (the door's opening dashed in a wall
 *  the cut runs into, as its jambs are seen edge-on; the panel's outline in front of its wall), each with the side its
 *  height stands on; behind the cut (the view turned from them) nothing, the height stays on the plan. `r0`, `r1`: the
 *  room's walls along u. */
export function seenFittings(G: RoomGeo, r0: number, r1: number): { entities: Entity[]; door: Side | null; panel: Side | null; panelSpan: [number, number] | null } {
  const R = G.room, out: Entity[] = [], mid = (r0 + r1) / 2;
  const seen = (corners: readonly Pt[], h: number): { side: Side; span: [number, number] } | null => {
    const q = corners.map((p) => uv(G, p)), us = q.map(([u]) => u), u0 = Math.min(...us), u1 = Math.max(...us);
    if (Math.max(...q.map(([, v]) => v)) <= 1) return null;
    const side: Side = (u0 + u1) / 2 < mid ? 'left' : 'right';
    // edge-on in a wall the cut runs into: the opening through the wall's section (the cut through the opening itself
    // draws its jambs)
    if (u1 - u0 < 1) {
      if (Math.min(...q.map(([, v]) => v)) > -1) out.push(rect(side === 'left' ? r0 - WALL : r1, 0, side === 'left' ? r0 : r1 + WALL, h, 'hidden'));
    } else out.push(rect(Math.max(u0, r0), 0, Math.min(u1, r1), h, 'thin'));
    return { side, span: [Math.max(u0, r0), Math.min(u1, r1)] };
  };
  const [b0, b1, b2, b3] = wallBox(R, R.doorWall, R.doorAt, R.doorW, 0, 0), door = seen([[b0, b1], [b2, b3]], R.doorH);
  const panel = seen(panelCorners(G), R.panelH);
  return { entities: out, door: door?.side ?? null, panel: panel?.side ?? null, panelSpan: panel?.span ?? null };
}

/** The upstands round the slab's openings, KV_VERT.slabKerb high and KV_VERT.kerbW thick on the floor. */
export function kerbsSection(S: RoomSite, M: MachineSpec, G: RoomGeo): Entity[] {
  const w = KV_VERT.kerbW, h = KV_VERT.slabKerb;
  return holesOf(S, M, G).flatMap((o) => [rect(o.u0 - w, 0, o.u0, h, 'outline', 'concrete'), rect(o.u1, 0, o.u1 + w, h, 'outline', 'concrete')]);
}

/** The first upstand's height dimensioned beside it, on the side with room for it between the walls `r0`, `r1` and
 *  off the upright chains already across the section (`out`); none where neither has. */
export function kerbDim(S: RoomSite, M: MachineSpec, G: RoomGeo, out: readonly Entity[], r0: number, r1: number, sk: number): Entity[] {
  const w = KV_VERT.kerbW, holes = holesOf(S, M, G), first = holes[0], last = holes[holes.length - 1];
  if (!first || !last) return [];
  const ats = out.flatMap((e) => (e.e === 'chain' && e.c.dir === 'y' && e.c.at !== undefined && !e.c.side ? [e.c.at] : []));
  const before = first.u0 - w - 70 * sk, after = last.u1 + w + 70 * sk;
  const clear = (a: number): boolean => ats.every((x) => Math.abs(x - a) > 110 * sk);
  const at = before - 90 * sk >= r0 + 40 * sk && clear(before) ? before : after + 40 * sk <= r1 && clear(after) ? after : null;
  if (at === null) return [];
  return [chain({ dir: 'y', pts: [0, KV_VERT.slabKerb], at, from: at === before ? [first.u0 - w, first.u0 - w] : [last.u1 + w, last.u1 + w], text: ['{v} Bordo'] })];
}

/** A 2:1 roping's hitches: the plate under the slab with its through-bolts and the counter-plate on the floor, the rope
 *  down from it, P2 (the car's) or P3 beside it. `foot`: where the ropes are cut. */
export function hitchesSection(G: RoomGeo, foot: number, sk: number): Entity[] {
  const out: Entity[] = [], R = G.room, hp = KV_VERT.hitchPlate / 2, t = KV_VERT.hitchPlateT, xs = G.deadEnds.map(({ at }) => uv(G, at)[0]);
  // what they are, under them (registry locale.attacchi)
  if (xs.length) out.push({ e: 'text', at: [(Math.min(...xs) + Math.max(...xs)) / 2, -R.slab - 330 * sk], text: `Attacchi funi: piastre ${KV_VERT.hitchPlate}×${KV_VERT.hitchPlate}×${t} con tirafondi passanti`, size: 1.5, align: 'c', halo: true });
  G.deadEnds.forEach(({ at }, i) => {
    const [x] = uv(G, at);
    out.push(rect(x - hp, -R.slab - t, x + hp, -R.slab, 'outline', 'steel'), rect(x - hp, 0, x + hp, 15, 'outline', 'steel'), line([x, -R.slab - t], [x, foot], 'thin'));
    for (const s of [-1, 1]) out.push(line([x + s * (hp - 30), -R.slab - t - 25], [x + s * (hp - 30), 40], 'thin'));
    out.push({ e: 'tag', at: [x + (i === 0 ? -1 : 1) * (hp + 130 * sk), -R.slab - 160 * sk], text: i === 0 ? 'P2' : 'P3', to: [x, -R.slab - t] });
  });
  return out;
}

/** The paper by section B-B no row of dimensions takes, where a name or a note goes with its leader when none is clear
 *  in the drawing: under its foot (no row is ever there) between the walls' outer faces, and right of the room when no
 *  row of `out` stands there (as far as a note 45 mm wide), each as deep as `paper` (the area the view has) leaves at
 *  the scale `k` (model millimetres to one of paper) beside the drawing's `bounds` and its rows; null: no paper there.
 *  The drawing's bounds take what goes there (room-section-view.ts). */
export function outsideSection(out: readonly Entity[], bounds: Box, k: number, paper?: { w: number; h: number }): Outside {
  const r = rowsRoom(out), spare = (have: number | undefined, rows: number, drawn: number, most: number): number => Math.min(most, have === undefined ? most : have - rows - drawn / k - 0.5);
  const down = spare(paper?.h, r.top + r.bottom, bounds.y1 - bounds.y0, 93), side = spare(paper?.w, r.left + r.right, bounds.x1 - bounds.x0, 48);
  const free = !out.some((e) => e.e === 'chain' && e.c.side === 'right');
  return {
    below: down >= 10 ? { x0: bounds.x0, y0: bounds.y0 - down * k, x1: bounds.x1, y1: bounds.y0 - 3 * k } : null,
    right: free && side >= 10 ? { x0: bounds.x1 + 3 * k, y0: bounds.y0, x1: bounds.x1 + side * k, y1: bounds.y1 } : null,
  };
}

/** Where outside section B-B a name or a note may go (outsideSection). */
export interface Outside {
  below: Box | null;
  right: Box | null;
}

/** The lifting hook under the ceiling with its name and rated load, the name beside the shank — on the side clear of
 *  the lettering and the dimension lines of `out` and of `busy` (the machine), under the ceiling or lower down the
 *  shank, inside the room's walls, in one line or in two —, else the nearest clear in the room, else outside the
 *  drawing (`outsideSection`: right of the room, then under its foot), each of these with a leader to the hook. */
export function hookSection(G: RoomGeo, hook: Hook, out: readonly Entity[], area: { r0: number; r1: number }, outside: Outside, sk: number, busy: readonly Box[] = []): Entity[] {
  const H = G.room.H, u = hook.u, k = AT * sk, load = `Gancio, portata ${hook.load} kg`, below = `H. sotto il gancio ${Math.round(hook.eye)}`, sym: Pt = [u, hook.eye + 30];
  const taken = [...lettered(out, sk), ...dimLines(out, sk), ...busy], lines = extLines(out, sk), room: Box = { x0: area.r0 + 20 * sk, y0: 0, x1: area.r1 - 20 * sk, y1: H };
  const lead = 1.3 * TEXT.min * k, zs = Array.from({ length: Math.max(1, Math.floor((H - 150 * sk - hook.eye - 40) / lead) + 1) }, (_, i) => H - 150 * sk - i * lead);
  type Spot = { at: Pt; align: Align; lines: readonly string[]; box: Box; leader: boolean };
  const spot = (at: Pt, align: Align, ls: readonly string[], leader: boolean): Spot => {
    const bs = ls.map((t, i) => letteringBox([at[0], at[1] - i * lead], t, TEXT.min, align, 0, false, k));
    return { at, align, lines: ls, leader, box: { x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)), x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)) } };
  };
  const one = [`${load} · ${below}`], two = [load, below], gap = 10 * sk, all = [...taken, ...lines];
  const sides = (ls: readonly string[]): Spot[] => zs.flatMap((z) => ([1, -1] as const).map((away) => spot([u + away * 90 * sk, z], away > 0 ? 'l' : 'r', ls, false)));
  const grid = (b: Box, ls: readonly string[]): Tries<Spot> => ({ places: () => gridNear(b, sym).map((p) => spot(p, 'c', ls, true)), within: b });
  const off = [outside.right, outside.below].filter((b): b is Box => b !== null);
  const pick = firstClear(sides(one), all, room, gap) ?? firstClear(sides(one), taken, room, gap) ?? firstClear(sides(two), all, room, gap) ?? firstClear(sides(two), taken, room, gap)
    ?? placeOf([grid(room, one), grid(room, two), ...off.flatMap((b) => [grid(b, one), grid(b, two)])], all, gap);
  return [
    rect(u - 60, H - 12, u + 60, H, 'outline', 'steel'), line([u, H - 12], [u, hook.eye + 40], 'outline'),
    { e: 'mark', at: sym, sym: 'hook', size: 3 },
    ...pick.lines.map((t, i): Entity => ({ e: 'text', at: [pick.at[0], pick.at[1] - i * lead], text: t, size: TEXT.min, align: pick.align, halo: true })),
    ...(pick.leader ? [line(leaderFrom(pick.box, sym), sym, 'dim')] : []),
  ];
}

/** The free height over the machine's highest unguarded rotating part to the ceiling (m_above, ≥ KV_VERT.rotatingAbove),
 *  its dimension line off the hook's shank (`hookU`). */
export function aboveSection(G: RoomGeo, M: MachineSpec, hookU: number | null, sk: number): Entity[] {
  const t = rotatingTopAt(G, M), at = hookU !== null && Math.abs(hookU - t.u) < 150 * sk ? t.u + (t.u >= hookU ? 1 : -1) * 150 * sk : t.u;
  return [chain({ dir: 'y', pts: [t.z, G.room.H], at, from: [t.u, null], text: [`{v} (≥ ${KV_VERT.rotatingAbove})`] })];
}

/** A note in words for section B-B and what it names: its leader ends at `to` or at the nearest of `also`. */
export interface Note {
  text: string;
  to: Pt;
  also?: readonly Pt[];
}

/** The notes (the mounts and fixings of the support, room-mounts.ts; the HEB beams' bearings, heb-view.ts) each with a
 *  leader to what it names, placed the longest first: wrapped as wide as a free place lets it (70 mm of paper, down to
 *  24), at the size it is drawn at (TEXT.min), in the room over its floor or under the slab beside the shaft, clear of
 *  the lettering, the dimension lines and their extension lines of `out`, of `busy` (the machine, the shaft, the hatched
 *  walls) and of the notes placed before it, nearest what it names; none such at any width, across extension lines only
 *  (its halo stops them); none, outside the drawing (`outsideSection`: under its foot, then right of the room) — never
 *  on a lettering, a dimension or a hatched wall while that is clear (round 37 review). */
export function notesSection(G: RoomGeo, notes: readonly Note[], out: readonly Entity[], busy: readonly Box[], area: { r0: number; r1: number; low: number; foot: number }, outside: Outside, sk: number): Entity[] {
  const R = G.room, size = TEXT.min, k = AT * sk, f = { size, cond: true }, step = 1.3 * size * k;
  const letters = lettered(out, sk), values = valueSpots(out, AT * sk), drawn = [...letters, ...dimLines(out, sk), ...busy], lines = extLines(out, sk);
  // (under the slab beside the shaft down to the drawing's foot, the rows of dimensions there kept clear by dimLines)
  const room: Box = { x0: area.r0 + 60 * sk, y0: 120 * sk, x1: area.r1 - 60 * sk, y1: R.H - 80 * sk };
  const slab: Box = { x0: area.r0 - WALL, y0: area.foot + 40 * sk, x1: area.r1 + WALL, y1: -R.slab - area.low };
  type Place = { x: number; z: number; box: Box; lines: string[] };
  type Leader = { from: Pt; to: Pt };
  // the notes placed in the order given: each where it is drawn, how many went outside the drawing, how long the leaders
  const run = (order: readonly Note[]): { res: Map<Note, Entity[]>; out: number; length: number } => {
  const res = new Map<Note, Entity[]>(), taken = [...drawn], placed: { box: Box; from: Pt; to: Pt }[] = [];
  let outs = 0, length = 0;
  for (const note of order) {
    const { text } = note, ends = [note.to, ...(note.also ?? [])];
    const off = (b: Box, p: Pt): number => Math.hypot(Math.max(b.x0 - p[0], 0, p[0] - b.x1), Math.max(b.y0 - p[1], 0, p[1] - b.y1));
    const gap = (b: Box): number => Math.min(...ends.map((p) => off(b, p)));
    // its leader: from the lettering's corner nearest what it names, slanted (not along the lines drawn there), else from
    // another point of its edges — crossing no lettering and no note placed before, none of their leaders crossing it
    // (round 37 review); null: none
    const leaderOf = (b: Box): Leader | null => {
      if (placed.some((n) => segMeets(n.from, n.to, b))) return null;
      const to = ends.reduce((p, q) => (off(b, q) < off(b, p) ? q : p)), down = to[1] < b.y0, cx = to[0] < (b.x0 + b.x1) / 2 ? b.x0 : b.x1, cy = down ? b.y0 : b.y1;
      const slant: Pt = Math.abs(cx - to[0]) < 150 * sk ? [cx + (cx === b.x0 ? 1 : -1) * Math.min(300 * sk, (b.x1 - b.x0) / 2), cy + (down ? -10 : 10) * sk] : [cx, cy + (down ? -10 : 10) * sk];
      // (what it ends in is no obstacle: a value's place round the element it names)
      const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2, own: Box = { x0: b.x0 + 2 * sk, y0: b.y0 + 2 * sk, x1: b.x1 - 2 * sk, y1: b.y1 - 2 * sk };
      const others = [...letters, ...values, ...placed.map((n) => n.box)].map((q) => ({ x0: q.x0 - 0.8 * k, y0: q.y0 - 0.8 * k, x1: q.x1 + 0.8 * k, y1: q.y1 + 0.8 * k }))
        .filter((q) => to[0] < q.x0 || to[0] > q.x1 || to[1] < q.y0 || to[1] > q.y1);
      const starts: Pt[] = [slant, leaderFrom(b, to), [b.x0, b.y1], [b.x1, b.y1], [mx, b.y1], [b.x0, b.y0], [b.x1, b.y0], [mx, b.y0], [b.x0, my], [b.x1, my]];
      const from = starts.find((p) => !segMeets(p, to, own) && others.every((q) => !segMeets(p, to, q)));
      return from ? { from, to } : null;
    };
    // the places in the boxes `bs` at each width, the widest first
    const widths = (bs: readonly Box[]): Place[][] => [70, 60, 50, 42, 36, 32, 28, 24].map((width): Place[] => {
      const ls = wrap(text, width, f), w = Math.max(...ls.map((l) => textWidth(l, f))) * k, h = (ls.length - 1) * step + 1.3 * size * k;
      // (a line's box: 0,3 of the size under its baseline to the size over it — metrics.ts textBox)
      const places: Place[] = [];
      for (const b of bs) {
        for (let z = b.y1 - size * k; z - (ls.length - 1) * step - 0.3 * size * k >= b.y0; z -= 50 * sk) {
          for (let x = b.x0; x + w <= b.x1; x += 50 * sk) places.push({ x, z, lines: ls, box: { x0: x, y0: z + size * k - h, x1: x + w, y1: z + size * k } });
        }
      }
      return places;
    });
    const nearest = (byWidth: readonly Place[][], busyNow: readonly Box[]): Place | null => {
      for (const places of byWidth) {
        const p = places.filter((q) => firstClear([q], busyNow, ANYWHERE, 25 * sk) && leaderOf(q.box) !== null).sort((a, b) => gap(a.box) - gap(b.box))[0];
        if (p) return p;
      }
      return null;
    };
    const inner = widths([room, slab]), under = outside.below ? widths([outside.below]) : [], beside = outside.right ? widths([outside.right]) : [];
    const rest = [...under, ...beside, ...inner].flat(), within = nearest(inner, [...taken, ...lines]) ?? nearest(inner, taken);
    const at = within ?? nearest(under, [...taken, ...lines]) ?? nearest(beside, [...taken, ...lines]) ?? (rest.length ? leastOn(rest, taken) : null);
    if (!at) continue;
    const b = at.box, lead = leaderOf(b) ?? { from: leaderFrom(b, note.to), to: note.to };
    res.set(note, [...at.lines.map((l, i): Entity => ({ e: 'text', at: [at.x, at.z - i * step], text: l, size, align: 'l', halo: true })), line(lead.from, lead.to, 'dim'), { e: 'mark', at: lead.to, sym: 'dot', size: 0.8 }]);
    taken.push(b);
    placed.push({ box: b, ...lead });
    outs += within ? 0 : 1;
    length += Math.hypot(lead.to[0] - lead.from[0], lead.to[1] - lead.from[1]);
  }
  return { res, out: outs, length };
  };
  // the longest first (it needs the largest free place), and two the other way round as well: the one with fewer notes
  // outside the drawing, then with the shorter leaders (round 37 review: a note far from what it names)
  const longest = [...notes].sort((a, b) => b.text.length - a.text.length), runs = [longest, ...(notes.length === 2 ? [[...longest].reverse()] : [])].map(run);
  const best = runs.reduce((a, b) => (b.out < a.out || (b.out === a.out && b.length < a.length - 1e-6) ? b : a));
  // (drawn in the order given)
  return notes.flatMap((n) => best.res.get(n) ?? []);
}

const ANYWHERE: Box = { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity };

/** The dimension lines (with their lettering beside them) of the chains across the drawing among `es`. */
function dimLines(es: readonly Entity[], sk: number): Box[] {
  return es.flatMap((e): Box[] => {
    if (e.e !== 'chain' || e.c.at === undefined || e.c.on) return [];
    const { dir, pts, at } = e.c, lo = Math.min(...pts), hi = Math.max(...pts);
    return [dir === 'y' ? { x0: at - 110 * sk, y0: lo, x1: at + 30 * sk, y1: hi } : { x0: lo, y0: at - 30 * sk, x1: hi, y1: at + 110 * sk }];
  });
}

/** Where the values of the chains across the drawing among `es` stand as a rule (dims.ts: in the middle of each
 *  segment, past its ends when longer than it; over a level line, left of an upright one), at TEXT.dim on a scale of
 *  `k`: what a note's leader keeps off. */
function valueSpots(es: readonly Entity[], k: number): Box[] {
  return es.flatMap((e): Box[] => {
    if (e.e !== 'chain' || e.c.at === undefined || e.c.on) return [];
    const { dir, pts, at, text } = e.c, h = (TEXT.dim + 0.8) * k;
    return pts.slice(1).map((q, i) => {
      // (longer than its segment: past either end, as far as it is long)
      const p = pts[i], lo = Math.min(p, q), hi = Math.max(p, q), w = (textWidth((text?.[i] ?? '{v}').replace('{v}', String(Math.round(hi - lo))), { size: TEXT.dim, cond: true }) + 1) * k;
      const [a, b] = w > hi - lo ? [lo - w, hi + w] : [(lo + hi - w) / 2, (lo + hi + w) / 2];
      return dir === 'x' ? { x0: a, y0: at, x1: b, y1: at + h } : { x0: at - h, y0: a, x1: at, y1: b };
    });
  });
}

/** Their extension lines, from the element each point measures (dims.ts: where `from` gives it), as thin boxes. */
function extLines(es: readonly Entity[], sk: number): Box[] {
  return es.flatMap((e): Box[] => {
    if (e.e !== 'chain' || e.c.at === undefined || e.c.on) return [];
    const { dir, pts, at, from } = e.c, t = 10 * sk;
    return pts.flatMap((p, i): Box[] => {
      const f = Array.isArray(from) ? from[i] : from;
      if (typeof f !== 'number') return [];
      return [dir === 'y' ? { x0: Math.min(f, at), y0: p - t, x1: Math.max(f, at), y1: p + t } : { x0: p - t, y0: Math.min(f, at), x1: p + t, y1: Math.max(f, at) }];
    });
  });
}

/** What the lettering, the references and the symbols among `es` take at the section's scale (`sk` times 1:25). */
const lettered = (es: readonly Entity[], sk: number): Box[] => takenBy(es, AT * sk);
