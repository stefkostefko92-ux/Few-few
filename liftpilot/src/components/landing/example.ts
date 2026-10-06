// The landing page's numbers, from the software itself: the three checks of example A of the calculator beside its
// machine in the hero; the sample installation of the floors (a new lift in the shaft of 1600 × 1750 mm of the
// drawings, with the machine the software proposes) with every check of its machine and its emergency stop as the
// simulation runs it; how many distinct checks the registries cover and how many values they hold. The sample is
// derived once per server process (the same inputs give the same lift), the texts on each request. Server only.
import 'server-only';
import { PRESETS } from '@/calc/presets';
import { VOCI } from '@/calc/norme';
import { ENGINE_VERSION } from '@/calc/snapshot';
import type { CheckId, CheckStatus } from '@/calc/types';
import { VOCI_VANO } from '@/shaft';
import { VOCI_IMPIANTO } from '@/lib/lift/norme';
import { deriveLift, newLift, type LiftDerived } from '@/lib/lift';
import { runScenario, type SimRun } from '@/sim';
import { VOCI_SIM } from '@/sim/norme';
import { analyse } from '@/lib/present/analysis';
import { textsFor } from '@/lib/present/texts';
import type { Pres } from '@/lib/present/tr';

export interface ExampleCheck {
  id: CheckId;
  label: string;
  value: string;
  limit: string;
  status: CheckStatus;
  statusText: string;
}

export interface Example {
  engine: string;
  /** every check of the machine, in the calculator's order */
  checks: ExampleCheck[];
  verdict: string;
}

/** The sample's machine as the proposal made it: sheave, ropes, ratio, motor. */
export interface SampleMachine {
  D: string;
  ropes: string;
  ratio: string;
  power: string;
}

/** The emergency stop of the sample (empty car going up, the verification's deceleration), sampled for its charts. */
export interface SampleStop {
  /** time of the first sample and the step [s] */
  t0: number;
  dt: number;
  /** car speed [m/s]; T1/T2 at the sheave; e^(f·α) of the braking condition from the brake's closing (null before) */
  v: number[];
  ratio: number[];
  limit: (number | null)[];
  brakeOn: number;
  carStop: number;
  /** the largest T1/T2, the limit at that moment and their ratio; the deceleration [m/s²] */
  peak: number;
  efa: number;
  util: number;
  accel: number;
  /** distance from the brake's closing to the stop [m] */
  stop: number;
}

function checksOf(P: Pres, a: ReturnType<typeof analyse>): Example {
  const X = textsFor(P), N = a.ctx.N;
  const checks = a.res.checks.map((c): ExampleCheck => ({
    id: c.id, label: P.t(c.id), value: X.checkValue(c, N), limit: X.checkLimit(c, N), status: c.status, statusText: X.st(c.status),
  }));
  return { engine: ENGINE_VERSION, checks, verdict: X.verdictText(a.res) };
}

/** Example A of the calculator computed now, with the texts of the locale's calculator dictionary (the hero's machine). */
export const exampleA = (P: Pres): Example => checksOf(P, analyse(PRESETS.A));

let sample: { d: LiftDerived; stop: SimRun } | null = null;
function sampleLift(): { d: LiftDerived; stop: SimRun } {
  if (!sample) {
    const d = deriveLift(newLift());
    sample = { d, stop: runScenario(d.sim, { id: 'brake', p: { load: 'e', dir: 'up', decel: 'norm' } }) };
  }
  return sample;
}

/** The checks of the sample installation's machine and the machine itself. */
export function sampleChecks(P: Pres): Example & { machine: SampleMachine } {
  const { d } = sampleLift(), N = d.analysis.ctx.N;
  return {
    ...checksOf(P, d.analysis),
    machine: { D: `${P.fmt(N.D, 0)} mm`, ropes: `${N.n} × Ø${P.fmt(N.d, 0)} mm`, ratio: `1:${P.fmt(N.i, 0)}`, power: `${P.fmt(N.Pn, 1)} kW` },
  };
}

/** The sample's emergency stop from a second before the brake closes to a second after the car stops. */
export function sampleStop(): SampleStop {
  const { stop: run } = sampleLift(), s = run.series, dt = s.dt;
  const at = (id: 'brakeOn' | 'carStop'): number => run.events.find((e) => e.id === id)?.t ?? 0;
  const brakeOn = at('brakeOn'), carStop = at('carStop'), on = Math.round(brakeOn / dt), still = Math.round(carStop / dt);
  const i0 = Math.max(0, on - Math.round(1 / dt)), i1 = Math.min(s.n - 1, still + Math.round(1 / dt));
  const round = (x: number): number => Math.round(x * 1e4) / 1e4;
  const take = <T,>(f: (i: number) => T): T[] => Array.from({ length: i1 - i0 + 1 }, (_, k) => f(i0 + k));
  return {
    t0: i0 * dt, dt, brakeOn, carStop,
    v: take((i) => round(s.data.v[i])), ratio: take((i) => round(s.data.ratio[i])), limit: take((i) => (i >= on ? round(s.data.efa[i]) : null)),
    peak: run.summary.ratio, efa: run.summary.efa, util: run.summary.util, accel: run.summary.accel,
    stop: run.summary.stopDistance ?? s.data.s[still] - s.data.s[on],
  };
}

/** The registries' size: the values with their document, clause and state, the distinct checks they cover. */
export function registryCounts(): { values: number; checks: number } {
  // every check has its entry in the machine's or the shaft's registry (norme.test.ts), so these are all of them
  const checks = new Set<string>([...VOCI.flatMap((v) => v.verifiche ?? []), ...VOCI_VANO.flatMap((v) => v.verifiche ?? [])]);
  return { values: VOCI.length + VOCI_VANO.length + VOCI_IMPIANTO.length + VOCI_SIM.length, checks: checks.size };
}
