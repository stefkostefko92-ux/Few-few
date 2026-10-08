// The types of the sizing and of the sensitivity (sizing.ts, sensitivity.ts): the options of the grid, the ropes kept in a
// replacement, the brake window. Kept apart from types.ts for its size. Pure types.
import type { Check, Groove, Machine, Results } from './types';

export interface BrakeWindow {
  /** admissible total brake torque: lowest, highest (null: none keeps traction) [N·m] */
  lo: number;
  hi: number | null;
  sets: number;
}

export interface SensitivityVariant {
  key: 'P' | 'k';
  d: number;
  r: Results;
  changed: Check[];
}

/** Ropes kept in a replacement (number, diameter, breaking load, mass). */
export interface RopeSet {
  n: number;
  d: number;
  Fmin: number;
  qf: number;
}

export interface SizingOption {
  D: number;
  d: number;
  n: number;
  rope: { Fmin: number; qf: number };
  groove: Groove;
  tight: boolean;
  real: boolean;
  iIdeal: number;
  i: number;
  Preq: number;
  Pn: number;
  brakeSet: number;
  M: Machine;
  res: Results;
}

export interface Sizing {
  options: SizingOption[];
  pick: SizingOption | null;
  fixedD: number;
  keep: RopeSet | null;
}
