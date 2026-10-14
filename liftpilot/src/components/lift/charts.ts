// Which charts a run shows, and what is on them: one quantity per chart (never two scales on one plot), the
// run's time on x, a limit or a reference line where the verification has one (from the moment its condition holds),
// with the side that fails. Pure.
import type { EventId, SimRun } from '@/sim';

export interface Line {
  key: string;
  label: string;
  values: ArrayLike<number>;
  tone: 1 | 2;
}

export interface Limit {
  values: ArrayLike<number> | number;
  label: string;
  /** which side of the line fails the check; none: a reference */
  bad: 'above' | 'below' | 'none';
}

export interface ChartSpec {
  key: string;
  title: string;
  unit: string;
  dec: number;
  lines: Line[];
  limit?: Limit;
  /** keep 0 inside the y range */
  zero?: boolean;
}

export type ChartText = (key: string) => string;

const map = (a: ArrayLike<number>, f: (x: number, i: number) => number): Float64Array => Float64Array.from({ length: a.length }, (_, i) => f(a[i], i));

/** Rim speed of the sheave as car speed (it differs from the car's when the ropes slip) [m/s]. */
function sheaveSpeed(run: SimRun, R: number, r: number): Float64Array {
  const th = run.series.data.theta, dt = run.series.dt, n = th.length;
  return Float64Array.from({ length: n }, (_, i) => {
    const a = th[Math.max(0, i - 1)], b = th[Math.min(n - 1, i + 1)], span = (Math.min(n - 1, i + 1) - Math.max(0, i - 1)) * dt;
    return span > 0 ? Math.abs(((b - a) / span) * R / r) : 0;
  });
}

/** Speed of the counterweight (upwards positive) from its positions [m/s]: on the buffers it differs from the car's when
 *  the ropes go slack. */
function cwSpeed(run: SimRun): Float64Array {
  const c = run.series.data.cw, dt = run.series.dt, n = c.length;
  return Float64Array.from({ length: n }, (_, i) => {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    return b > a ? (c[b] - c[a]) / ((b - a) * dt) : 0;
  });
}

export function chartsFor(run: SimRun, t: ChartText, R: number, r: number, Mn: number, Q: number): ChartSpec[] {
  const d = run.series.data, sc = run.scenario.id;
  const speed: ChartSpec = { key: 'v', title: t('ch_v'), unit: 'm/s', dec: 2, zero: true, lines: [{ key: 'v', label: t('ch_car'), values: d.v, tone: 1 }] };
  const accel: ChartSpec = { key: 'a', title: t('ch_a'), unit: 'm/s²', dec: 2, zero: true, lines: [{ key: 'a', label: t('ch_car'), values: d.a, tone: 1 }] };
  // the condition of a check holds from its event on (the brake closing, the counterweight on its buffer): no limit before
  const from = (id: EventId): Float64Array => {
    const on = run.events.find((e) => e.id === id)?.t ?? 0, dt = run.series.dt;
    return map(d.efa, (x, i) => (i * dt >= on - 1e-9 ? x : Number.NaN));
  };
  const traction = (bad: 'above' | 'below', limit: ArrayLike<number> = d.efa): ChartSpec => ({
    key: 'ratio', title: t('ch_ratio'), unit: '', dec: 3, lines: [{ key: 'ratio', label: 'T1/T2', values: d.ratio, tone: 1 }],
    limit: { values: limit, label: t('ch_limit'), bad },
  });
  const torque: ChartSpec = {
    key: 'torque', title: t('ch_torque'), unit: 'N·m', dec: 0, zero: true, lines: [{ key: 'torque', label: t('ch_torque'), values: d.torque, tone: 1 }],
    limit: { values: Mn, label: t('ch_Mn'), bad: 'none' },
  };
  const both: ChartSpec = {
    key: 'vs', title: t('ch_vs'), unit: 'm/s', dec: 2, zero: true,
    lines: [{ key: 'car', label: t('ch_car'), values: map(d.v, Math.abs), tone: 1 }, { key: 'sheave', label: t('ch_sheave'), values: sheaveSpeed(run, R, r), tone: 2 }],
  };
  if (sc === 'ride') return [speed, accel, traction('above'), torque];
  if (sc === 'brake') return [both, traction('above', from('brakeOn')), { ...accel, title: t('ch_a') }];
  if (sc === 'loading') {
    return [{ key: 'load', title: t('ch_load'), unit: 'kg', dec: 0, zero: true, lines: [{ key: 'load', label: t('ch_load'), values: d.load, tone: 1 }], limit: { values: 1.25 * Q, label: t('ch_load125'), bad: 'none' } },
      traction('above')];
  }
  if (sc === 'stall') return [both, traction('below', from('cwBuffer')), torque];
  // buffers: the speeds of both sides (the one on the buffer, whose deceleration and compression follow, and the other,
  // which carries on), the deceleration of the mass on the buffer in g, the compression against the stroke
  const car = run.scenario.id === 'buffer' && run.scenario.p.side === 'car';
  const comp = car ? d.bufCar : d.bufCw;
  return [
    { ...speed, title: t('ch_vcw'), lines: [...speed.lines, { key: 'cw', label: t('ch_cw'), values: cwSpeed(run), tone: 2 }] },
    { key: 'g', title: t('ch_decel'), unit: 'g', dec: 2, zero: true, lines: [{ key: 'g', label: t('ch_decel'), values: map(d.a, (x) => x / 9.81), tone: 1 }] },
    { key: 'x', title: t('ch_comp'), unit: 'mm', dec: 0, zero: true, lines: [{ key: 'x', label: t('ch_comp'), values: map(comp, (x) => x * 1000), tone: 1 }],
      limit: { values: (run.summary.stroke ?? 0) * 1000, label: t('ch_stroke'), bad: 'above' } },
  ];
}
