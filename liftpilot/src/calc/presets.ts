// Examples of research chapter 7 (illustrative machine data, not real models), as form values.
import type { FormValues } from './types';

const NEW_MACHINE = { n_D: 560, n_groove: 'UU', n_beta: 90, n_gamma: 35, n_i: 43, n_etaD: 0.70, n_etaI: '', n_poles: '4', n_fn: 50, n_nm: 1450, n_Pn: 7.5, n_Jm: 0.08, n_Js: 2.5,
  n_brakeSets: 2, n_brakeNm: 60, n_shaftMax: 2500, n_MpCat: '', n_mass: 450, n_n: 4, n_d: 10, n_Fmin: 47.5, n_qf: 0.336 };
const OLD_MACHINE = { o_D: 600, o_groove: 'UU', o_beta: 95, o_gamma: 35, o_i: 45, o_etaD: 0.60, o_etaI: '', o_poles: '4', o_fn: 50, o_nm: 1430, o_Pn: 7.5, o_Jm: 0.25, o_Js: 3.2,
  o_brakeSets: 1, o_brakeNm: 80, o_shaftMax: 0, o_MpCat: '', o_mass: 600, o_n: 4, o_d: 11, o_Fmin: 57.47, o_qf: 0.4065 };
const PLANT_BASE = { context: 'repl', dropAlign: 'center', keepD: false, keepRopes: true, Q: 630, P: 700, k: 0.5, qeq: '', v: 1.0, H: 18, L0: 2, r: '1', aDesign: 0.8, buffers: false, aBrake: 0.5, rh: 0.2 };

/** A: new installation, machine at the top with a deflector. */
const A: FormValues = { ...PLANT_BASE, ...NEW_MACHINE, ...OLD_MACHINE, context: 'new', layout: 'topDefl', alphaMode: 'manual', alphaManual: 160, dx: 0.30, h: 0.60, Hv: 24,
  Dp: 400, Jp: 0.8, nps: 0, npr: 0, etaShaft: 0.85, compare: false };
/** B: replacement with the machine at the bottom; new ropes with the number, diameter and construction of the existing ones. */
const B: FormValues = { ...PLANT_BASE, ...NEW_MACHINE, ...OLD_MACHINE, n_n: 4, n_d: 11, n_Fmin: 57.47, n_qf: 0.4065, layout: 'bottom', alphaMode: 'geo', alphaManual: 180, dx: 0.30, h: 0.60, Hv: 24,
  Dp: 500, Jp: 1.5, nps: 0, npr: 0, etaShaft: 0.80, compare: true };
/** C: plant of chapter 7 with the machine at the top and direct pull (η_shaft 0.85 is an assumption). */
const C: FormValues = { ...B, layout: 'top', alphaMode: 'geo', nps: 0, npr: 0, etaShaft: 0.85, dropAlign: 'center', compare: true, keepD: true };

export const PRESETS: Readonly<Record<'A' | 'B' | 'C', FormValues>> = { A, B, C };
