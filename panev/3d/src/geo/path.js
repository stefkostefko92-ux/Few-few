// 2D outlines of the flat faces of a sheet-metal part, in millimetres. A loop is an array of
// [x, y] points without a closing duplicate. Outer loops run counter-clockwise and holes clockwise,
// so the material always lies on the left of every edge.

export const ARC_STEP = Math.PI / 36; // 5° per segment on holes and rounded slot ends

export function signedArea(loop) {
  let a = 0;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) a += loop[j][0] * loop[i][1] - loop[i][0] * loop[j][1];
  return a / 2;
}

export const ccw = (loop) => (signedArea(loop) < 0 ? loop.slice().reverse() : loop);
export const cw = (loop) => (signedArea(loop) > 0 ? loop.slice().reverse() : loop);

// Points on a circular arc from angle a0 to a1 (radians, either direction), both ends included.
export function arc(cx, cy, r, a0, a1, step = ARC_STEP) {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

// Stadium slot centred at (cx, cy): `len` is the overall length tip to tip, `w` the width and
// `angle` the direction of the long axis (0 = along +x). Returned clockwise, as a hole.
export function slot(cx, cy, len, w, angle = 0) {
  const r = w / 2;
  const h = len / 2 - r;
  if (h < 1e-6) return circle(cx, cy, w);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const local = [...arc(h, 0, r, -Math.PI / 2, Math.PI / 2), ...arc(-h, 0, r, Math.PI / 2, (3 * Math.PI) / 2)];
  return cw(local.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]));
}

// Slot given by the two extreme points of its outline along one axis (as read off a drawing).
export function slotX(x0, x1, y, w) {
  return slot((x0 + x1) / 2, y, x1 - x0, w, 0);
}
export function slotY(x, y0, y1, w) {
  return slot(x, (y0 + y1) / 2, y1 - y0, w, Math.PI / 2);
}

export function circle(cx, cy, d) {
  const pts = arc(cx, cy, d / 2, 0, 2 * Math.PI);
  pts.pop();
  return cw(pts);
}

// Outline builder. `to` adds a straight edge, `arcTo` a rounded one; `close` returns the loop
// counter-clockwise without duplicate points.
export class Path {
  constructor(x, y) {
    this.pts = [[x, y]];
  }

  to(x, y) {
    this.pts.push([x, y]);
    return this;
  }

  // Arc around (cx, cy) from the current point's angle to angle a1 (radians).
  arcAround(cx, cy, a1) {
    const [px, py] = this.pts[this.pts.length - 1];
    const r = Math.hypot(px - cx, py - cy);
    const a0 = Math.atan2(py - cy, px - cx);
    this.pts.push(...arc(cx, cy, r, a0, a1).slice(1));
    return this;
  }

  close() {
    const out = [];
    for (const p of this.pts) {
      const q = out[out.length - 1];
      if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-7) out.push(p);
    }
    const f = out[0];
    const l = out[out.length - 1];
    if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-7) out.pop();
    return ccw(out);
  }
}

export function rect(x0, y0, x1, y1) {
  return ccw([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
}

export function pointInLoop([x, y], loop) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i];
    const [xj, yj] = loop[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Shortest distance from point p to the segment ab.
export function segDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy || 1e-12;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

// Smallest distance between the boundaries of two loops (vertex-to-edge, both ways).
export function loopGap(a, b) {
  let d = Infinity;
  for (const p of a) for (let i = 0; i < b.length; i++) d = Math.min(d, segDist(p, b[i], b[(i + 1) % b.length]));
  for (const p of b) for (let i = 0; i < a.length; i++) d = Math.min(d, segDist(p, a[i], a[(i + 1) % a.length]));
  return d;
}
