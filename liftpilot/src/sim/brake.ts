// Emergency stop at the end position where the case of the verification is evaluated (the governing one, or the one
// asked), with the standard's minimum deceleration or with the brake's own (all sets, never below that minimum: as in
// the verification). The car comes toward that end at rated speed and stops there; when the case's end is the one the
// car leaves (it cannot pass it at speed), or the travel is too short, it starts from rest at a floor and the brake
// closes as soon as it is up to speed. When T1/T2 would pass e^(f·α) the ropes slip: the sheave stops at the brake's
// rate, the car only at the rate traction allows, over a longer distance; if traction cannot hold the car at all, or
// the brake cannot hold it, the car runs on to the buffers. Pure.
import { K } from '../calc/norme';
import { brakeLoad } from '../calc/compute';
import { runPhases, type Phase } from './phases';
import type { Frame } from './series';
import { brakeParams, travelLimits, type BrakeParams, type SimModel, type SimRun } from './model';

const CRUISE = 2;
const HOLD = 2.5;

export function brake(m: SimModel, asked: BrakeParams): SimRun {
  const p = brakeParams(asked), P = m.phys, I = m.I, H = m.H, real = p.decel === 'real', dir: 1 | -1 = p.dir === 'dn' ? 1 : -1;
  const load = brakeLoad(p.load, I.Q);
  // the end position of this case in the verification
  const cases = (real ? m.res.brkReal : m.res.brk).filter((c) => c.load === p.load && c.dir === p.dir);
  const cs = cases.find((c) => c.pos === p.pos) ?? cases.reduce((a, b) => (b.util > a.util ? b : a));
  const sEnd = cs.pos === 'b' ? 0 : H;
  const aOwn = real ? P.brakeDecel(sEnd, dir, load) : I.ae, holds = aOwn > 0, aB = holds ? Math.max(I.ae, aOwn) : 0;
  // a brake model without bound (no motor inertia behind a self-locking gear: the verification shows ∞) stops the car
  // at once, with no slip worked out
  const instant = aB === Infinity;
  const util = (s: number, a: number): number => P.pull(s, dir * a, load).ratio / P.efa('braking', s);
  // the car's deceleration: the brake's, or the largest that traction holds when the ropes would slip
  let aCar = aB;
  const slip = holds && !instant && util(sEnd, aB) > 1;
  if (slip) {
    if (util(sEnd, 0) > 1) aCar = 0;
    else {
      let lo = 0, hi = aB;
      for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2;
        if (util(sEnd, mid) > 1) hi = mid;
        else lo = mid;
      }
      aCar = lo;
    }
  }
  const stops = aCar > 0, aAcc = Math.max(0.1, I.aDesign);
  const stop = (u: number): number => (stops ? (u * u) / (2 * aCar) : 0);
  // a position d metres further along the travel from s
  const along = (s: number, d: number): number => s - dir * d;
  // where the car comes from and the speed at which the brake closes
  const arriving = (sEnd === 0) === (dir === 1);
  const atSpeed = arriving && stop(I.v) + I.v * CRUISE <= H;
  // from rest: accelerate, cruise (arriving only) and stop all within the travel, at rated speed when they fit
  const fit = Math.min(I.v, Math.sqrt(H / (1 / (2 * aAcc) + (stops ? 1 / (2 * aCar) : 0))));
  const vb = atSpeed ? I.v : fit, dAcc = atSpeed ? 0 : (vb * vb) / (2 * aAcc);
  const sStart = atSpeed ? sEnd + dir * (stop(vb) + vb * CRUISE) : arriving ? (dir === 1 ? H : 0) : sEnd;
  const sBrake = atSpeed || !arriving ? along(sStart, atSpeed ? vb * CRUISE : dAcc) : sEnd + dir * stop(vb);
  const dCruise = atSpeed ? vb * CRUISE : Math.max(0, Math.abs(sBrake - sStart) - dAcc);
  // after the brake closes: stopped, or on to the buffers at the end it is heading for
  const limit = dir === 1 ? m.carContact - m.carStroke : m.cwContact + m.cwStroke;
  const tCar = stops ? vb / aCar : vb > 1e-6 ? Math.abs(sBrake - limit) / vb + 0.5 : 0, tSheave = aB > 0 ? Math.min(vb / aB, tCar) : tCar;
  const frame = (at: number, vUp: number, aUp: number, sheave: number, braking: boolean, slipping: boolean, stopped: boolean): Omit<Frame, 't'> => {
    // a car that runs past its floor lands on the buffers (the counterweight on its own going up)
    const { s, bufCar, bufCw } = travelLimits(m, at), onBuffer = s !== at;
    const pl = P.pull(s, aUp, load);
    return {
      s, v: onBuffer ? 0 : vUp, a: onBuffer ? 0 : aUp, cw: m.cw0 - s, theta: P.sheaveAngle(sheave), rope: I.r * (s - sStart), Tc: pl.Tc, Tw: pl.Tw,
      ratio: pl.ratio, efa: P.efa('braking', s), torque: braking && !stopped ? dir * P.Tb : braking ? 0 : P.motorTorque(s, vUp, aUp, load, dir === 1 ? -1 : 1), bufCar, bufCw,
      door: 0, load, slip: slipping && !onBuffer ? 1 : 0, brake: braking ? 1 : 0,
    };
  };
  const carAt = (t: number): number => { const u = Math.min(t, tCar); return along(sBrake, u > 0 ? vb * u - (aCar * u * u) / 2 : 0); };
  // a point on the sheave rim, as car travel from the start: with the car, or stopped by the brake while the ropes slip
  const sheaveAt = (t: number): number => (slip ? along(sBrake, vb * Math.min(t, tSheave) - (aB * Math.min(t, tSheave) ** 2) / 2) : carAt(t)) - sStart;
  const lead: Phase[] = [
    { dur: atSpeed ? 0 : vb / aAcc, at: (u) => { const s = along(sStart, (aAcc * u * u) / 2); return frame(s, -dir * aAcc * u, -dir * aAcc, s - sStart, false, false, false); } },
    { dur: vb > 1e-6 ? dCruise / vb : 0, at: (u) => { const s = along(sStart, dAcc + vb * u); return frame(s, -dir * vb, 0, s - sStart, false, false, false); } },
  ];
  const moving = (u: number, slipping: boolean): Omit<Frame, 't'> => frame(carAt(u), -dir * (vb - aCar * u), dir * aCar, sheaveAt(u), true, slipping, false);
  const phases: Phase[] = [
    ...lead,
    ...(slip && tSheave < tCar
      ? [
        { dur: tSheave, at: (u: number) => moving(u, true), event: ['brakeOn', 'slip'] as const },
        { dur: tCar - tSheave, at: (u: number) => moving(tSheave + u, true), event: 'sheaveStop' as const },
      ]
      : [{ dur: tCar, at: (u: number) => moving(u, slip), event: 'brakeOn' as const }]),
    { dur: HOLD, at: () => frame(carAt(tCar), 0, 0, sheaveAt(tCar), true, false, true), event: 'carStop' },
  ];
  const series = runPhases(phases);
  const uBrake = holds && !instant ? util(sEnd, aB) : Infinity, efa = P.efa('braking', sEnd);
  // the brake's own deceleration is a warning in the verification (tr_real), the standard's minimum a requirement; a
  // car that does not stop fails either way
  const verdict = !stops ? 'fail' : uBrake <= K.tractionWarn ? 'ok' : real || uBrake <= 1 ? 'warn' : 'fail';
  return {
    scenario: { id: 'brake', p }, series, events: series.events, verdict,
    summary: {
      util: uBrake, ratio: uBrake * efa, efa, torque: P.Tb, accel: aB, stopDistance: holds ? (vb * vb) / (2 * aB) : Infinity,
      ...(slip ? { slipDistance: stops ? stop(vb) : Infinity } : {}), slip, ...(real ? { brakeOwn: aOwn } : {}),
    },
  };
}
