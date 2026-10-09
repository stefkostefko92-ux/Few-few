// What section B-B of the machine room shows besides the machine and its support (room-section-view.ts): the room's
// door and control panel where the view sees them (beyond the cut; on a wall the cut runs into, its opening dashed in
// the wall), so their heights stand on their side; the upstands round the slab's openings (registry locale.fori); a 2:1
// roping's hitches with P2 and P3 (locale.attacchi); the lifting hook with the free height under it (locale.gancio); the
// free height over the machine's rotating parts (m_above); the notes in words (the mounts and fixings of the support, the
// HEB beams' bearings), each where it keeps off what is drawn. Lettering measured as the kernel draws it (TEXT.min at
// least: room-label.ts). Model entities: u along the drop line, z over the room's floor [mm]; pure.
import { TEXT, chain, line, rect, textWidth, wrap, type Box, type Entity, type Pt } from '../drawing';
import type { MachineSpec, RoomGeo } from './machine-room';
import { KV_VERT } from './norme-vert';
import { rotatingTopAt } from './room-above';
import { WALL, holesOf } from './room-draw';
import { panelBox, wallBox } from './room-floor';
import type { Hook } from './room-hook';
import { AT, firstClear, leastOn, letteringBox, takenBy } from './room-label';
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

/** The lifting hook under the ceiling with its name and rated load, the name beside the shank — on the side clear of
 *  the lettering and the dimension lines of `out`, under the ceiling or lower down the shank, inside the room's walls
 *  `r0`, `r1` —, else where it lies least on them. */
