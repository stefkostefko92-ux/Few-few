// Section B-B's upright dimension chains beside the machine (room-section-view.ts: the sheave's axis, the pulley's h,
// the support's and the bedplate's heights, a profile, the HEB beams): each stands on a line across the section, its
// lettering left of it (3,6 mm on paper). Where they stand they stay when every one keeps its lettering 40 mm off the
// wall's face and off the machine; else they are set again a lettering's width apart in the free band between the machine and the wall —
// a line that fits better on the machine's other side goes there (the axes from inside the machine as they are, a
// support's or a bedplate's heights from its other end); none of that fitting, a side's lines go to rows outside the
// drawing past the rows there, their extension lines from what they measure. Model entities, mm along u.
import { chain, type Box, type Chain, type Entity } from '../drawing';

type Side = 'left' | 'right';

interface Line {
  at: number;
  home: Side;
  items: { i: number; c: Chain }[];
  /** its chains on the machine's other side (null: tied to this one) */
  cross: Chain[] | null;
}

/** `room`: the room's inner faces (along u, and its floor and ceiling); `edges`: what the machine, its support, the
 *  bedplate and the pulley take along u; `ends`: the support's and the bedplate's two ends (a height measured at one is
 *  the same at the other); `sk`: the section's scale on 1:25; `rows`: the rows outside on each side already taken. */
export function columns(out: Entity[], room: Box, edges: Readonly<Record<Side, number>>, ends: readonly (readonly [number, number])[], sk: number,
  rows: Readonly<Record<Side, number>>): void {
  const [r0, r1] = [room.x0, room.x1], text = 3.6 * 25 * sk, gap = 40 * sk, step = text + 20 * sk, mid = (edges.left + edges.right) / 2;
  const lines: Line[] = [];
  out.forEach((e, i) => {
    if (e.e !== 'chain' || e.c.dir !== 'y' || e.c.side || e.c.at === undefined) return;
    const at = e.c.at, line = lines.find((l) => Math.abs(l.at - at) < 0.5);
    if (line) line.items.push({ i, c: e.c });
    else lines.push({ at, home: at < mid ? 'left' : 'right', items: [{ i, c: e.c }], cross: null });
  });
  // from the machine out on each side
  lines.sort((a, b) => (a.home === 'left' ? -a.at : a.at) - (b.home === 'left' ? -b.at : b.at));
  for (const l of lines) l.cross = crossed(l.items.map((x) => x.c), edges, ends);
  // a side's lines where they stand or set again from the machine out, a lettering's width apart: their lettering 40
  // mm off the wall's face and off the machine; its own lines kept where they stand, those come over past them
  const fits = (s: Side, us: readonly number[]): boolean => !us.length
    || (s === 'left' ? Math.min(...us) - text >= r0 + gap && Math.max(...us) <= edges.left - 10 * sk : Math.max(...us) + gap <= r1 && Math.min(...us) - text >= edges.right + 10 * sk);
  const spaced = (s: Side, k: number): number => (s === 'left' ? edges.left - 50 * sk - k * step : edges.right + step + k * step);
  const layout = (s: Side, on: readonly Line[]): number[] | null => {
    const own = on.filter((l) => l.home === s).map((l) => l.at), n = on.length - own.length, sg = s === 'left' ? -1 : 1;
    if (fits(s, own)) {
      const edge = own.length ? (s === 'left' ? Math.min(...own) : Math.max(...own)) : null;
      for (const d of [200 * sk, step]) {
        const us = [...own, ...Array.from({ length: n }, (_, k) => (edge === null ? spaced(s, k) : edge + sg * d * (k + 1)))];
        if (fits(s, us)) return us;
      }
    }
    const us = on.map((_, k) => spaced(s, k));
    return fits(s, us) ? us : null;
  };
  const sides = ['left', 'right'] as const, on = (s: Side, moved: ReadonlySet<Line>): Line[] =>
    [...lines.filter((l) => l.home === s && !moved.has(l)), ...lines.filter((l) => l.home !== s && moved.has(l))];
  if (sides.every((s) => { const ls = on(s, new Set()); return fits(s, ls.map((l) => l.at)); })) return;
  // the lines that may go over, each over or not: the fewest moved that leave both sides fitting
  const free = lines.filter((l) => l.cross !== null);
  let best: { moved: Set<Line>; at: Map<Line, number> } | null = null;
  // (of as many, the outer lines over: the nearest stay by the machine)
  for (let mask = (1 << free.length) - 1; mask >= 0; mask--) {
    const moved = new Set(free.filter((_, b) => mask & (1 << b)));
    if (best && moved.size >= best.moved.size) continue;
    const at = new Map<Line, number>(), ok = sides.every((s) => {
      const ls = on(s, moved), us = layout(s, ls);
      ls.forEach((l, k) => { if (us) at.set(l, us[k]); });
      return us !== null;
    });
    if (ok) best = { moved, at };
  }
  // set again in the room: their lettering past an end kept in it too (not on the floor's slab under a short one)
  const put = (l: Line, chains: readonly Chain[], at: number): void => l.items.forEach(({ i }, k) => { out[i] = chain({ ...chains[k], at, within: room }); });
  if (best) {
    for (const l of lines) {
      const at = best.at.get(l) ?? l.at, over = best.moved.has(l);
      if (over || Math.abs(at - l.at) > 1e-9) put(l, over ? l.cross ?? [] : l.items.map((x) => x.c), at);
    }
    return;
  }
  // none: each side out of the room in rows past the ones there, when not in its band
  for (const s of sides) {
    const ls = on(s, new Set()), us = layout(s, ls);
    if (us) {
      ls.forEach((l, k) => { if (Math.abs(us[k] - l.at) > 1e-9) put(l, l.items.map((x) => x.c), us[k]); });
      continue;
    }
    ls.forEach((l, k) => l.items.forEach(({ i, c }) => {
      const from = Array.isArray(c.from) ? c.from.map((f) => (f === null ? undefined : f)) : c.from;
      out[i] = chain({ dir: c.dir, pts: c.pts, side: s, row: rows[s] + k, ...(from !== undefined ? { from } : {}), ...(c.axis ? { axis: c.axis } : {}),
        ...(c.text ? { text: c.text } : {}), ...(c.edit ? { edit: c.edit } : {}) });
    }));
  }
}

/** The chains of a line set on the machine's other side: their extension lines from inside the machine as they are,
 *  from an end of the support or the bedplate from its other end; null when one starts from anything else. */
function crossed(cs: readonly Chain[], edges: Readonly<Record<Side, number>>, ends: readonly (readonly [number, number])[]): Chain[] | null {
  const other = (f: number): number | null => {
    for (const [a, b] of ends) {
      if (Math.abs(f - a) < 1) return b;
      if (Math.abs(f - b) < 1) return a;
    }
    return f > edges.left + 1 && f < edges.right - 1 ? f : null;
  };
  const out: Chain[] = [];
  for (const c of cs) {
    const fs = Array.isArray(c.from) ? c.from : [c.from], to = fs.map((f) => (typeof f === 'number' ? other(f) : f));
    if (to.some((f, k) => f === null && fs[k] !== null)) return null;
    out.push({ ...c, from: Array.isArray(c.from) ? to : (to[0] ?? undefined) });
  }
  return out;
}
