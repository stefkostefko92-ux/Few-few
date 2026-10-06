// Types of the calculation engine. Units: kg, m, s, N, N·m, W, degrees in inputs, radians in traction cases,
// millimetres for sheave, pulley and rope diameters (as entered on site).

export type Context = 'repl' | 'new';
export type Layout = 'top' | 'topDefl' | 'bottom';
export type AlphaMode = 'geo' | 'manual';
export type DropAlign = 'center' | 'car';
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
  empty: boolean;
  Pbal: number;
  Mn: number;
  Macc: number;
  accRatio: number;
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
  M: number;
  F: number;
}

export interface ShaftResult {
  testKg: number;
  up: boolean;
  uplift: number | null;
}

export interface Levers {
  need: number;
  alphaMin: number;
  betaMin?: number;
  gammaMax?: number;
}

export type CheckId =
  | 'tr_load' | 'tr_dn' | 'tr_up' | 'tr_real' | 'tr_stall'
  | 'r_dd' | 'r_ddp' | 'r_nd' | 'g_geom' | 'r_sfa'
  | 'd_pst' | 'd_ratio' | 'd_mp' | 's_shaft'
  | 'b_sets' | 'b_all' | 'b_one' | 'b_up' | 'b_amax'
  | 's_force' | 's_uplift';

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