export function hookSection(G: RoomGeo, hook: Hook, out: readonly Entity[], r0: number, r1: number, sk: number): Entity[] {
  const H = G.room.H, u = hook.u, text = `Gancio, portata ${hook.load} kg · H. sotto il gancio ${Math.round(hook.eye)}`, k = AT * sk;
  const taken = [...lettered(out, sk), ...dimLines(out, sk)], lines = extLines(out, sk), room: Box = { x0: r0 + 20 * sk, y0: 0, x1: r1 - 20 * sk, y1: H };
  const lead = 1.3 * TEXT.min * k, zs = Array.from({ length: Math.max(1, Math.floor((H - 150 * sk - hook.eye - 40) / lead) + 1) }, (_, i) => H - 150 * sk - i * lead);
  const sides = zs.flatMap((z) => ([1, -1] as const).map((away) => {
    const at: Pt = [u + away * 90 * sk, z], align = away > 0 ? 'l' as const : 'r' as const;
    return { at, align, box: letteringBox(at, text, TEXT.min, align, 0, false, k) };
  }));
  const pick = firstClear(sides, [...taken, ...lines], room, 10 * sk) ?? firstClear(sides, taken, room, 10 * sk) ?? leastOn(sides, taken, room);
  return [
    rect(u - 60, H - 12, u + 60, H, 'outline', 'steel'), line([u, H - 12], [u, hook.eye + 40], 'outline'),
    { e: 'mark', at: [u, hook.eye + 30], sym: 'hook', size: 3 },
    { e: 'text', at: pick.at, text, size: TEXT.min, align: pick.align, halo: true },
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
 *  (its halo stops them); else, at the narrowest, where it lies least on them. */
export function notesSection(G: RoomGeo, notes: readonly Note[], out: readonly Entity[], busy: readonly Box[], area: { r0: number; r1: number; low: number; foot: number }, sk: number): Entity[] {
  const R = G.room, size = TEXT.min, k = AT * sk, f = { size, cond: true }, step = 1.3 * size * k, res = new Map<Note, Entity[]>();
  const taken = [...lettered(out, sk), ...dimLines(out, sk), ...busy], lines = extLines(out, sk);
  // (under the slab beside the shaft down to the drawing's foot, the rows of dimensions there kept clear by dimLines)
  const room: Box = { x0: area.r0 + 60 * sk, y0: 120 * sk, x1: area.r1 - 60 * sk, y1: R.H - 80 * sk };
  const slab: Box = { x0: area.r0 - WALL, y0: area.foot + 40 * sk, x1: area.r1 + WALL, y1: -R.slab - area.low };
  // (the longest first: it needs the largest free place)
  for (const note of [...notes].sort((a, b) => b.text.length - a.text.length)) {
    const { text } = note, ends = [note.to, ...(note.also ?? [])];
    const off = (b: Box, p: Pt): number => Math.hypot(Math.max(b.x0 - p[0], 0, p[0] - b.x1), Math.max(b.y0 - p[1], 0, p[1] - b.y1));
    const gap = (b: Box): number => Math.min(...ends.map((p) => off(b, p)));
    type Place = { x: number; z: number; box: Box; lines: string[] };
    const anywhere: Box = { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity }, byWidth = [70, 60, 50, 42, 36, 32, 28, 24].map((width): Place[] => {
      const ls = wrap(text, width, f), w = Math.max(...ls.map((l) => textWidth(l, f))) * k, h = (ls.length - 1) * step + 1.3 * size * k;
      // (a line's box: 0,3 of the size under its baseline to the size over it — metrics.ts textBox)
      const places: Place[] = [];
      for (const b of [room, slab]) {
        for (let z = b.y1 - size * k; z - (ls.length - 1) * step - 0.3 * size * k >= b.y0; z -= 50 * sk) {
          for (let x = b.x0; x + w <= b.x1; x += 50 * sk) places.push({ x, z, lines: ls, box: { x0: x, y0: z + size * k - h, x1: x + w, y1: z + size * k } });
        }
      }
      return places;
    });
    const nearest = (busyNow: readonly Box[]): Place | null => {
      for (const places of byWidth) {
        const p = places.filter((q) => firstClear([q], busyNow, anywhere, 25 * sk)).sort((a, b) => gap(a.box) - gap(b.box))[0];
        if (p) return p;
      }
      return null;
    };
    const last = byWidth[byWidth.length - 1] ?? [];
    const at = nearest([...taken, ...lines]) ?? nearest(taken) ?? (last.length ? leastOn(last, taken, anywhere) : null);
    if (!at) continue;
    // the leader from the lettering's corner nearest what it names, slanted (not along the lines drawn there)
    const b = at.box, to = ends.reduce((p, q) => (off(b, q) < off(b, p) ? q : p)), below = to[1] < b.y0, cx = to[0] < (b.x0 + b.x1) / 2 ? b.x0 : b.x1, cy = below ? b.y0 : b.y1;
    const end: Pt = Math.abs(cx - to[0]) < 150 * sk ? [cx + (cx === b.x0 ? 1 : -1) * Math.min(300 * sk, (b.x1 - b.x0) / 2), cy + (below ? -10 : 10) * sk] : [cx, cy + (below ? -10 : 10) * sk];
    res.set(note, [...at.lines.map((l, i): Entity => ({ e: 'text', at: [at.x, at.z - i * step], text: l, size, align: 'l', halo: true })), line(end, to, 'dim'), { e: 'mark', at: to, sym: 'dot', size: 0.8 }]);
    taken.push(b);
  }
  // (drawn in the order given)
  return notes.flatMap((n) => res.get(n) ?? []);
}

/** The dimension lines (with their lettering beside them) of the chains across the drawing among `es`. */
function dimLines(es: readonly Entity[], sk: number): Box[] {
  return es.flatMap((e): Box[] => {
    if (e.e !== 'chain' || e.c.at === undefined || e.c.on) return [];
    const { dir, pts, at } = e.c, lo = Math.min(...pts), hi = Math.max(...pts);
    return [dir === 'y' ? { x0: at - 110 * sk, y0: lo, x1: at + 30 * sk, y1: hi } : { x0: lo, y0: at - 30 * sk, x1: hi, y1: at + 110 * sk }];
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
