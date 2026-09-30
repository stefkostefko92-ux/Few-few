// Cut model entities to a horizontal band (a window of heights of a section): polygons by Sutherland–Hodgman against
// the two edges, segments by their end parameters; lettering, symbols and circles outside the band are dropped,
// dimension chains are kept whole.
import type { Entity } from './model';
import type { Pt } from './types';

function clipPoly(pts: readonly Pt[], closed: boolean, y0: number, y1: number): Pt[][] {
  if (!closed) {
    // polyline: clip each segment and join the runs that stay connected
    const runs: Pt[][] = [];
    let run: Pt[] = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const seg = clipSeg(pts[i], pts[i + 1], y0, y1);
      if (!seg) { if (run.length) runs.push(run); run = []; continue; }
      if (!run.length) run.push(seg[0]);
      else if (run[run.length - 1][0] !== seg[0][0] || run[run.length - 1][1] !== seg[0][1]) { runs.push(run); run = [seg[0]]; }
      run.push(seg[1]);
    }
    if (run.length) runs.push(run);
    return runs.filter((r) => r.length > 1);
  }
  const edge = (poly: Pt[], inside: (p: Pt) => boolean, cut: (a: Pt, b: Pt) => Pt): Pt[] => {
    const out: Pt[] = [];
    poly.forEach((b, i) => {
      const a = poly[(i + poly.length - 1) % poly.length];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b));
    });
    return out;
  };
  const at = (y: number) => (a: Pt, b: Pt): Pt => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y];
  let poly = [...pts];
  poly = edge(poly, (p) => p[1] >= y0, at(y0));
  if (poly.length) poly = edge(poly, (p) => p[1] <= y1, at(y1));
  return poly.length >= 3 ? [poly] : [];
}

function clipSeg(a: Pt, b: Pt, y0: number, y1: number): [Pt, Pt] | null {
  let t0 = 0, t1 = 1;
  const dy = b[1] - a[1];
  for (const [p, q] of [[-dy, a[1] - y0], [dy, y1 - a[1]]] as const) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  const P = (t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + dy * t];
  return [P(t0), P(t1)];
}

export function clipBand(entities: readonly Entity[], y0: number, y1: number): Entity[] {
  const out: Entity[] = [];
  for (const e of entities) {
    switch (e.e) {
      case 'line': {
        const s = clipSeg(e.a, e.b, y0, y1);
        if (s) out.push({ ...e, a: s[0], b: s[1] });
        break;
      }
      case 'path':
        for (const pts of clipPoly(e.pts, e.closed, y0, y1)) out.push({ ...e, pts });
        break;
      case 'circle':
        if (e.c[1] - e.r >= y0 && e.c[1] + e.r <= y1) out.push(e);
        break;
      case 'arc':
        if (e.c[1] >= y0 && e.c[1] <= y1) out.push(e);
        break;
      case 'text':
      case 'mark':
      case 'tag':
        if (e.at[1] >= y0 && e.at[1] <= y1) out.push(e);
        break;
      case 'chain':
        out.push(e);
        break;
    }
  }
  return out;
}
