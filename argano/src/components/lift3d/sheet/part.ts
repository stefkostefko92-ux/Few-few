// A sheet-metal part from faces and 90° bends, described the way a catalogue dimensions it: every face outline is drawn
// in its own mould-line coordinates (outer dimensions), each bend names the segment of the parent's outline it hangs
// from. The builder trims the faces back to the tangent lines, cuts reliefs where a bend stops short of an edge, folds
// the children into place and emits one closed solid. Millimetres. Ported from Panev's 3D catalogue
// (panev/3d/src/geo/part.js).
import { MeshBuilder, type V3 } from './mesh';
import { ccw, cw, type Loop, type V2 } from './path';
import { trimBend, type Flags } from './outline';
import { buildFace, type Frame } from './face';
import { buildBend, childFrame, type BendGeo } from './bend';

export const ROOT_FRAME: Frame = { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };

const dir3 = (f: Frame, x: number, y: number): V3 => [x * f.u[0] + y * f.v[0], x * f.u[1] + y * f.v[1], x * f.u[2] + y * f.v[2]];
const at3 = (f: Frame, x: number, y: number): V3 => {
  const d = dir3(f, x, y);
  return [f.o[0] + d[0], f.o[1] + d[1], f.o[2] + d[2]];
};

/** +1 when a → b runs with the loop's own (counter-clockwise) direction along its edge, −1 against it. */
function loopDirection(loop: Loop, a: V2, b: V2): 1 | -1 {
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i], q = loop[(i + 1) % loop.length], ex = q[0] - p[0], ey = q[1] - p[1], L = Math.hypot(ex, ey);
    const onLine = (z: V2): boolean => Math.abs(ex * (z[1] - p[1]) - ey * (z[0] - p[0])) / L < 1e-4;
    const t = (z: V2): number => (ex * (z[0] - p[0]) + ey * (z[1] - p[1])) / L;
    if (onLine(a) && onLine(b) && Math.min(t(a), t(b)) > -1e-4 && Math.max(t(a), t(b)) < L + 1e-4) return t(b) > t(a) ? 1 : -1;
  }
  throw new Error(`bend segment [${a.join(', ')}] → [${b.join(', ')}] is not on a straight edge of the parent outline`);
}

interface FaceState {
  loop: Loop;
  flags: Flags;
  holes: Loop[];
  frame: Frame;
  toLocal: (p: V2) => V2;
}

export interface Sheet {
  readonly t: number;
  face(name: string, f: { outline: Loop; holes?: Loop[] }): Sheet;
  /** `child` hangs from the parent's outline segment from → to (its x = 0 at `from`), folded 'up' (towards the
   *  parent's +s side) or 'down'. */
  bend(parent: string, child: string, b: { from: V2; to: V2; dir: 'up' | 'down' }): Sheet;
  build(root?: Frame): MeshBuilder;
}

/** t: thickness, r: inner bend radius (t), segs: segments per 90°, relief: the notch where a bend stops short. */
export function sheet({ t, r = t, segs = 8, relief = { w: 1.5, d: 1.5 } }: { t: number; r?: number; segs?: number; relief?: { w: number; d: number } }): Sheet {
  const faces = new Map<string, { outline: Loop; holes: Loop[] }>();
  const bends: { id: number; parent: string; child: string; from: V2; to: V2; up: boolean }[] = [];
  const api: Sheet = {
    t,
    face(name, { outline, holes = [] }) {
      faces.set(name, { outline: ccw(outline), holes: holes.map((h) => cw(h)) });
      return api;
    },
    bend(parent, child, { from, to, dir }) {
      bends.push({ id: bends.length, parent, child, from, to, up: dir === 'up' });
      return api;
    },
    build(root = ROOT_FRAME) {
      const sb = r + t, children = new Set(bends.map((b) => b.child));
      const roots = [...faces.keys()].filter((name) => !children.has(name));
      if (roots.length !== 1) throw new Error(`expected one root face, found ${roots.length}`);
      const first = faces.get(roots[0]);
      if (!first) throw new Error('no root face');
      const state = new Map<string, FaceState>([[roots[0], { loop: first.outline, flags: first.outline.map(() => null), holes: first.holes, frame: root, toLocal: (p) => p }]]);
      const strips: { geo: BendGeo; up: boolean; len: number }[] = [], order = [roots[0]];
      for (let q = 0; q < order.length; q++) {
        const P = state.get(order[q]);
        if (!P) continue;
        for (const bd of bends.filter((b) => b.parent === order[q])) {
          // from and to are drawn in the parent's own (designer) coordinates, like its outline
          const from = P.toLocal(bd.from), to = P.toLocal(bd.to), sign = loopDirection(P.loop, from, to);
          const [a, b] = sign > 0 ? [from, to] : [to, from];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]), e2: V2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], n2: V2 = [e2[1], -e2[0]];
          const trimmed = trimBend(P.loop, P.flags, a, b, sb, bd.id, relief);
          P.loop = trimmed.loop;
          P.flags = trimmed.flags;
          const Fp: V2 = [a[0] - n2[0] * sb, a[1] - n2[1] * sb];
          const geo: BendGeo = { T0: at3(P.frame, Fp[0], Fp[1]), e3: dir3(P.frame, e2[0], e2[1]), n3: dir3(P.frame, n2[0], n2[1]), N3: P.frame.n };
          strips.push({ geo, up: bd.up, len });
          // the child's outline: its designer x runs from `from`; flipped when that is against the parent's loop
          const C = faces.get(bd.child);
          if (!C) throw new Error(`no face ${bd.child}`);
          const toLocal = ([x, y]: V2): V2 => [sign > 0 ? x : len - x, y];
          const cLoop = ccw(C.outline.map(toLocal)), cut = trimBend(cLoop, cLoop.map(() => null), [0, 0], [len, 0], sb, bd.id, relief);
          state.set(bd.child, { loop: cut.loop, flags: cut.flags, holes: C.holes.map((h) => cw(h.map(toLocal))), frame: childFrame(geo, t, r, bd.up), toLocal });
          order.push(bd.child);
        }
      }
      const mb = new MeshBuilder();
      for (const name of order) {
        const S = state.get(name);
        if (S) buildFace(mb, S, t);
      }
      for (const s of strips) buildBend(mb, s.geo, t, r, s.up, s.len, segs);
      return mb;
    },
  };
  return api;
}
