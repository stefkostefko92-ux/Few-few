// The rope model of one machine on one installation: masses, rope paths, the pull at the sheave with the masses
// accelerating, the inertia referred to the motor shaft and the deceleration a brake gives. compute() takes its
// checks from here and the simulation (src/sim) replays the same forces in time, so the two give the same numbers.
// Pure and deterministic; the operations are the prototype's, in its order (golden test).
import { G } from './math';
import type { Machine, Plant } from './types';

/** A rope segment of length L going up (1) or down (−1) from the load towards the sheave, or a diverting pulley. */
export type Segment = readonly ['s', number, 1 | -1] | readonly ['p'];
export interface RopePath { car: readonly Segment[]; cwt: readonly Segment[] }

export interface RopeModel {
  /** balance used (measured balance load when given) and counterweight mass [kg] */
  k: number;
  Mcw: number;
  /** mass per metre of all the ropes [kg/m] */
  w: number;
  /** diverting pulleys of the layout (one entry each) */
  pulleys: readonly number[];
  /** sheave pitch radius and diverting pulley radius [m] */
  R: number;
  Rp: number;
  /** rope from the car hitch over the sheave to the counterweight hitch [m] */
  ropeLen: number;
  /** rope paths with the car-side and counterweight-side hanging lengths [m] */
  pathLens(Lc: number, Lw: number): RopePath;
  /** rope paths with the car at the lowest (true) or the top floor */
  path(carAtBottom: boolean): RopePath;
  /** pull at the sheave [N]: the hanging mass accelerating upwards with aUp, then each rope segment and pulley */
  walk(mass: number, aUp: number, els: readonly Segment[]): number;
  /** inertia of everything that moves, referred to the motor shaft [kg·m²], with a load in the car */
  Jext(load: number): number;
  /** car deceleration for a total brake torque tb on the motor shaft; tg: torque of the unbalance at the sheave, > 0
   *  when it drives the motion [m/s²] */
  brakeDecel(tb: number, tg: number, load: number): number;
}

export function ropeModel(I: Plant, M: Machine): RopeModel {
  const Q = I.Q, P = I.P, r = I.r;
  const k = I.qeq > 0 ? I.qeq / Q : I.k;
  const Mcw = P + k * Q;
  const w = M.n * M.qf;
  const pulleys = I.layout === 'top' ? [] : I.layout === 'topDefl' ? [1] : [1, 1];
  const Rp = I.Dp / 2000;
  const pathLens = (Lc: number, Lw: number): RopePath => {
    if (I.layout === 'top') return { car: [['s', Lc, 1]], cwt: [['s', Lw, 1]] };
    if (I.layout === 'topDefl') return { car: [['s', Lc, 1]], cwt: [['s', Lw, 1], ['p'], ['s', I.h, 1]] };
    return { car: [['s', Lc, 1], ['p'], ['s', I.Hv, -1]], cwt: [['s', Lw, 1], ['p'], ['s', I.Hv, -1]] };
  };
  const path = (carAtBottom: boolean): RopePath => pathLens(carAtBottom ? I.H + I.L0 : I.L0, carAtBottom ? I.L0 : I.H + I.L0);
  const walk = (mass: number, aUp: number, els: readonly Segment[]): number => {
    let T = (mass * (G + aUp)) / r;
    const aw = r * aUp;
    for (const e of els) {
      if (e[0] === 's') { const m = w * e[1]; T = e[2] > 0 ? T + m * (G + aw) : T - m * (G - aw); }
      else T += (I.Jp * aw) / (Rp * Rp);
      if (T < 0) T = 0;
    }
    return T;
  };
  const R = M.D / 2000;
  const ropeLen = I.layout === 'top' ? I.H + 2 * I.L0 : I.layout === 'topDefl' ? I.H + 2 * I.L0 + I.h : I.H + 2 * I.L0 + 2 * I.Hv;
  const Jpul = pulleys.length * I.Jp * Math.pow(M.D / I.Dp, 2);
  const Jext = (load: number): number => (P + load + Mcw) * Math.pow(R / (r * M.i), 2) + w * ropeLen * Math.pow(R / M.i, 2) + (M.Js + Jpul) / (M.i * M.i);
  // Slow side driving the gear: reverse efficiency η_i; motor side driving it: η_d.
  const brakeDecel = (tb: number, tg: number, load: number): number => {
    const i = M.i, Jls = Jext(load) * i * i;
    let beta = (tb - (M.etaI * tg) / i) / (M.Jm * i + (M.etaI * Jls) / i);
    if (tg + Jls * beta < 0) {
      beta = (M.etaD * i * tb - tg) / (Jls + M.etaD * M.Jm * i * i);
      if (M.Jm * i * beta < tb) beta = (tb - tg / i) / (M.Jm * i + Jls / i); // between the two regimes: friction left out
    }
    return (beta * R) / r;
  };
  return { k, Mcw, w, pulleys, R, Rp, ropeLen, pathLens, path, walk, Jext, brakeDecel };
}
