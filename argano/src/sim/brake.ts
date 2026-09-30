// Emergency stop: the car runs at rated speed toward the end of its travel where the case of the verification is
// evaluated, the brake closes and the car stops there. With the brake's own deceleration (all sets) or with the minimum
// of the standard. When T1/T2 would pass e^(f·α) the ropes slip: the sheave stops at the brake's rate, the car only at
// the rate traction allows, over a longer distance (the brake closes that much earlier, so the stop is still at the
// floor); if traction cannot hold the car at all, it runs on to the buffers. Pure.
import { K } from '../calc/norme';
import { runPhases, type Phase } from './phases';
import type { Frame } from './series';
import { travelLimits, type BrakeParams, type SimModel, type SimRun } from './model';

const CRUISE = 2;
const HOLD = 2.5;

export function brake(m: SimModel, p: BrakeParams): SimRun {
  const P = m.phys, I = m.I, load = p.load === 'q' ? I.Q : 0, dir: 1 | -1 = p.dir === 'dn' ? 1 : -1;
  // the governing end position of this case in the verification
  const cases = (p.decel === 'real' ? m.res.brkReal : m.res.brk).filter((c) => c.load === p.load && c.dir === p.dir);
  const cs = cases.reduce((a, b) => (b.util > a.util ? b : a));
  const sEnd = cs.pos === 'b' ? 0 : m.H;
  const aB = p.decel === 'real' ? P.brakeDecel(sEnd, dir, load) : I.ae;
  const util = (s: number, a: number): number => P.pull(s, dir * a, load).ratio / P.efa('braking', s);
  // the car's deceleration: the brake's, or the largest that traction holds when the ropes would slip
  let aCar = Math.max(0, aB);
  const slip = aB > 0 && util(sEnd, aB) > 1;
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
  const v = I.v, dBrake = aB > 0 ? (v * v) / (2 * aB) : 0, dCar = slip && aCar > 0 ? (v * v) / (2 * aCar) : dBrake;
  // the brake closes where the car, sliding or not, stops at the end position
  const sBrake = sEnd + dir * dCar, sStart = sBrake + dir * v * CRUISE;
  const tCar = aCar > 0 ? v / aCar : 3, tSheave = aB > 0 ? v / aB : tCar;
  const frame = (at: number, vUp: number, aUp: number, sheaveTravel: number, braking: boolean, slipping: boolean, stopped: boolean): Omit<Frame, 't'> => {
    // a car that slides past its floor lands on the buffers (the counterweight on its own going up)
    const { s, bufCar, bufCw } = travelLimits(m, at), onBuffer = s !== at;
    const pl = P.pull(s, aUp, load);
    return {
      s, v: onBuffer ? 0 : vUp, a: onBuffer ? 0 : aUp, cw: m.cw0 - s, theta: P.sheaveAngle(sheaveTravel), rope: I.r * (s - sStart), Tc: pl.Tc, Tw: pl.Tw,
      ratio: pl.ratio, efa: P.efa('braking', s), torque: braking && !stopped ? dir * P.Tb : braking ? 0 : P.motorTorque(s, vUp, 0, load), bufCar, bufCw,
      door: 0, load, slip: slipping && !onBuffer ? 1 : 0, brake: braking ? 1 : 0,
    };
  };
  // travel of a point on the sheave rim, as car travel, t seconds after the brake closes (sign: toward car up)
  const sheaveAt = (t: number): number => {
    const u = Math.min(t, tSheave);
    return -dir * (v * CRUISE + v * u - (aB * u * u) / 2);
  };
  const carAt = (t: number): number => {
    const u = Math.min(t, tCar);
    return sBrake - dir * (v * u - (aCar * u * u) / 2);
  };
  const phases: Phase[] = [
    { dur: CRUISE, at: (u) => frame(sStart - dir * v * u, -dir * v, 0, -dir * v * u, false, false, false) },
    ...(slip && tSheave < tCar
      ? [
        { dur: tSheave, at: (u: number) => frame(carAt(u), -dir * (v - aCar * u), dir * aCar, sheaveAt(u), true, true, false), event: ['brakeOn', 'slip'] as const },
        { dur: tCar - tSheave, at: (u: number) => frame(carAt(tSheave + u), -dir * (v - aCar * (tSheave + u)), dir * aCar, sheaveAt(tSheave + u), true, true, false), event: 'sheaveStop' as const },
      ]
      : [{ dur: tCar, at: (u: number) => frame(carAt(u), -dir * (v - aCar * u), dir * aCar, sheaveAt(u), true, false, false), event: 'brakeOn' as const }]),
    { dur: HOLD, at: () => frame(carAt(tCar), 0, 0, sheaveAt(tCar), true, false, true), event: 'carStop' },
  ];
  const series = runPhases(phases);
  const uBrake = aB > 0 ? util(sEnd, aB) : Infinity, efa = P.efa('braking', sEnd);
  // the brake's own deceleration is a warning in the verification (tr_real); the standard's minimum is a requirement
  const verdict = uBrake <= K.tractionWarn ? 'ok' : p.decel === 'real' || uBrake <= 1 ? 'warn' : 'fail';
  return {
    scenario: { id: 'brake', p }, series, events: series.events, verdict,
    summary: {
      util: uBrake, ratio: uBrake * efa, efa, torque: P.Tb, accel: aB, stopDistance: dBrake,
      ...(slip ? { slipDistance: aCar > 0 ? dCar : Infinity } : {}), slip,
    },
  };
}
