// From the data entered once to everything the checks and the simulation need: the shaft laid out (the car, and
// the rated load when not given), the calculator's values with the travel, the speed and the rated load taken from
// the shaft, the car mass estimated when missing, the rope geometry measured on the plan and the section, the machine
// proposed by the sizing (and the geometry again with its sheave). Every automatic value can be switched off and
// entered by hand (AutoFlags). Pure: the browser and the server derive the same.
import { readInputs, sizeMachine } from '@/calc/index';
import type { FormValues } from '@/calc/types';
import { layout, section, travel, type Layout, type ShaftInputs } from '@/shaft';
import type { MachineSpec } from '@/shaft/machine-room';
import { analyse, mirrorRopes, proposalValues, type Analysis } from '@/lib/present/analysis';
import { simModel, type SimModel } from '@/sim';
import { KL } from './norme';

/** Values the software fills in (true) or takes as entered (false). */
export interface AutoFlags {
  P: boolean;
  machine: boolean;
  L0: boolean;
  dx: boolean;
  Hv: boolean;
}

/** The one form of an installation: the shaft (plan, floors, machine room), the calculator's values, the switches. */
export interface LiftInputs {
  shaft: ShaftInputs;
  calc: FormValues;
  auto: AutoFlags;
}

export type Origin = 'entered' | 'auto' | 'estimate';
export type DerivedKey = 'Q' | 'v' | 'H' | 'P' | 'L0' | 'dx' | 'Hv' | 'machine';

export interface LiftDerived {
  shaft: ShaftInputs;
  /** the calculator's values, complete: what the calculation record stores */
  values: FormValues;
  layout: Layout;
  analysis: Analysis;
  origin: Readonly<Record<DerivedKey, Origin>>;
  /** the sizing found no machine: the one entered is checked instead */
  noProposal: boolean;
  machine: MachineSpec;
  sim: SimModel;
}

const num = (V: FormValues, id: string): number => {
  const x = parseFloat(String(V[id] ?? '').replace(',', '.'));
  return Number.isFinite(x) ? x : 0;
};
const m3 = (x: number): number => Math.round(x * 1000) / 1000;

/** P = ratio · Q, rounded up to the step (registry impianto.massa.cabina). */
export const carMassEstimate = (Q: number): number => Math.ceil((KL.carMassRatio * Q) / KL.carMassStep - 1e-9) * KL.carMassStep;

/** Rope beyond the travel: from the crosshead at the top floor to the sheave axis (registry impianto.L0). */
function ropeBeyond(S: ShaftInputs, V: FormValues): number {
  const vt = S.vertical, D = num(V, 'n_D');
  const above = V.layout !== 'bottom' && S.room ? S.room.slab + KL.sheaveAxisPerD * D : 0;
  return Math.max(0.1, m3((vt.headroom - vt.frameTop + above) / 1000));
}

/** Horizontal distance from the sheave to the diverting pulley: the drop spacing on the plan less the two radii. */
function deflectorDx(L: Layout, V: FormValues): number {
  const car = [L.car.x + L.car.w / 2, L.car.y + L.car.h / 2], cw = [L.cw.x + L.cw.w / 2, L.cw.y + L.cw.h / 2];
  const calata = Math.hypot(cw[0] - car[0], cw[1] - car[1]);
  return Math.max(0, m3((calata - num(V, 'n_D') / 2 - num(V, 'Dp') / 2) / 1000));
}

export function deriveLift(inp: LiftInputs): LiftDerived {
  const S = inp.shaft, L = layout(S), vt = S.vertical, rise = travel(vt.floors);
  let V: FormValues = { ...inp.calc, Q: L.Q, v: vt.v, H: rise / 1000 };
  if (inp.auto.P) V = { ...V, P: carMassEstimate(L.Q) };
  if (inp.auto.Hv) V = { ...V, Hv: m3((rise + vt.headroom) / 1000) };
  const geometry = (): void => {
    if (inp.auto.L0) V = { ...V, L0: ropeBeyond(S, V) };
    if (inp.auto.dx) V = { ...V, dx: deflectorDx(L, V) };
  };
  geometry();
  V = mirrorRopes(V);
  let noProposal = false;
  if (inp.auto.machine) {
    // the sheave changes the rope geometry, which changes the wrap angle: size again until the sheave stays
    for (let k = 0; k < 3; k++) {
      const ctx = readInputs(V), sz = sizeMachine(ctx.I, ctx.N, ctx.fixedD, ctx.rope);
      if (!sz.pick) { noProposal = true; break; }
      const before = num(V, 'n_D');
      V = mirrorRopes({ ...V, ...proposalValues(sz.pick) });
      geometry();
      if (num(V, 'n_D') === before) break;
    }
  }
  const analysis = analyse(V), { I, N } = analysis.ctx;
  const origin: Record<DerivedKey, Origin> = {
    Q: S.Q === null ? 'auto' : 'entered', v: 'entered', H: 'auto', P: inp.auto.P ? 'estimate' : 'entered',
    L0: inp.auto.L0 ? 'auto' : 'entered', dx: inp.auto.dx ? 'auto' : 'entered', Hv: inp.auto.Hv ? 'auto' : 'entered',
    machine: inp.auto.machine && !noProposal ? 'auto' : 'entered',
  };
  const machine: MachineSpec = { D: N.D, Dp: I.layout === 'topDefl' ? I.Dp : 0, n: N.n, d: N.d, mass: N.mass, label: '' };
  return { shaft: L.inputs, values: V, layout: L, analysis, origin, noProposal, machine, sim: simModel(I, N, analysis.res, section(L), vt) };
}
