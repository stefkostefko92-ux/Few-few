// Types of the calculation engine. Units: kg, m, s, N, N·m, W, degrees in inputs, radians in traction cases,
// millimetres for sheave, pulley and rope diameters (as entered on site).

export type Context = 'repl' | 'new';
export type Layout = 'top' | 'topDefl' | 'bottom';
export type AlphaMode = 'geo' | 'manual';
export type DropAlign = 'center' | 'car';
/** The standard the machine is verified to: UNI EN 81-20:2020 (a new lift; UNI 10411-1:2024 14.1 a); UNI 10411-11:2024
 *  with EN 81-20) or UNI EN 81-1 (UNI 10411-1:2024 14.1 b); UNI 10411-11:2024 with the lift's original standard). */
export type MachineStd = 'en81-20' | 'en81-1';
export type GrooveType = 'U' | 'UU' | 'VH' | 'VN';

export interface Groove {
  type: GrooveType;
  /** undercut angle β [°] (U with undercut, V without hardening) */
  beta: number;
  /** groove angle γ [°] */
  gamma: number;
}

/** The installation: everything that does not change with the machine. */
export interface Plant {
  context: Context;
  /** rated load [kg] */
  Q: number;
  /** complete empty car [kg] */
  P: number;
  /** balance of the counterweight [—] */
  k: number;
  /** measured balance load [kg]; 0 = not measured */
  qeq: number;
  /** rated speed [m/s] */
  v: number;
  /** travel [m] */
  H: number;
  /** rope beyond the travel on each side [m] */
  L0: number;
  /** roping 1 or 2 */
  r: number;
  layout: Layout;
  alphaMode: AlphaMode;
  alphaManual: number;
  /** deflector: horizontal and vertical distance from the sheave centre [m] */
  dx: number;
  h: number;
  /** bottom machine: height from the machine to the pulleys at the top [m] */
  Hv: number;
  /** diverting pulley diameter [mm] */
  Dp: number;
  /** inertia of one diverting pulley [kg·m²] */
  Jp: number;
  /** extra simple and reverse bends */
  nps: number;
  npr: number;
  /** shaft efficiency η_shaft */
  etaShaft: number;
  /** design acceleration [m/s²] */
  aDesign: number;
  /** minimum deceleration of the emergency-braking traction check [m/s²] */
  ae: number;
  /** minimum deceleration wanted from the brake [m/s²] */
  aBrake: number;
  /** handwheel radius [m] */
  rh: number;
  /** the standard of the machine (rescue and stalled traction differ between the two) */
  std: MachineStd;
  /** an electric safety device (UNI EN 81-20:2020, 5.11.2) stops the machine when the car or the counterweight is stalled
   *  (5.5.3 c) 2)): the stalled traction is then not what keeps the car from rising */
  stallDevice: boolean;
  /** reduced-stroke buffers chosen (their deceleration is ae, which may be the minimum itself) */
  buffers: boolean;
  dropAlign: DropAlign;
  /** direct pull in a replacement: existing drop spacing [mm]; 0 = none */
  drops: number;
}

/** A machine: the existing one or the new one. */
export interface Machine {
  /** sheave pitch diameter [mm] */
  D: number;
  /** reduction ratio */
  i: number;
  /** forward and reverse gear efficiency */
  etaD: number;
  etaI: number;
  /** η_i estimated as 2 − 1/η_d (not entered) */
  etaIest: boolean;
  poles: number;
  groove: Groove;
  /** rated frequency [Hz] and rated speed [1/min] of the motor */
  fn: number;
  nm: number;
  /** rated power [kW] */
  Pn: number;
  /** inertia of motor and flywheel, of the traction sheave [kg·m²] */
  Jm: number;
  Js: number;
  brakeSets: number;
  /** brake torque per set on the motor shaft [N·m] */
  brakeNm: number;
  /** static shaft load allowed by the manufacturer [kg]; 0 = not given */
  shaftMax: number;
  /** output torque allowed by the catalogue [N·m]; 0 = not given */
  MpCat: number;
  /** machine mass [kg] */
  mass: number;
  /** ropes: number, diameter [mm], minimum breaking load [kN], mass [kg/m] */
  n: number;
  d: number;
  Fmin: number;
  qf: number;
}

