// A view: model entities placed on the sheet at a scale. Geometry becomes paper primitives with the styles of the
// drawings; lettering, symbols and dimension chains keep their paper size. The largest standard scale that fits a
// drawing with its dimension rows into an area is chosen here too.
import { chainShapes, rowOffset } from './dims';
import { boundsOf, boxH, boxW, grow, toPaper, union, type Place } from './geom';
import { textBox, textWidth } from './metrics';
import type { Edit, Entity, Side } from './model';
import { obliqueShapes } from './oblique';
import { FILLS, STYLES, TEXT, letterSize } from './style';
import { symbol } from './symbols';
import type { Box, Pt, Shape, TextShape } from './types';

/** ISO 5455 reductions, with the 1:25 of lift layouts. */
export const SCALES = [5, 10, 20, 25, 50, 100, 200, 500] as const;

/** A dimension the screens let the user change: the box of its lettering on paper, what it changes, its value [mm]. */
export interface Hit {
  box: Box;
  edit: Edit;
  value: number;
}

export interface ViewResult {
  shapes: Shape[];
  /** the geometry on paper, without annotations */
  edges: Box;
  /** everything on paper */
  extent: Box;
  /** the editable dimensions (the sheets ignore them) */
  hits: Hit[];
  /** the shapes of each entity, in their order (a CAD file puts each on the layer of its entity) */
  parts: Shape[][];
}

function geometry(e: Entity, place: Place): Shape | null {
  const P = (p: Pt): Pt => toPaper(place, p);
  switch (e.e) {
    case 'line': return { t: 'line', a: P(e.a), b: P(e.b), s: STYLES[e.st] };
    case 'path': return { t: 'path', pts: e.pts.map(P), closed: e.closed, s: e.st ? STYLES[e.st] : undefined, fill: e.fill ? FILLS[e.fill] : undefined };
    case 'circle': return { t: 'circle', c: P(e.c), r: e.r / place.scale, s: e.st ? STYLES[e.st] : undefined, fill: e.fill ? FILLS[e.fill] : undefined };
    case 'arc': return { t: 'arc', c: P(e.c), r: e.r / place.scale, a0: e.a0, a1: e.a1, s: STYLES[e.st] };
    default: return null;
  }
}

/** Paper box of a shape (texts by their measured width; arcs by their circle). */
export function shapeBox(s: Shape): Box {
  switch (s.t) {
    case 'line': return boundsOf([s.a, s.b]);
    case 'path': return boundsOf(s.pts);
    case 'circle':
    case 'arc': return { x0: s.c[0] - s.r, y0: s.c[1] - s.r, x1: s.c[0] + s.r, y1: s.c[1] + s.r };
    case 'image': return s.box;
    case 'text': return textBox(s);
  }
}

export function renderView(entities: readonly Entity[], place: Place): ViewResult {
  const geo: Shape[] = [], notes: Shape[] = [], hits: Hit[] = [], own: Shape[][] = entities.map(() => []);
  let edges: Box | null = null;
  for (const [i, e] of entities.entries()) {
    const g = geometry(e, place);
    if (!g) continue;
    geo.push(g);
    own[i] = [g];
    // axes run on past the drawing: the dimension rows start from the object, not from them
    if (!(e.e === 'line' && e.st === 'axis')) edges = union(edges, shapeBox(g));
  }
  const E = edges ?? { x0: place.ox, y0: place.oy, x1: place.ox, y1: place.oy };
  // lettering, symbols and references first (their leaders aside): the figures of the dimensions step round them and
  // round each other, in the order of the chains
  const parts: Shape[][] = entities.map(() => []), taken: Box[] = [];
  entities.forEach((e, i) => {
    if (e.e === 'text') parts[i] = lettering(e, place);
    else if (e.e === 'mark') parts[i] = symbol(e.sym, toPaper(place, e.at), e.size);
    else if (e.e === 'tag') parts[i] = tag(toPaper(place, e.at), e.text, [...(e.to ? [e.to] : []), ...(e.also ?? [])].map((p) => toPaper(place, p)));
    for (const s of parts[i]) if (s.t !== 'line') taken.push(shapeBox(s));
  });
  const room = rowsRoom(entities);
  entities.forEach((e, i) => {
    if (e.e !== 'chain') return;
    const edit = e.c.edit;
    const onText = edit ? (s: TextShape, k: number, value: number): void => {
      const ed = edit[k];
      if (ed) hits.push({ box: grow(shapeBox(s), 0.5), edit: ed, value: ed.value ?? value });
    } : undefined;
    const { on } = e.c;
    parts[i] = on ? obliqueShapes({ ...e.c, on }, place, onText, taken) : chainShapes(e.c, place, E, onText, taken, room);
  });
  // the lettering over every line of the annotations, so that a line crossing it stops at its band of paper
  for (const s of parts.flat()) if (s.t !== 'text') notes.push(s);
  for (const s of parts.flat()) if (s.t === 'text') notes.push(s);
  const shapes = [...geo, ...notes];
  let extent: Box | null = null;
  for (const s of shapes) extent = union(extent, shapeBox(s));
  return { shapes, edges: E, extent: extent ?? E, hits, parts: parts.map((p, i) => (p.length ? p : own[i])) };
}

