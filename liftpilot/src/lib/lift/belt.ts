// A rope over pulleys in one vertical plane: points where it is tied (or turned by a guide) and wheels it wraps
// clockwise or counter-clockwise, in order; the straight runs are the tangents between them and the rope follows each
// wheel between the two tangent points. Signed radii make one formula for every pair: the centre of a wheel lies
// on the left of the rope's direction when it wraps counter-clockwise, on the right when clockwise. Metres. Pure.

export type BeltEl =
  | { kind: 'pt'; u: number; y: number }
  | { kind: 'wheel'; u: number; y: number; r: number; cw: boolean };

export type Pt2 = readonly [number, number];

export interface Belt {
  /** straight runs, in order along the rope */
  runs: readonly (readonly [Pt2, Pt2])[];
  /** the arc on each wheel: centre, radius, start angle and signed sweep [rad] (negative: clockwise) */
  arcs: readonly { c: Pt2; r: number; a0: number; sweep: number }[];
}

const rho = (e: BeltEl): number => (e.kind === 'pt' ? 0 : e.cw ? -e.r : e.r);

/** The tangent from element a to element b: where the rope leaves a and where it reaches b. */
export function tangent(a: BeltEl, b: BeltEl): readonly [Pt2, Pt2] {
  const ra = rho(a), rb = rho(b), dx = b.u - a.u, dy = b.y - a.y, d = Math.hypot(dx, dy), del = rb - ra;
  if (d <= Math.abs(del) + 1e-9) return [[a.u, a.y], [b.u, b.y]]; // wheels inside each other: no tangent, the centres
  const L = Math.sqrt(d * d - del * del), th = Math.atan2(dy, dx) - Math.atan2(del, L);
  const nx = -Math.sin(th), ny = Math.cos(th);
  return [[a.u - ra * nx, a.y - ra * ny], [b.u - rb * nx, b.y - rb * ny]];
}

const TAU = Math.PI * 2;
const mod = (x: number): number => ((x % TAU) + TAU) % TAU;

export function belt(els: readonly BeltEl[]): Belt {
  const runs: [Pt2, Pt2][] = [];
  for (let i = 0; i + 1 < els.length; i++) runs.push([...tangent(els[i], els[i + 1])] as [Pt2, Pt2]);
  const arcs: { c: Pt2; r: number; a0: number; sweep: number }[] = [];
  els.forEach((e, i) => {
    if (e.kind !== 'wheel' || i === 0 || i === els.length - 1) return;
    const pin = runs[i - 1][1], pout = runs[i][0];
    const a0 = Math.atan2(pin[1] - e.y, pin[0] - e.u), a1 = Math.atan2(pout[1] - e.y, pout[0] - e.u);
    arcs.push({ c: [e.u, e.y], r: e.r, a0, sweep: e.cw ? -mod(a0 - a1) : mod(a1 - a0) });
  });
  return { runs, arcs };
}
