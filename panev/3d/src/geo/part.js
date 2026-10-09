// Sheet-metal part from faces and 90° bends, described the way the catalogue dimensions them:
// every face outline is drawn in its own mould-line coordinates (outer dimensions), and each bend
// names the segment of the parent's outline it hangs from. The builder trims faces back to the
// tangent lines, adds bend reliefs where a bend stops short of an edge, folds the children into
// place and emits one watertight bevelled solid.
import { MeshBuilder } from './mesh.js';
import { ccw, cw } from './path.js';
import { trimBend } from './outline.js';
import { buildFace } from './face.js';
import { buildBend, bendAllowance, childFrame } from './bend.js';

const ROOT_FRAME = { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };
const BACK = [37.1, 91.7];

const dir3 = (f, x, y) => [x * f.u[0] + y * f.v[0], x * f.u[1] + y * f.v[1], x * f.u[2] + y * f.v[2]];
const at3 = (f, x, y, s) => {
  const d = dir3(f, x, y);
  return [f.o[0] + d[0] + s * f.n[0], f.o[1] + d[1] + s * f.n[1], f.o[2] + d[2] + s * f.n[2]];
};
const loopDirection = (loop, a, b) => {
  // +1 when a → b runs with the loop's own (counter-clockwise) direction along its edge.
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % loop.length];
    const ex = q[0] - p[0];
    const ey = q[1] - p[1];
    const L = Math.hypot(ex, ey);
    const onLine = (z) => Math.abs(ex * (z[1] - p[1]) - ey * (z[0] - p[0])) / L < 1e-4;
    const t = (z) => (ex * (z[0] - p[0]) + ey * (z[1] - p[1])) / L;
    if (onLine(a) && onLine(b) && Math.min(t(a), t(b)) > -1e-4 && Math.max(t(a), t(b)) < L + 1e-4) return t(b) > t(a) ? 1 : -1;
  }
  throw new Error(`bend segment [${a}] → [${b}] is not on a straight edge of the parent outline`);
};

// opts: t thickness, r inner bend radius (default t), K neutral-fibre factor, bevel edge
// bevel, segs segments per 90°, relief { w, d } relief notch size.
export function sheet({ t, r = t, K = 0.42, bevel = 0.5, segs = 24, relief = { w: 1.5, d: 1.5 } }) {
  const faces = new Map();
  const bends = [];
  const api = {
    t,
    face(name, { outline, holes = [] }) {
      faces.set(name, { name, outline: ccw(outline), holes: holes.map(cw) });
      return api;
    },
    // Child `child` hangs from the parent's outline segment from → to (child x = 0 at `from`),
    // folded 'up' (towards the parent's +s side) or 'down'.
    bend(parent, child, { from, to, dir }) {
      bends.push({ id: bends.length, parent, child, from, to, up: dir === 'up' });
      return api;
    },
    build(rootFrame = ROOT_FRAME) {
      const sb = r + t;
      const BA = bendAllowance(r, t, K);
      const children = new Set(bends.map((b) => b.child));
      const roots = [...faces.keys()].filter((n) => !children.has(n));
      if (roots.length !== 1) throw new Error(`expected one root face, found ${roots.length}`);
      // Working state per face: loop + flags in local coordinates, frame and flat-pattern map.
      const state = new Map();
      const root = faces.get(roots[0]);
      state.set(root.name, { loop: root.outline, flags: root.outline.map(() => null), holes: root.holes, frame: rootFrame, flat: (x, y) => [x, y], toLocal: (p) => p });
      const strips = [];
      const order = [root.name];
      for (let q = 0; q < order.length; q++) {
        const P = state.get(order[q]);
        for (const bd of bends.filter((b) => b.parent === order[q])) {
          // from/to are drawn in the parent's own (designer) coordinates, like its outline.
          const from = P.toLocal(bd.from);
          const to = P.toLocal(bd.to);
          const sign = loopDirection(P.loop, from, to);
          const [a, b] = sign > 0 ? [from, to] : [to, from];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const e2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
          const n2 = [e2[1], -e2[0]];
          const trimmed = trimBend(P.loop, P.flags, a, b, sb, bd.id, relief);
          P.loop = trimmed.loop;
          P.flags = trimmed.flags;
          const Fp = [a[0] - n2[0] * sb, a[1] - n2[1] * sb];
          const geo = { T0: at3(P.frame, Fp[0], Fp[1], 0), e3: dir3(P.frame, e2[0], e2[1]), n3: dir3(P.frame, n2[0], n2[1]), N3: P.frame.n };
          const pFlat = P.flat;
          const flatAt = (u, d) => pFlat(Fp[0] + u * e2[0] + d * n2[0], Fp[1] + u * e2[1] + d * n2[1]);
          strips.push({ geo, up: bd.up, len, flatAt });
          // Child outline: designer x runs from `from`; flip when that is against the parent loop.
          const C = faces.get(bd.child);
          const toLocal = ([x, y]) => [sign > 0 ? x : len - x, y];
          let cLoop = ccw(C.outline.map(toLocal));
          const cHoles = C.holes.map((h) => cw(h.map(toLocal)));
          const cut = trimBend(cLoop, cLoop.map(() => null), [0, 0], [len, 0], sb, bd.id, relief);
          cLoop = cut.loop;
          state.set(C.name, {
            loop: cLoop,
            flags: cut.flags,
            holes: cHoles,
            frame: childFrame(geo, { t, r, up: bd.up }),
            flat: (x, y) => flatAt(x, BA + y - sb),
            toLocal,
          });
          order.push(C.name);
        }
      }
      const mb = new MeshBuilder();
      mb.faces = order.map((name) => {
        const S = state.get(name);
        buildFace(mb, S, { t, bevel });
        return { name, loop: S.loop, flags: S.flags, holes: S.holes, frame: S.frame };
      });
      for (const s of strips) buildBend(mb, s.geo, { t, r, up: s.up, len: s.len, bevel, segs, K, flatAt: s.flatAt, back: BACK });
      return mb;
    },
  };
  return api;
}
