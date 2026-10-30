// The results of the calculation by part (compute.ts): the ropes, the kinematics, the drive, the brake, the rescue, the
// loads on the shaft and the levers. Kept apart from types.ts for its size. Pure types.
import type { BrakeCase } from './types';

export interface RopesResult {
  Dd: number;
  DpD: number | null;
  nps: number;
  npr: number;
  NeqT: number;
  neqVerified: boolean;
  Kp: number;
  NeqP: number;
  Neq: number;
  SfCalc: number;
  SfMin: number;
  SfReq: number;
  Tmax: number;
  SfAct: number;
  /** specific pressure in the grooves (UNI 10411-1:2024, D.2): the car side's static pull at the sheave with the car at the
   *  lowest floor with its rated load [N], the pressure and its limit at the ropes' speed [N/mm²] */
  press: { T: number; p: number; limit: number };
}

export interface Kinematics {
  nS: number;
  iIdeal: number;
  vReal: number;
  dev: number;
  fRated: number;
  ns: number;
  slip: number;
}

export interface DriveResult {
  dF: number;
  Ms: number;
  MmSt: number;
  Pst: number;
  /** the static power at the motor's rated speed for the static torque: Pst, more when the machine runs faster than the
   *  rated speed (the drive turns the motor under its base frequency, where its torque is the limit) [W] */
  Peq: number;
  empty: boolean;
  Pbal: number;
  Mn: number;
  Macc: number;
  accRatio: number;
  /** torque on the reducer's output shaft [N·m]: in acceleration (rated load up, empty car down), at the emergency
   *  braking with the real brake (its worst case) and at the test with 1,25·Q; the largest of the three */
  MpAcc: number;
  MpBrake: number;
  MpBrakeCase: BrakeCase;
  MpTest: number;
  MpMax: number;
  powerUtil: number;
}

export interface BrakeResult {
  all: number;
  one: number;
  up: number;
  avail: number;
  perSet: number;
  sets: number;
  aMax: number;
  aMaxCase: BrakeCase;
}

export interface RescueResult {
  /** torque and force at the handwheel to raise the car with its rated load from the lowest floor [N·m, N] */
  M: number;
  F: number;
  /** force at the handwheel to bring the car to a landing with a load in (k − 0.1)·Q … (k + 0.1)·Q, the worse direction
   *  and position (UNI EN 81-20:2020, 5.9.2.3.1 a)) [N] */
  Fa: number;
}

export interface ShaftResult {
  testKg: number;
  /** the resultant of the ropes' static pulls on the sheave with the rated load, car at the lowest floor [kg] (the base of
   *  the dynamic pull on a bottom machine's anchors) */
  ratedKg: number;
  up: boolean;
  uplift: number | null;
}

export interface Levers {
  need: number;
  alphaMin: number;
  betaMin?: number;
  gammaMax?: number;
}
