// A normal ride from one floor to another with a load: the doors close, the brake lifts, the car follows the
// S-profile, stops, the doors open. At every sample: the pulls at the sheave with the car's acceleration, T1/T2
// against e^(f·α) and the motor torque. Pure.
import { K } from '../calc/norme';
import { KS } from './norme';
import { motionProfile } from './profile';
import { ease, runPhases, type Phase } from './phases';
import { peak, type Frame } from './series';
import type { RideParams, SimModel, SimRun } from './model';

export function ride(m: SimModel, p: RideParams): SimRun {
  const P = m.phys, I = m.I, last = m.levels.length - 1;
  const from = Math.min(Math.max(Math.round(p.from), 0), last), to = Math.min(Math.max(Math.round(p.to), 0), last);
  const load = Math.min(Math.max(p.load, 0), I.Q);
  const s0 = m.levels[from], s1 = m.levels[to], dir: 1 | -1 = s1 >= s0 ? 1 : -1;
  const prof = motionProfile(Math.abs(s1 - s0), I.v, I.aDesign, KS.jerk);
  const state = (s: number, v: number, a: number, door: number, moving: boolean): Omit<Frame, 't'> => {
    const pl = P.pull(s, a, load);
    return {
      s, v, a, cw: m.cw0 - s, theta: P.sheaveAngle(s - s0), rope: I.r * (s - s0), Tc: pl.Tc, Tw: pl.Tw, ratio: pl.ratio, efa: P.efa('braking', s),
      torque: moving ? P.motorTorque(s, v, a, load, dir) : 0, bufCar: 0, bufCw: 0, door, load, slip: 0, brake: moving ? 0 : 1,
    };
  };
  const move = (t: number): Omit<Frame, 't'> => {
    const q = prof.at(t);
    return state(s0 + dir * q.x, dir * q.v, dir * q.a, 0, true);
  };
  const phases: Phase[] = [
    { dur: KS.doorClose, at: (u) => state(s0, 0, 0, 1 - ease(u / KS.doorClose), false), event: 'doorsClose' },
    { dur: KS.startDelay, at: () => state(s0, 0, 0, 0, false) },
    { dur: prof.tAcc, at: (u) => move(u), event: 'start' },
    { dur: prof.tDec - prof.tAcc, at: (u) => move(prof.tAcc + u), event: 'cruise' },
    { dur: prof.T - prof.tDec, at: (u) => move(prof.tDec + u), event: 'decel' },
    { dur: KS.doorOpen, at: (u) => state(s1, 0, 0, ease(u / KS.doorOpen), false), event: ['stop', 'doorsOpen'] },
    { dur: KS.dwell, at: () => state(s1, 0, 0, 1, false) },
  ];
  const series = runPhases(phases);
  const d = series.data;
  let util = 0, ratio = 0, efa = 0, torque = 0, accel = 0;
  for (let i = 0; i < series.n; i++) {
    const u = d.ratio[i] / d.efa[i];
    if (u > util) { util = u; ratio = d.ratio[i]; efa = d.efa[i]; }
    torque = Math.max(torque, Math.abs(d.torque[i]));
    accel = Math.max(accel, Math.abs(d.a[i]));
  }
  // the limit shown during the ride is indicative (registry sim.aderenza.marcia): over it is a warning, never a failed check
  const verdict = util > K.tractionWarn || torque > K.accelTorqueRatioMax * P.Mn ? 'warn' : 'ok';
  return { scenario: { id: 'ride', p: { from, to, load } }, series, events: series.events, summary: { util, ratio, efa, torque, accel, slip: peak(series, 'slip') > 0 }, verdict };
}
