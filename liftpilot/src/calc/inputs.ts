// Form values → installation and machines (the prototype's readInputs). A value out of range is flagged in `bad` and
// replaced by a fallback, so the calculation always runs; the interface shows the flagged fields and no result is
// official while any is flagged.
import { deflectorAngle } from './geometry';
import type { AlphaMode, Context, DropAlign, FormValues, GrooveType, Layout, Machine, ParsedInputs, Plant } from './types';

const LAYOUTS: readonly Layout[] = ['top', 'topDefl', 'bottom'];
const GROOVES: readonly GrooveType[] = ['U', 'UU', 'VH', 'VN'];
const oneOf = <T extends string>(list: readonly T[], x: unknown): x is T => typeof x === 'string' && (list as readonly string[]).includes(x);
const blank = (x: unknown): boolean => String(x ?? '').trim() === '';

export function readInputs(V: FormValues): ParsedInputs {
  const bad: string[] = [];
  // value in (lo, hi] (or [lo, hi] when open is false); otherwise flag the field and use the fallback
  const field = (id: string, fb: number, lo = 0, hi = Infinity, open = true, report = true): number => {
    const x = parseFloat(String(V[id] ?? '').replace(',', '.'));
    if (Number.isFinite(x) && (open ? x > lo : x >= lo) && x <= hi) return x;
    if (report) bad.push(id);
    return fb;
  };
  const pos = (id: string, fb: number, hi?: number): number => field(id, fb, 0, hi);
  // whole number ≥ lo
  const count = (id: string, fb: number, lo: number, report = true): number => {
    const x = field(id, fb, lo, Infinity, false, report);
    if (Number.isInteger(x)) return x;
    if (report) bad.push(id);
    return fb;
  };
  const nonneg = (id: string, fb: number): number => field(id, fb, 0, Infinity, false);
  const compare = !!V.compare;
  const manual = V.alphaMode === 'manual';
  const layout: Layout = oneOf(LAYOUTS, V.layout) ? V.layout : 'top';
  if (!oneOf(LAYOUTS, V.layout)) bad.push('layout');
  const I: Plant = {
    context: (V.context === 'repl' ? 'repl' : 'new') as Context, Q: pos('Q', 630), P: pos('P', 700), k: field('k', 0.5, 0, 1, false), qeq: blank(V.qeq) ? 0 : nonneg('qeq', 0),
    v: pos('v', 1), H: pos('H', 18), L0: field('L0', 2, 0.1, Infinity, false), r: parseInt(String(V.r ?? ''), 10) || 1, layout, alphaMode: (manual ? 'manual' : 'geo') as AlphaMode,
    alphaManual: field('alphaManual', 180, 0, 360, true, manual), dx: nonneg('dx', 0.3), h: nonneg('h', 0.6),
    Hv: nonneg('Hv', 24), Dp: pos('Dp', 400), Jp: nonneg('Jp', 0), nps: count('nps', 0, 0), npr: count('npr', 0, 0), etaShaft: pos('etaShaft', 0.85, 1),
    aDesign: pos('aDesign', 0.8), ae: V.buffers ? 0.8 : 0.5, aBrake: pos('aBrake', 0.5), rh: pos('rh', 0.2),
    dropAlign: (V.dropAlign === 'car' ? 'car' : 'center') as DropAlign, drops: 0,
  };
  const mach = (p: 'n_' | 'o_'): Machine => {
    const rep = p === 'n_' || compare;
    const f = (key: string, fb: number, lo?: number, hi?: number, open = true): number => field(p + key, fb, lo, hi, open, rep);
    const g = V[p + 'groove'];
    const type: GrooveType = oneOf(GROOVES, g) ? g : 'UU';
    if (!oneOf(GROOVES, g) && rep) bad.push(p + 'groove');
    const etaD = f('etaD', 0.7, 0, 1);
    // reverse efficiency: blank = estimate for a worm gear, η_i ≈ 2 − 1/η_d (0 = self-locking)
    const etaIest = blank(V[p + 'etaI']);
    const etaI = etaIest ? Math.max(0, 2 - 1 / etaD) : f('etaI', Math.max(0, 2 - 1 / etaD), 0, 1, false);
    return {
      D: f('D', 560, 0), i: f('i', 43, 0), etaD, etaI, etaIest, poles: parseInt(String(V[p + 'poles'] ?? ''), 10) || 4,
      groove: { type, beta: f('beta', 90, 0, 180), gamma: f('gamma', 35, 0, 180) },
      fn: f('fn', 50, 0), nm: f('nm', 1450, 0), Pn: f('Pn', 7.5, 0), Jm: f('Jm', 0.08, 0, Infinity, false), Js: f('Js', 2.5, 0, Infinity, false),
      brakeSets: count(p + 'brakeSets', 2, 1, rep), brakeNm: f('brakeNm', 60, 0), shaftMax: f('shaftMax', 0, 0, Infinity, false),
      MpCat: blank(V[p + 'MpCat']) ? 0 : f('MpCat', 0, 0, Infinity, false), mass: f('mass', 0, 0, Infinity, false),
      n: count(p + 'n', 4, 1, rep), d: f('d', 10, 0), Fmin: f('Fmin', 47.5, 0), qf: f('qf', 0.336, 0),
    };
  };
  const N = mach('n_'), O = mach('o_');
  // replacement: the new ropes keep number and diameter of the ropes in place (the usual practice); with the existing
  // machine entered they come from its rope fields. The proposal keeps them too.
  const keepRopes = I.context === 'repl' && !!V.keepRopes;
  if (keepRopes && compare) { N.n = O.n; N.d = O.d; }
  const rope = keepRopes ? { n: N.n, d: N.d, Fmin: N.Fmin, qf: N.qf } : null;
  if (I.layout === 'topDefl' && I.alphaMode !== 'manual' && [N, ...(compare ? [O] : [])].some((m) => deflectorAngle(m.D, I.Dp, I.dx, I.h) == null)) bad.push('dx', 'h');
  I.drops = compare && I.context === 'repl' && I.layout === 'top' ? O.D : 0; // existing drop spacing = existing sheave diameter
  const fixedD = compare && I.context === 'repl' && V.keepD ? O.D : 0;
  return { V, I, N, O, compare, bad, fixedD, rope };
}
