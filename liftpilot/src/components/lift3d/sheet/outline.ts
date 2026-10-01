// Trimming a bend edge of a flat face back to its tangent line, with a relief notch where the bend covers only part of
// the edge. Loops are counter-clockwise with the material on the left; `flags[i]` tags edge i → i+1 (null: a free cut
// edge, otherwise the id of the bend attached there). Ported from Panev's 3D catalogue (panev/3d/src/geo/outline.js).
// Loaded only through boot.ts (lazy).
// Motion: none, static geometry; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import type { Loop, V2 } from './path';

export type Flags = (number | null)[];

const EPS = 1e-6;
const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: V2, b: V2): V2 => [a[0] + b[0], a[1] + b[1]];
const mul = (a: V2, k: number): V2 => [a[0] * k, a[1] * k];
const dot = (a: V2, b: V2): number => a[0] * b[0] + a[1] * b[1];
const cross = (a: V2, b: V2): number => a[0] * b[1] - a[1] * b[0];
const len = (a: V2): number => Math.hypot(a[0], a[1]);
const unit = (a: V2): V2 => mul(a, 1 / (len(a) || 1));
const near = (a: V2, b: V2, eps = 1e-4): boolean => len(sub(a, b)) < eps;

/** The edge carrying the straight segment from → to (listed in the loop's own direction). */
function findEdge(loop: Loop, from: V2, to: V2): number {
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length], e = unit(sub(b, a)), L = len(sub(b, a));
    const onLine = (p: V2): boolean => Math.abs(cross(e, sub(p, a))) < 1e-4;
    const at = (p: V2): number => dot(e, sub(p, a));
    if (onLine(from) && onLine(to) && at(from) > -1e-4 && at(to) < L + 1e-4 && at(to) - at(from) > 1e-3) return i;
  }
  throw new Error(`bend segment [${from.join(', ')}] → [${to.join(', ')}] is not on a straight edge of the outline`);
}

/** Trims the segment from → to of the outline back by the setback `sb` (the bend's straight part ends at the tangent
 *  line) and tags it with `id`. Where the edge goes on past an end of the segment, a relief notch `relief.w` wide and
 *  `relief.d` deeper than the tangent line is cut, as a press-brake shop would. */
export function trimBend(loop: Loop, flags: Flags, from: V2, to: V2, sb: number, id: number, relief: { w: number; d: number }): { loop: Loop; flags: Flags } {
  const i = findEdge(loop, from, to), n = loop.length, A = loop[i], B = loop[(i + 1) % n];
  const e = unit(sub(B, A)), out: V2 = [e[1], -e[0]]; // outward normal (right of e)
  const inward = (p: V2, k: number): V2 => sub(p, mul(out, k));
  const seq: Loop = [], seqFlags: Flags = [];
  const push = (p: V2, flag: number | null): void => {
    seq.push(p);
    seqFlags.push(flag);
  };
  const Fp = inward(from, sb), Tp = inward(to, sb);
  if (near(from, A)) {
    const prev = loop[(i - 1 + n) % n];
    if (dot(unit(sub(A, prev)), out) < 1 - 1e-6) throw new Error(`edge before bend ${id} must run straight into it`);
    if (len(sub(A, prev)) <= sb + EPS) throw new Error(`edge before bend ${id} is shorter than the setback`);
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
    const next = loop[(i + 2) % n];
    if (dot(unit(sub(next, B)), out) > -1 + 1e-6) throw new Error(`edge after bend ${id} must run straight away from it`);
    if (len(sub(next, B)) <= sb + EPS) throw new Error(`edge after bend ${id} is shorter than the setback`);
    push(Tp, flags[(i + 1) % n]);
  } else {
    push(Tp, null);
    push(inward(to, sb + relief.d), null);
    const r1 = add(to, mul(e, relief.w));
    push(inward(r1, sb + relief.d), null);
    push(r1, flags[i]);
  }
  // the rest of the loop: from after B (or from B, when the bend stops short of it) round to the vertex before A
  const rest: Loop = [], restFlags: Flags = [];
  for (let j = near(to, B) ? i + 2 : i + 1; j <= i - 1 + n; j++) {
    rest.push(loop[j % n]);
    restFlags.push(flags[j % n]);
  }
  return { loop: [...seq, ...rest], flags: [...seqFlags, ...restFlags] };
}
