// Types of the shaft module. Plan coordinates in millimetres: origin at the inner corner of the shaft on the landing
// side, on the left as seen from the landing; x along the landing wall, y into the shaft.
import type { CheckStatus } from '../calc/types';
import type { Allowance } from './norme';

/** Landing and car doors: telescopic side opening with 2 panels, or centre opening with 2 panels. */
export type DoorKind = 'T2' | 'C2';
/** Counterweight behind the car, or at its left or right (as seen from the landing). */
export type CwSide = 'rear' | 'left' | 'right';
/** Accessibility required by DM 236/1989, 8.1.12, or none. */
export type Access = 'none' | 'dm236_existing' | 'dm236_residential' | 'dm236_public';

export type ShaftInputs = {
  /** clear width of the shaft along the landing wall [mm] */
  W: number;
  /** clear depth of the shaft [mm] */
  D: number;
  /** rated load [kg]; null: the largest car that fits and the load it needs */
  Q: number | null;
  door: DoorKind;
  /** clear width of the doors [mm] */
  doorWidth: number;
  cw: CwSide;
  access: Access;
} & Record<Allowance, number>;

export type ShaftCheckId = 'v_fit' | 'v_area' | 'v_acc_car' | 'v_acc_door' | 'v_acc_side' | 'v_door' | 'v_wall' | 'v_sill' | 'v_cw' | 'v_cwlen';

export interface ShaftCheck {
  id: ShaftCheckId;
  status: CheckStatus;
  value: number | null;
  limit: number | null;
  /** decimals shown */
  dec: number;
  unit: 'mm' | 'm²' | '';
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Rail {
  /** tip of the blade, toward the guided part */
  x: number;
  y: number;
  /** direction the blade points to */
  dir: 'left' | 'right' | 'front' | 'back';
  /** the car's rails are larger than the counterweight's */
  size: 'car' | 'cw';
  /** the bracket runs from the rail along this axis to the wall at this coordinate */
  bracketAxis: 'x' | 'y';
  bracketTo: number;
}

export interface DoorLayout {
  kind: DoorKind;
  /** clear width [mm] */
  width: number;
  /** clear opening along x */
  x0: number;
  x1: number;
  /** landing door frame along the landing wall, panels stacked */
  frame0: number;
  frame1: number;
  /** side where the panels stack (T2) */
  stack: 'left' | 'right' | 'both';
}

export interface Layout {
  inputs: ShaftInputs;
  /** a car of the smallest admissible size fits in the shaft */
  fits: boolean;
  /** car inside: width along the landing wall and depth [mm] */
  A: number;
  B: number;
  /** A × B [m²] */
  area: number;
  /** rated load used [kg]: given, or the smallest that admits the area */
  Q: number;
  Qgiven: boolean;
  /** maximum available car area for Q [m²] */
  areaMax: number;
  persons: number;
  /** largest car inside the shaft could hold [mm] */
  maxA: number;
  maxB: number;
  /** smallest admissible car [mm] */
  minA: number;
  minB: number;
  car: Rect;
  carInner: Rect;
  door: DoorLayout;
  cw: Rect;
  rails: Rail[];
  checks: ShaftCheck[];
}
