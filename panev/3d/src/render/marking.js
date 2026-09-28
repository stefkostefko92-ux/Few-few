// Raised marks forged into the fasteners, extruded `relief` mm with a soft bevel:
//  · classMarking — the property class on a bolt head, "8.8" (ISO 898-1): each 8 is the outline of
//    two stacked elliptic rings (the union, computed exactly) with their two counters as holes, the
//    dot a small disc. Built in the XZ plane on y = 0, standing up +Y, centred;
//  · stamp — the size and type on the rail clip ("M10", "N1") in a plain die-sunk sans, each glyph
//    one outline so no two solids overlap. Built in the XY plane reading along +x, up +y, centred,
//    standing up +z.
import * as THREE from 'three/webgpu';

const ellipse = (cx, cy, a, b, from, to, n) => {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = from + ((to - from) * i) / n;
    out.push(new THREE.Vector2(cx + a * Math.cos(t), cy + b * Math.sin(t)));
  }
  return out;
};

// Parameter on the upper ellipse (right half, below its centre) where it meets the lower one.
function meet(top, bot) {
  const inside = (t) => {
    const x = top.a * Math.cos(t);
    const y = top.c + top.b * Math.sin(t);
    return (x / bot.a) ** 2 + ((y - bot.c) / bot.b) ** 2 - 1;
  };
  let lo = -Math.PI / 2;
  let hi = 0;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (inside(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function eight(x0, h, stroke) {
  const top = { c: h / 2 - 0.26 * h, a: 0.29 * h, b: 0.26 * h };
  const bot = { c: -h / 2 + 0.3 * h, a: 0.33 * h, b: 0.3 * h };
  const t = meet(top, bot);
  const xr = top.a * Math.cos(t);
  const yr = top.c + top.b * Math.sin(t);
  const f = Math.atan2((yr - bot.c) / bot.b, xr / bot.a);
  const outline = [...ellipse(x0, top.c, top.a, top.b, t, Math.PI - t, 48), ...ellipse(x0, bot.c, bot.a, bot.b, Math.PI - f, 2 * Math.PI + f, 56).slice(1, -1)];
  const shape = new THREE.Shape(outline);
  for (const e of [top, bot]) shape.holes.push(new THREE.Path(ellipse(x0, e.c, e.a - stroke, e.b - stroke, 0, Math.PI * 2, 48).slice(0, -1)));
  return { shape, width: 2 * bot.a };
}

export function classMarking({ height = 2.8, stroke = 0.42, relief = 0.2 } = {}) {
  const gap = 0.36;
  const dot = 0.3;
  const w = 2 * 0.33 * height;
  const total = 2 * w + 2 * gap + 2 * dot;
  const x1 = -total / 2 + w / 2;
  const x2 = total / 2 - w / 2;
  const shapes = [eight(x1, height, stroke).shape, eight(x2, height, stroke).shape];
  const d = new THREE.Shape();
  d.absarc(0, -height / 2 + dot, dot, 0, Math.PI * 2, false);
  shapes.push(d);
  const bevel = 0.06;
  const g = new THREE.ExtrudeGeometry(shapes, { depth: relief - bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: 0.04, bevelSegments: 2, curveSegments: 16 });
  // The lower bevel sinks into the head (y < 0), the top stands at `relief`.
  g.rotateX(-Math.PI / 2);
  g.clearGroups();
  return g;
}

// Glyphs 4.2 mm tall on a baseline at v = 0: `w` advance, one outline or an elliptic ring
// [cx, cy, a, b, stroke].
const GLYPHS = {
  M: { w: 3.6, loop: [[0, 0], [0.7, 0], [0.7, 2.9], [1.55, 1.1], [2.05, 1.1], [2.9, 2.9], [2.9, 0], [3.6, 0], [3.6, 4.2], [2.95, 4.2], [1.8, 1.85], [0.65, 4.2], [0, 4.2]] },
  N: { w: 3, loop: [[0, 0], [0.7, 0], [0.7, 2.95], [2.3, 0], [3, 0], [3, 4.2], [2.3, 4.2], [2.3, 1.25], [0.7, 4.2], [0, 4.2]] },
  1: { w: 1.25, loop: [[0.55, 0], [1.25, 0], [1.25, 4.2], [0.8, 4.2], [0.05, 3.45], [0.45, 3.05], [0.55, 3.15]] },
  0: { w: 2.8, ring: [1.4, 2.1, 1.4, 2.1, 0.7] },
};

// `mirror`: reversed along x, for a part shown mirrored (it reads right once the view flips it).
export function stamp(text, { height = 4.2, relief = 0.35, gap = 0.55, mirror = false } = {}) {
  const k = height / 4.2;
  const chars = [...text];
  let x = -chars.reduce((s, c, i) => s + GLYPHS[c].w + (i ? gap : 0), 0) / 2;
  const shapes = [];
  for (const c of chars) {
    const g = GLYPHS[c];
    const loop = (pts) => {
      const v = pts.map(([u, w]) => new THREE.Vector2((mirror ? -1 : 1) * (x + u) * k, (w - 2.1) * k));
      return mirror ? v.reverse() : v;
    };
    if (g.ring) {
      const [cx, cy, a, b, s] = g.ring;
      const oval = (ra, rb) => loop(Array.from({ length: 48 }, (_, i) => [cx + ra * Math.cos((i * Math.PI) / 24), cy + rb * Math.sin((i * Math.PI) / 24)]));
      const shape = new THREE.Shape(oval(a, b));
      shape.holes.push(new THREE.Path(oval(a - s, b - s)));
      shapes.push(shape);
    } else shapes.push(new THREE.Shape(loop(g.loop)));
    x += g.w + gap;
  }
  const bevel = 0.1;
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: relief - bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: 0.06, bevelSegments: 2, curveSegments: 8 });
  // The lower bevel sinks into the face it stands on (z < 0), the top stands at `relief`.
  geo.clearGroups();
  return geo;
}