/** A lettering on paper: at its size (never under TEXT.min); one with `fit` smaller when longer than its room, down to
 *  TEXT.min, and past it — when it has an `out` — there, with a leader to the element it names (ending in a dot). */
function lettering(e: Extract<Entity, { e: 'text' }>, place: Place): Shape[] {
  const asked = letterSize(e.size), w = e.fit ? textWidth(e.text, { size: asked, bold: e.bold, cond: true }) : 0, room = e.fit ? e.fit / place.scale : 0;
  const size = w > room && room > 0 ? Math.max(TEXT.min, (asked * room) / w) : asked, over = room > 0 && (w * size) / asked > room + 1e-9;
  const text = (at: Pt): TextShape => ({ t: 'text', at, text: e.text, size, angle: e.angle, align: e.align, bold: e.bold, ink: e.ink, cond: true, halo: e.halo });
  if (!over || !e.out) return [text(toPaper(place, e.at))];
  const s = text(toPaper(place, e.out)), b = textBox(s), to = toPaper(place, e.at);
  // the leader from the side of the lettering nearest the element
  const from: Pt = [Math.min(Math.max(to[0], b.x0), b.x1), Math.min(Math.max(to[1], b.y0), b.y1)];
  return [{ t: 'line', a: from, b: to, s: STYLES.dim }, { t: 'circle', c: to, r: 0.35, fill: { k: 'solid', ink: 'ink' } }, s];
}

/** The smallest circle of a reference on paper [mm]. */
export const TAG_MIN_R = 2.4;

/** A reference's circle on paper [mm]: round its letters (as large as the smallest lettering), never under TAG_MIN_R —
 *  what the modules that place references keep clear takes it from here. */
export const tagRadius = (text: string): number => Math.max(TAG_MIN_R, textWidth(text, { size: TEXT.min, cond: true }) / 2 + 0.7);

/** A reference in a circle with its leaders, sized on paper: its letters as large as the smallest lettering. */
function tag([x, y]: Pt, text: string, to: readonly Pt[]): Shape[] {
  const size = TEXT.min, r = tagRadius(text), out: Shape[] = [];
  for (const t of to) {
    const d = Math.hypot(t[0] - x, t[1] - y);
    if (d > r) out.push({ t: 'line', a: [x + ((t[0] - x) * r) / d, y + ((t[1] - y) * r) / d], b: t, s: STYLES.dim });
  }
  out.push({ t: 'circle', c: [x, y], r, s: STYLES.thin, fill: { k: 'solid', ink: 'paper' } });
  out.push({ t: 'text', at: [x, y - size * 0.36], text, size, align: 'c', cond: true });
  return out;
}

/** Paper room the dimension rows take on each side. */
export function rowsRoom(entities: readonly Entity[]): Record<Side, number> {
  const rows: Record<Side, number> = { top: -1, bottom: -1, left: -1, right: -1 };
  for (const e of entities) if (e.e === 'chain' && e.c.side) rows[e.c.side] = Math.max(rows[e.c.side], e.c.row ?? 0);
  const room = (r: number): number => (r < 0 ? 0 : rowOffset(r) + TEXT.dim + 1.2);
  return { top: room(rows.top), bottom: room(rows.bottom), left: room(rows.left), right: room(rows.right) };
}

/**
 * The largest standard scale at which the drawing (model bounds) and its dimension rows fit in `area`, and the
 * placement that centres it there. Null when even the smallest scale does not fit.
 */
export function fitView(model: Box, entities: readonly Entity[], area: Box, scales: readonly number[] = SCALES): Place | null {
  const r = rowsRoom(entities), w = boxW(area) - r.left - r.right, h = boxH(area) - r.top - r.bottom;
  const scale = scales.find((s) => boxW(model) / s <= w && boxH(model) / s <= h);
  if (scale === undefined) return null;
  // centre the drawing with its rows in the area
  const cx = area.x0 + r.left + w / 2, cy = area.y0 + r.bottom + h / 2;
  return { scale, ox: cx - (model.x0 + model.x1) / 2 / scale, oy: cy - (model.y0 + model.y1) / 2 / scale };
}

/** Editable dimensions moved on paper by (dx, dy). */
export const moveHits = (hits: readonly Hit[], dx: number, dy: number): Hit[] =>
  hits.map((h) => ({ ...h, box: { x0: h.box.x0 + dx, y0: h.box.y0 + dy, x1: h.box.x1 + dx, y1: h.box.y1 + dy } }));

/** Shapes moved on paper by (dx, dy). */
export function moveShapes(shapes: readonly Shape[], dx: number, dy: number): Shape[] {
  const m = ([x, y]: Pt): Pt => [x + dx, y + dy];
  return shapes.map((s): Shape => {
    switch (s.t) {
      case 'line': return { ...s, a: m(s.a), b: m(s.b) };
      case 'path': return { ...s, pts: s.pts.map(m) };
      case 'circle':
      case 'arc': return { ...s, c: m(s.c) };
      case 'text': return { ...s, at: m(s.at) };
      case 'image': return { ...s, box: { x0: s.box.x0 + dx, y0: s.box.y0 + dy, x1: s.box.x1 + dx, y1: s.box.y1 + dy } };
    }
  });
}
