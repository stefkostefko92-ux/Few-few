// The forces at one instant: the car s metres above the lowest floor, accelerating upwards with aUp, with a load in
// it. Ropes, pulleys, wrap angle, friction and brake come from the calculation engine (src/calc/model.ts), so at the
// end positions and at the accelerations of the verification the numbers are the verification's. Pure.
import { K } from '../calc/norme';
import { deg, rad, ratio } from '../calc/math';
import { grooveF } from '../calc/groove';
import { ropeLean, wrapAngles } from '../calc/geometry';
import { ropeModel, type RopeModel } from '../calc/model';
import type { Machine, Plant } from '../calc/types';

export type Friction = 'loading' | 'braking' | 'stalled';

export interface Pull {
  /** pull at the sheave on the car side and on the counterweight side [N]; T1/T2 */
  Tc: number;
  Tw: number;
  ratio: number;
}

export interface Physics {
  I: Plant;
  M: Machine;
  model: RopeModel;
  /** wrap angle with the car at s [rad] */
  alpha(s: number): number;
  f(cond: Friction): number;
  efa(cond: Friction, s: number): number;
  /** pull at the sheave; cwMass: the counterweight mass hanging on the ropes (default: all of it) */
  pull(s: number, aUp: number, load: number, cwMass?: number): Pull;
  /** torque on the motor shaft, positive toward car up [N·m]: the motor driving the load or holding it back; dir: the
   *  direction of travel when the car is at rest (start) */
  motorTorque(s: number, v: number, aUp: number, load: number, dir?: 1 | -1): number;
  /** rated motor torque and total brake torque [N·m] */
  Mn: number;
  Tb: number;
  /** car deceleration the brake gives with all its sets, the car moving down (dir 1) or up (−1) at s [m/s²] */
  brakeDecel(s: number, dir: 1 | -1, load: number, tb?: number): number;
  /** sheave rotation for a car travel [rad]; the motor turns i times as much */
  sheaveAngle(travel: number): number;
}

export function physics(I: Plant, M: Machine): Physics {
  const model = ropeModel(I, M), r = I.r, R = model.R;
  const wa = wrapAngles(I, M);
  // hanging rope lengths as the engine counts them: Lc = H + L0 with the car at the bottom, L0 at the top
  const lens = (s: number): readonly [number, number] => [Math.max(0.05, I.H - s + I.L0), Math.max(0.05, s + I.L0)];
  const drops = I.alphaMode !== 'manual' && I.layout === 'top' && I.drops > 0 && wa.dc != null && wa.dw != null;
  const alpha = (s: number): number => {
    if (!drops) return rad(wa.B);
    const [Lc, Lw] = lens(s), R0 = M.D / 2000;
    return rad(180 - deg(ropeLean(R0, wa.dc ?? 0, Lc) + ropeLean(R0, wa.dw ?? 0, Lw)));
  };
  const vf = I.v * r;
  const fs: Record<Friction, number> = {
    loading: grooveF(K.muLoading, M.groove, 'loading'),
    braking: grooveF(K.muBrakingBase / (1 + vf / K.muBrakingSpeed), M.groove, 'braking'),
    stalled: grooveF(K.muStalled, M.groove, 'stalled'),
  };
  const pull = (s: number, aUp: number, load: number, cwMass = model.Mcw): Pull => {
    const [Lc, Lw] = lens(s), p = model.pathLens(Lc, Lw);
    const Tc = model.walk(I.P + load, aUp, p.car), Tw = model.walk(cwMass, -aUp, p.cwt);
    return { Tc, Tw, ratio: ratio(Tc, Tw) };
  };
  const etaFwd = M.etaD * I.etaShaft, etaRev = M.etaI * I.etaShaft;
  return {
    I, M, model,
    alpha,
    f: (cond) => fs[cond],
    efa: (cond, s) => Math.exp(fs[cond] * alpha(s)),
    pull,
    motorTorque(s, v, aUp, load, travel) {
      const { Tc, Tw } = pull(s, aUp, load);
      // torque the sheave needs toward car up: the pulls (masses, ropes and pulleys accelerating) and the sheave itself
      const Ms = (Tc - Tw) * R + (M.Js * aUp * r) / R, aM = (aUp * r * M.i) / R;
      const dir = v !== 0 ? Math.sign(v) : travel ?? (Math.sign(aUp) || 1);
      // power flowing from the motor to the load: forward efficiency; from the load to the motor: reverse
      return (Ms * dir >= 0 ? Ms / (M.i * etaFwd) : (Ms * etaRev) / M.i) + M.Jm * aM;
    },
    Mn: (9550 * M.Pn) / M.nm,
    Tb: M.brakeNm * M.brakeSets,
    brakeDecel(s, dir, load, tb = M.brakeNm * M.brakeSets) {
      const { Tc, Tw } = pull(s, 0, load);
      return model.brakeDecel(tb, dir * (Tc - Tw) * R, load);
    },
    sheaveAngle: (travel) => (travel * r) / R,
  };
}
