// Panels and their machining features. A panel's machined face (face A) is the face its features are drilled
// from; the local frame (u along the grain/length axis, v across) is derived so that eu × ev = face normal,
// which keeps every part non-mirrored when it is laid face-up on the CNC table.
import { IDX, AX, sub, dot, neg, crossDir, r1 } from './util.js';

export const THROUGH_EXTRA = 1.5; // through-drill depth below the sheet, mm

export function createCtx() {
  let n = 1;
  const hwLines = new Map();
  return {
    parts: [],
    warnings: [],
    groups: [], // movable groups for 3D: doors (swing) and drawers (slide)
    symbols: [], // non-board items drawn in 3D/drawings: handles, rails, mattress, slats, legs
    nextId() {
      const id = `P${String(n).padStart(2, '0')}`;
      n += 1;
      return id;
    },
    warn(level, text) {
      if (!this.warnings.some((w) => w.text === text)) this.warnings.push({ level, text });
    },
    hw(key, line) {
      const cur = hwLines.get(key);
      if (cur) cur.qty += line.qty;
      else hwLines.set(key, { key, ...line });
    },
    hardwareLines() {
      return [...hwLines.values()];
    },
  };
}

// o: key, name, role, stock, decor, grain, box{min,max}, n (face A normal, '+x'…), L ('x'|'y'|'z' length axis),
//    bands{dir: mm}, explode[3], group, module
export function panel(ctx, o) {
  const tAxis = o.n[1];
  const lAxis = o.L;
  if (lAxis === tAxis) throw new Error(`${o.name}: length axis equals thickness axis`);
  const wAxis = ['x', 'y', 'z'].find((a) => a !== tAxis && a !== lAxis);
  const eu = `+${lAxis}`;
  let ev = `+${wAxis}`;
  if (crossDir(eu, ev) !== o.n) ev = `-${wAxis}`;
  const origin = [0, 0, 0];
  origin[IDX[tAxis]] = o.n[0] === '+' ? o.box.max[IDX[tAxis]] : o.box.min[IDX[tAxis]];
  origin[IDX[lAxis]] = o.box.min[IDX[lAxis]];
  origin[IDX[wAxis]] = ev[0] === '+' ? o.box.min[IDX[wAxis]] : o.box.max[IDX[wAxis]];
  const size = sub(o.box.max, o.box.min);
  for (let i = 0; i < 3; i++) if (!(size[i] > 0)) throw new Error(`${o.name}: non-positive size ${size}`);
  const part = {
    bands: {},
    explode: [0, 0, 0],
    ...o,
    id: ctx.nextId(),
    features: [],
    edgeOps: [],
    frame: { n: o.n, eu, ev, origin },
    L: r1(size[IDX[lAxis]]),
    W: r1(size[IDX[wAxis]]),
    T: r1(size[IDX[tAxis]]),
  };
  ctx.parts.push(part);
  return part;
}

// Project a world point onto finished part coordinates (u, v) of face A.
export function toUV(part, p) {
  const d = sub(p, part.frame.origin);
  return [r1(dot(d, AX[part.frame.eu])), r1(dot(d, AX[part.frame.ev]))];
}

export function hole(part, p, d, depth, kind, meta = {}) {
  const [u, v] = toUV(part, p);
  const f = { type: 'hole', u, v, d, depth: r1(depth), kind, world: p, ...meta };
  part.features.push(f);
  return f;
}

// A position to mark, not to drill (screws set by the hardware's own template).
export function mark(part, p, kind, meta = {}) {
  const [u, v] = toUV(part, p);
  const f = { type: 'mark', u, v, world: p, kind, ...meta };
  part.features.push(f);
  return f;
}

export function holeThrough(part, p, d, kind, meta = {}) {
  return hole(part, p, d, part.T + THROUGH_EXTRA, kind, { through: true, ...meta });
}

export function groove(part, p1, p2, w, depth, kind = 'groove') {
  const [u1, v1] = toUV(part, p1);
  const [u2, v2] = toUV(part, p2);
  const f = { type: 'groove', u1, v1, u2, v2, w, depth, kind, world: [p1, p2] };
  part.features.push(f);
  return f;
}

// Horizontal holes into an edge face (needs a boring machine; never on a 3-axis nesting router).
export function edgeHoles(part, dir, points, d, depth, kind, meta = {}) {
  if (!points.length) return null;
  const op = { edge: dir, d, depth, count: points.length, kind, at: points.map((p) => toUV(part, p)), world: points, ...meta };
  part.edgeOps.push(op);
  return op;
}

export function cutSize(part, compensate) {
  if (!compensate) return { L: part.L, W: part.W, du0: 0, dv0: 0 };
  const b = (dir) => part.bands[dir] || 0;
  return {
    L: r1(part.L - b(part.frame.eu) - b(neg(part.frame.eu))),
    W: r1(part.W - b(part.frame.ev) - b(neg(part.frame.ev))),
    du0: b(neg(part.frame.eu)),
    dv0: b(neg(part.frame.ev)),
  };
}

export function edgeSummary(part) {
  const lDirs = [part.frame.ev, neg(part.frame.ev)];
  const wDirs = [part.frame.eu, neg(part.frame.eu)];
  return {
    L: lDirs.map((d) => part.bands[d] || 0).filter((x) => x > 0),
    W: wDirs.map((d) => part.bands[d] || 0).filter((x) => x > 0),
  };
}

const DIR_BG = { '+z': 'отпред', '-z': 'отзад', '+y': 'горе', '-y': 'долу', '-x': 'ляво', '+x': 'дясно' };

// Which real-world edge sits at u = 0, u = L, v = 0 and v = W of the drawing (face A up).
export function edgeLabels(part) {
  const { eu, ev } = part.frame;
  const name = (dir) => {
    const base = DIR_BG[dir];
    return dir[1] === 'x' ? `${base} (гледано отпред)` : base;
  };
  return { u0: name(neg(eu)), u1: name(eu), v0: name(neg(ev)), v1: name(ev) };
}
