// What section B-B of the machine room shows besides the machine and its support (room-section-view.ts): the room's
// door and control panel where the view sees them (beyond the cut; on a wall the cut runs into, its opening dashed in
// the wall), so their heights stand on their side; the upstands round the slab's openings (registry locale.fori); a 2:1
// roping's hitches with P2 and P3 (locale.attacchi); the lifting hook with the free height under it (locale.gancio); the
// free height over the machine's rotating parts (m_above); the mounts and fixings of the support. Model entities: u
// along the drop line, z over the room's floor [mm]; pure.
import { chain, line, rect, textWidth, wrap, type Box, type Entity, type Pt } from '../drawing';
import type { MachineSpec, RoomGeo } from './machine-room';
import { KV_VERT } from './norme-vert';
import { rotatingTopAt } from './room-above';
import { WALL, holesOf } from './room-draw';
import { panelBox, wallBox } from './room-floor';
import type { Hook } from './room-hook';
import { firstClear, takenBy } from './room-label';
import { mountsLines } from './room-mounts';
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

/** The lifting hook under the ceiling with its name and rated load, the name on the side of the shank clear of the
 *  lettering and the dimension lines of `out` (else right of it). */
export function hookSection(G: RoomGeo, hook: Hook, out: readonly Entity[], sk: number): Entity[] {
  const H = G.room.H, u = hook.u, text = `Gancio, portata ${hook.load} kg · H. sotto il gancio ${Math.round(hook.eye)}`, size = 1.6, k = 25 * sk, w = textWidth(text, { size, cond: true }) * k, z = H - 150 * sk;
  const taken = [...lettered(out, sk), ...dimLines(out, sk)];
  const sides = ([1, -1] as const).map((away) => {
    const x0 = away > 0 ? u + 90 * sk : u - 90 * sk - w;
    return { away, box: { x0, y0: z - 0.3 * size * k, x1: x0 + w, y1: z + 0.85 * size * k } };
  });
  const free = { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity }, pick = firstClear(sides, taken, free, 10 * sk) ?? sides[0];
  return [
    rect(u - 60, H - 12, u + 60, H, 'outline', 'steel'), line([u, H - 12], [u, hook.eye + 40], 'outline'),
    { e: 'mark', at: [u, hook.eye + 30], sym: 'hook', size: 3 },
    { e: 'text', at: [u + pick.away * 90 * sk, z], text, size, align: pick.away > 0 ? 'l' : 'r', halo: true },
  ];
}

/** The free height over the machine's highest unguarded rotating part to the ceiling (m_above, ≥ KV_VERT.rotatingAbove),
 *  its dimension line off the hook's shank (`hookU`). */
export function aboveSection(G: RoomGeo, M: MachineSpec, hookU: number | null, sk: number): Entity[] {
  const t = rotatingTopAt(G, M), at = hookU !== null && Math.abs(hookU - t.u) < 150 * sk ? t.u + (t.u >= hookU ? 1 : -1) * 150 * sk : t.u;
  return [chain({ dir: 'y', pts: [t.z, G.room.H], at, from: [t.u, null], text: [`{v} (≥ ${KV_VERT.rotatingAbove})`] })];
}

/** The mounts and the fixings of the support named (room-mounts.ts) with a leader to `to` (a mount): the lines as wide
 *  as the room lets them, in the room or under its slab beside the shaft, where they stand clear of the lettering and
 *  the dimension lines of `out` and of `busy`, nearest the mount. */
export function mountsSection(G: RoomGeo, M: MachineSpec, out: readonly Entity[], busy: readonly Box[], to: Pt, area: { r0: number; r1: number; low: number }, sk: number): Entity[] {
  const R = G.room, size = 1.6, k = 25 * sk, step = 2.6 * k, f = { size, cond: true }, text = mountsLines(G, M).join(' ');
  const taken = [...lettered(out, sk), ...dimLines(out, sk), ...busy];
  const room: Box = { x0: area.r0 + 60 * sk, y0: 120 * sk, x1: area.r1 - 60 * sk, y1: R.H - 80 * sk };
  const slab: Box = { x0: area.r0 - WALL, y0: -R.slab - 1300 * sk + 700 * sk, x1: area.r1 + WALL, y1: -R.slab - area.low };
  for (const width of [70, 55, 42, 32]) {
    const lines = wrap(text, width, f), w = Math.max(...lines.map((l) => textWidth(l, f))) * k, h = lines.length * step;
    const places: { x: number; z: number; box: Box }[] = [];
    for (const b of [room, slab]) {
      for (let z = b.y1 - 0.85 * size * k; z - h + step - 0.3 * size * k >= b.y0; z -= 50 * sk) {
        for (let x = b.x0; x + w <= b.x1; x += 50 * sk) places.push({ x, z, box: { x0: x, y0: z - h + step - 0.3 * size * k, x1: x + w, y1: z + 0.85 * size * k } });
      }
    }
    const gap = (b: Box): number => Math.hypot(Math.max(b.x0 - to[0], 0, to[0] - b.x1), Math.max(b.y0 - to[1], 0, to[1] - b.y1));
    const clear = places.filter((p) => firstClear([p], taken, { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity }, 25 * sk)).sort((a, b) => gap(a.box) - gap(b.box));
    const at = clear[0];
    if (!at) continue;
    // the leader from the lettering's corner nearest the mount, slanted (not along the lines drawn there)
    const b = at.box, below = to[1] < b.y0, cx = to[0] < (b.x0 + b.x1) / 2 ? b.x0 : b.x1, cy = below ? b.y0 : b.y1;
    const end: Pt = Math.abs(cx - to[0]) < 150 * sk ? [cx + (cx === b.x0 ? 1 : -1) * Math.min(300 * sk, (b.x1 - b.x0) / 2), cy + (below ? -10 : 10) * sk] : [cx, cy + (below ? -10 : 10) * sk];
    return [...lines.map((l, i): Entity => ({ e: 'text', at: [at.x, at.z - i * step], text: l, size, align: 'l', halo: true })), line(end, to, 'dim'), { e: 'mark', at: to, sym: 'dot', size: 0.8 }];
  }
  return [];
}

/** The dimension lines (with their lettering beside them) of the chains across the drawing among `es`. */
function dimLines(es: readonly Entity[], sk: number): Box[] {
  return es.flatMap((e): Box[] => {
    if (e.e !== 'chain' || e.c.at === undefined || e.c.on) return [];
    const { dir, pts, at } = e.c, lo = Math.min(...pts), hi = Math.max(...pts);
    return [dir === 'y' ? { x0: at - 110 * sk, y0: lo, x1: at + 30 * sk, y1: hi } : { x0: lo, y0: at - 30 * sk, x1: hi, y1: at + 110 * sk }];
  });
}

/** What the lettering, the references and the symbols among `es` take at the section's scale (`sk` times 1:25). */
function lettered(es: readonly Entity[], sk: number): Box[] {
  return es.flatMap((e): Box[] => {
    if (e.e !== 'text' && e.e !== 'tag' && e.e !== 'mark') return [];
    const [b] = takenBy([e]), [x, y] = e.at;
    return b ? [{ x0: x + (b.x0 - x) * sk, y0: y + (b.y0 - y) * sk, x1: x + (b.x1 - x) * sk, y1: y + (b.y1 - y) * sk }] : [];
  });
}