export interface WrapAngles {
  /** wrap angle [°] with the car at the bottom and at the top */
  B: number;
  T: number;
  reverse?: boolean;
  /** direct pull: offsets of the car and counterweight hitches [m] */
  dc?: number;
  dw?: number;
}

export type EndPosition = 'b' | 't';

export interface TractionCase {
  pos: EndPosition;
  alpha: number;
  mu: number;
  f: number;
  efa: number;
  T1: number;
  T2: number;
  ratio: number;
  util: number;
}

export interface BrakeCase extends TractionCase {
  load: 'q' | 'e';
  dir: 'dn' | 'up';
  /** deceleration of the case and the one used in the check (never below the minimum) [m/s²] */
  a: number;
  aEff: number;
  fromBrake: boolean;
}

export interface StallCase {
  /** t: empty car at the top, the counterweight on its buffers; b: empty car at the bottom, on its own buffers */
  pos: EndPosition;
  alpha: number;
  mu: number;
  f: number;
  efa: number;
  T1: number;
  T2: number;
  ratio: number;
}

export type { BrakeResult, DriveResult, Kinematics, Levers, RescueResult, RopesResult, ShaftResult } from './types-results';
import type { BrakeResult, DriveResult, Kinematics, Levers, RescueResult, RopesResult, ShaftResult } from './types-results';

export type CheckId =
  | 'tr_load' | 'tr_dn' | 'tr_up' | 'tr_real' | 'tr_stall'
  | 'r_dd' | 'r_ddp' | 'r_nd' | 'g_geom' | 'r_sfa'
  | 'd_pst' | 'd_ratio' | 'd_mp' | 's_shaft'
  | 'b_sets' | 'b_all' | 'b_one' | 'b_up' | 'b_amax'
  | 's_force' | 's_uplift'
  | 'tr_msr1' | 'r_two' | 'v_comp' | 'g_retain' | 's_fa' | 's_gravity' | 'g_press';

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'info';

export interface Check {
  id: CheckId;
  status: CheckStatus;
  value: number | null;
  limit: number | null;
  util: number | null;
  /** decimals shown */
  dec: number;
  /** the case that governs the check */
  cs: TractionCase | BrakeCase | null;
}

export interface Results {
  M: Machine;
  k: number;
  Mcw: number;
  alphaDeg: number;
  wa: WrapAngles;
  loadCases: TractionCase[];
  load: TractionCase;
  brk: BrakeCase[];
  dn: BrakeCase;
  up: BrakeCase;
  brkReal: BrakeCase[];
  real: BrakeCase;
  /** machine below at 2:1: the worst emergency-braking case with the rope between the machine and the pulleys at the top
   *  accelerating as it does (r·a) instead of the a the standard prints (UNI EN 81-50:2020, 5.11.3) */
  msr1?: BrakeCase;
  /** emergency-braking cases for a total brake torque (null: at the minimum deceleration of the check) */
  brakeCasesAt: (tb: number | null) => BrakeCase[];
  /** worst traction utilisation at the real deceleration for a total brake torque */
  brakeUtil: (tb: number) => number;
  /** stalled, empty car at the top (the simulation's case) and at the bottom (UNI EN 81-50:2020, 5.11.2.2.3) */
  stall: StallCase;
  stallLow: StallCase;
  ropes: RopesResult;
  kin: Kinematics;
  drive: DriveResult;
  brake: BrakeResult;
  rescue: RescueResult;
  shaft: ShaftResult;
  levers?: Levers;
  checks: Check[];
  fails: Check[];
}

export type { BrakeWindow, RopeSet, SensitivityVariant, Sizing, SizingOption } from './types-sizing';
import type { RopeSet } from './types-sizing';

/** Values of the form, keyed by field id (strings as typed, booleans for check boxes). */
export type FormValues = Readonly<Record<string, string | number | boolean | undefined>>;

export interface ParsedInputs {
  V: FormValues;
  I: Plant;
  N: Machine;
  O: Machine;
  compare: boolean;
  /** fields whose value was out of range and replaced by the fallback */
  bad: string[];
  fixedD: number;
  rope: RopeSet | null;
}
