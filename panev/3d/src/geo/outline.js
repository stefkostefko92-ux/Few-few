// Outline operations for flat faces: trimming a bend edge back to its tangent line (with relief
// notches where the bend covers only part of an edge) and insetting loops for the edge bevels.
// Loops are counter-clockwise with the material on the left; `flags[i]` tags edge i → i+1
// (null = free cut edge, otherwise the id of the bend attached there).

const EPS = 1e-6;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => mul(a, 1 / (len(a) || 1));
const near = (a, b, eps = 1e-4) => len(sub(a, b)) < eps;

// Moves every edge of `loop` towards the material by its own offset (miter joins). Edges with a
// zero offset stay put, so a bevelled free edge meets an unbevelled bend edge exactly at the
// point `offset` along the bend edge.
export function insetLoop(loop, offsets) {
  const n = loop.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = loop[(i - 1 + n) % n];
    const c = loop[i];
    const q = loop[(i + 1) % n];
    const dp = unit(sub(c, p));
    const dn = unit(sub(q, c));
    const op = offsets[(i - 1 + n) % n];
    const on = offsets[i];
    const mp = [-dp[1], dp[0]];
    const mn = [-dn[1], dn[0]];
    const den = cross(dp, dn);
    if (Math.abs(den) < 1e-9) {
      out[i] = add(c, mul(mn, Math.max(op, on)));
      continue;
    }
    // c + op*mp + λ dp = c + on*mn + μ dn  →  λ dp − μ dn = on*mn − op*mp
    const r = sub(mul(mn, on), mul(mp, op));
    const lambda = cross(r, dn) / den;
    out[i] = add(add(c, mul(mp, op)), mul(dp, lambda));
  }
  return out;
}

// Finds the edge carrying the straight segment from → to (listed in the loop's own direction).
function findEdge(loop, from, to) {
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const e = unit(sub(b, a));
    const L = len(sub(b, a));
    const onLine = (p) => Math.abs(cross(e, sub(p, a))) < 1e-4;
    const at = (p) => dot(e, sub(p, a));
    if (onLine(from) && onLine(to) && at(from) > -1e-4 && at(to) < L + 1e-4 && at(to) - at(from) > 1e-3) return i;
  }
  throw new Error(`bend segment [${from}] → [${to}] is not on a straight edge of the outline (check its direction)`);
}

// Trims the segment from → to of the outline back by the setback `sb` (the bend's straight part
// ends at the tangent line) and tags it with `id`. Where the edge continues past an end of the
// segment, a relief notch `relief.w` wide and `relief.d` deeper than the tangent line is cut, as
// a press brake shop would. Where the outline turns there, the neighbouring edge must run
// straight away from the bend for longer than the setback.
export function trimBend(loop, flags, from, to, sb, id, relief = { w: 2, d: 3 }) {
  const i = findEdge(loop, from, to);
  const n = loop.length;
  const A = loop[i];
  const B = loop[(i + 1) % n];
  const e = unit(sub(B, A));
  const out = sub([0, 0], [-e[1], e[0]]); // outward normal (right of e)
  const inward = (p, k) => sub(p, mul(out, k));
  const seq = [];
  const seqFlags = [];
  const push = (p, flag) => {
    seq.push(p);
    seqFlags.push(flag);
  };
  const Fp = inward(from, sb);
  const Tp = inward(to, sb);

  if (near(from, A)) {
    const prev = unit(sub(A, loop[(i - 1 + n) % n]));
    if (dot(prev, out) < 1 - 1e-6) throw new Error(`edge before bend ${id} must run straight into it`);
    if (len(sub(A, loop[(i - 1 + n) % n])) <= sb + EPS) throw new Error(`edge before bend ${id} is shorter than the setback`);
    push(Fp, id);
  } else {
    push(A, null);
    const r0 = sub(from, mul(e, relief.w));
    push(r0, null);
    push(inward(r0, sb + relief.d), null);
    push(inward(from, sb + relief.d), null);
    push(Fp, id);
  }
  if (near(to, B)) {
    const next = unit(sub(loop[(i + 2) % n], B));
    if (dot(next, out) > -1 + 1e-6) throw new Error(`edge after bend ${id} must run straight away from it`);
    if (len(sub(loop[(i + 2) % n], B)) <= sb + EPS) throw new Error(`edge after bend ${id} is shorter than the setback`);
    push(Tp, flags[(i + 1) % n]);
  } else {
    push(Tp, null);
    push(inward(to, sb + relief.d), null);
    const r1 = add(to, mul(e, relief.w));
    push(inward(r1, sb + relief.d), null);
    push(r1, flags[i]);
  }
  // The rest of the loop runs from after B (or from B, when the bend stops short of it) round to
  // the vertex before A; A itself is either kept at the head of `seq` or replaced by F'.
  const rest = [];
  const restFlags = [];
  const startJ = near(to, B) ? i + 2 : i + 1;
  const endJ = i - 1 + n;
  for (let j = startJ; j <= endJ; j++) {
    rest.push(loop[j % n]);
    restFlags.push(flags[j % n]);
  }
  return { loop: [...seq, ...rest], flags: [...seqFlags, ...restFlags] };
}
