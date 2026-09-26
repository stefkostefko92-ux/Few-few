// The raised property-class marking forged into a bolt head, "8.8" (ISO 898-1): each 8 is the
// outline of two stacked elliptic rings (the union, computed exactly) with their two counters as
// holes, the dot a small disc. Extruded `relief` mm with a soft bevel, as a forged mark stands.
// Built in the XZ plane on y = 0, standing up +Y, centred; digits `height` mm tall.
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
