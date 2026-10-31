// The paths of points in the sketch editor (the pen of schizzo-strumenti.js, the polyline of
// schizzo-polilinea.js): a stroke simplified to the points that keep its shape, and the points written as
// the paths the server takes.
(() => {
  'use strict';

  const ed = window.rilieviSchizzoEditor;
  if (!ed) return;
  const { view } = ed;

  // Ramer–Douglas–Peucker: the points that keep the shape of the stroke within `eps` sheet units.
  const simplify = (pts, eps) => {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const dx = pts[b].x - pts[a].x;
      const dy = pts[b].y - pts[a].y;
      const length = Math.hypot(dx, dy);
      let farthest = 0;
      let index = -1;
      for (let i = a + 1; i < b; i += 1) {
        const px = pts[i].x - pts[a].x;
        const py = pts[i].y - pts[a].y;
        const d = length ? Math.abs(dx * py - dy * px) / length : Math.hypot(px, py);
        if (d > farthest) {
          farthest = d;
          index = i;
        }
      }
      if (farthest > eps) {
        keep[index] = 1;
        stack.push([a, index], [index, b]);
      }
    }
    return pts.filter((_, i) => keep[i]);
  };

  // The paths of points: "M x y" and relative "l dx dy", at most `maxSegmenti` segments each (the
  // server's limit) — each next one starts where the last one ended. A dot is "l0 0".
  const pathsOf = (pts, closed = false) => {
    const paths = [];
    for (let from = 0; from === 0 || from < pts.length - 1; from += view.maxSegmenti) {
      const part = pts.slice(from, from + view.maxSegmenti + 1);
      let d = `M${part[0].x} ${part[0].y}`;
      if (part.length === 1) d += 'l0 0';
      for (let i = 1; i < part.length; i += 1) {
        d += `l${part[i].x - part[i - 1].x} ${part[i].y - part[i - 1].y}`;
      }
      paths.push(d);
    }
    if (closed && paths.length === 1) paths[0] += 'z';
    return paths;
  };

  ed.simplify = simplify;
  ed.pathsOf = pathsOf;
})();
