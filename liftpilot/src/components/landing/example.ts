// The landing page's numbers, from the software itself: the sample installation of the product showcase (a new lift in
// the shaft of the drawings, with the machine the software proposes) with every check of its machine and its emergency
// stop as the simulation runs it; how many distinct checks the registries cover and how many values they hold. The
// sample is derived once per server process (the same inputs give the same lift), the texts on each request. Server only.
import 'server-only';
import { VOCI } from '@/calc/norme';
import { ENGINE_VERSION } from '@/calc/snapshot';
import type { CheckId, CheckStatus } from '@/calc/types';
import { VOCI_VANO } from '@/shaft';
import { VOCI_IMPIANTO } from '@/lib/lift/norme';
import { deriveLift, newLift, type LiftDerived } from '@/lib/lift';
import { runScenario, type SimRun } from '@/sim';
import { VOCI_SIM } from '@/sim/norme';
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

/** The sample's installation (rated load, speed, travel) and its machine as the proposal made it (sheave, ropes,
 *  ratio, motor), as the page prints them. */
export interface SampleMachine {
  Q: string;
  v: string;
  H: string;
  D: string;
  ropes: string;
  ratio: string;
  power: string;
}

export interface Sample {
  engine: string;
  /** every check of the machine, in the calculator's order */
  checks: ExampleCheck[];
  verdict: string;
  machine: SampleMachine;
}

/** The emergency stop of the sample (empty car going up, the verification's deceleration): the largest T1/T2, the limit
 *  e^(f·α) at that moment and their ratio, the deceleration [m/s²], the distance from the brake's closing to the stop [m]. */
export interface SampleStop {
  peak: number;
  efa: number;
  util: number;
  accel: number;
  stop: number;
}

let sample: { d: LiftDerived; stop: SimRun } | null = null;
function sampleLift(): { d: LiftDerived; stop: SimRun } {
  if (!sample) {
    const d = deriveLift(newLift());
    sample = { d, stop: runScenario(d.sim, { id: 'brake', p: { load: 'e', dir: 'up', decel: 'norm' } }) };
  }
  return sample;
}

/** The checks of the sample installation's machine, the installation and the machine itself. */
export function sampleChecks(P: Pres): Sample {
  const { d } = sampleLift(), a = d.analysis, X = textsFor(P), N = a.ctx.N, I = a.ctx.I;
  const checks = a.res.checks.map((c): ExampleCheck => ({
    id: c.id, label: P.t(c.id), value: X.checkValue(c, N), limit: X.checkLimit(c, N), status: c.status, statusText: X.st(c.status),
  }));
  return {
    engine: ENGINE_VERSION, checks, verdict: X.verdictText(a.res),
    machine: {
      Q: `${P.fmt(I.Q, 0)} kg`, v: `${P.fmt(I.v, 2)} m/s`, H: `${P.fmt(I.H, 1)} m`,
      D: `${P.fmt(N.D, 0)} mm`, ropes: `${N.n} × Ø${P.fmt(N.d, 0)} mm`, ratio: `1:${P.fmt(N.i, 0)}`, power: `${P.fmt(N.Pn, 1)} kW`,
    },
  };
}

/** The sample's emergency stop as the simulation runs it. */
export function sampleStop(): SampleStop {
  const { stop: run } = sampleLift(), s = run.series;
  const at = (id: 'brakeOn' | 'carStop'): number => run.events.find((e) => e.id === id)?.t ?? 0;
  const on = Math.round(at('brakeOn') / s.dt), still = Math.round(at('carStop') / s.dt);
  return {
    peak: run.summary.ratio, efa: run.summary.efa, util: run.summary.util, accel: run.summary.accel,
    stop: run.summary.stopDistance ?? s.data.s[still] - s.data.s[on],
  };
}

/** The registries' size, as /app/norme lists them: the values, each with its source and state, and the distinct checks
 *  they cover. */
export function registryCounts(): { values: number; checks: number } {
  // every check has its entry in the machine's or the shaft's registry (norme.test.ts), so these are all of them
  const checks = new Set<string>([...VOCI.flatMap((v) => v.verifiche ?? []), ...VOCI_VANO.flatMap((v) => v.verifiche ?? [])]);
  return { values: VOCI.length + VOCI_VANO.length + VOCI_IMPIANTO.length + VOCI_SIM.length, checks: checks.size };
}
