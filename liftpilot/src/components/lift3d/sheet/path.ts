// 2D outlines of the flat faces of a sheet-metal part, in millimetres: a loop is an array of [x, y] points without
// a closing duplicate. Outer loops run counter-clockwise and holes clockwise, so the material always lies on the left
// of every edge. Ported from Panev's 3D catalogue (panev/3d/src/geo/path.js); the products share no code.
// Loaded only through boot.ts (lazy).
// Motion: none, static geometry; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).

export type V2 = [number, number];
export type Loop = V2[];

export const ARC_STEP = Math.PI / 24; // 7.5° per segment on holes and slot ends: enough at the shaft's distances

export function signedArea(loop: readonly V2[]): number {
  let a = 0;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) a += loop[j][0] * loop[i][1] - loop[i][0] * loop[j][1];
  return a / 2;
}

export const ccw = (loop: readonly V2[]): Loop => (signedArea(loop) < 0 ? loop.slice().reverse() : loop.slice());
export const cw = (loop: readonly V2[]): Loop => (signedArea(loop) > 0 ? loop.slice().reverse() : loop.slice());

/** Points on a circular arc from angle a0 to a1 (radians, either direction), both ends included. */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number, step = ARC_STEP): Loop {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / step)), out: Loop = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

export function circle(cx: number, cy: number, d: number): Loop {
  const pts = arc(cx, cy, d / 2, 0, 2 * Math.PI);
  pts.pop();
  return cw(pts);
}

/** Stadium slot centred at (cx, cy): `len` tip to tip, `w` wide, its long axis at `angle` (0 = along +x); a hole. */
export function slot(cx: number, cy: number, len: number, w: number, angle = 0): Loop {
  const r = w / 2, h = len / 2 - r;
  if (h < 1e-6) return circle(cx, cy, w);
  const c = Math.cos(angle), s = Math.sin(angle);
  const local = [...arc(h, 0, r, -Math.PI / 2, Math.PI / 2), ...arc(-h, 0, r, Math.PI / 2, (3 * Math.PI) / 2)];
  return cw(local.map(([x, y]): V2 => [cx + x * c - y * s, cy + x * s + y * c]));
}

/** Slots given by the two extreme points of their outline along one axis, as read off a drawing. */
export const slotX = (x0: number, x1: number, y: number, w: number): Loop => slot((x0 + x1) / 2, y, x1 - x0, w, 0);
export const slotY = (x: number, y0: number, y1: number, w: number): Loop => slot(x, (y0 + y1) / 2, y1 - y0, w, Math.PI / 2);

export function rect(x0: number, y0: number, x1: number, y1: number): Loop {
  return ccw([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
}

/** Outline builder: `to` adds a straight edge, `arcAround` a rounded one; `close` returns the loop counter-clockwise. */
export class Path {
  private readonly pts: Loop;

  constructor(x: number, y: number) {
    this.pts = [[x, y]];
  }

  to(x: number, y: number): this {
    this.pts.push([x, y]);
    return this;
  }

  /** Arc around (cx, cy) from the current point's angle to angle a1 (radians). */
  arcAround(cx: number, cy: number, a1: number): this {
    const [px, py] = this.pts[this.pts.length - 1];
    this.pts.push(...arc(cx, cy, Math.hypot(px - cx, py - cy), Math.atan2(py - cy, px - cx), a1).slice(1));
    return this;
  }

  close(): Loop {
    const out: Loop = [];
    for (const p of this.pts) {
      const q = out[out.length - 1];
      if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-7) out.push(p);
    }
    const f = out[0], l = out[out.length - 1];
    if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-7) out.pop();
    return ccw(out);
  }
}
