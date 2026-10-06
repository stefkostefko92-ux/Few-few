// Types of the shaft module. Plan coordinates in millimetres: origin at the inner corner of the shaft on the main
// landing side (entrance A), on the left as seen from that landing; x along the front wall, y into the shaft.
import type { CwChoice, DoorPairId } from './staffe-ids';
import type { CheckStatus } from '../calc/types';
import type { Allowance } from './norme';
import type { RailType } from './rails';
import type { VerticalInputs } from './vertical';
import type { RoomInputs } from './room';

/** Landing and car doors: telescopic side opening with 2 panels, or centre opening with 2 panels. */
export type DoorKind = 'T2' | 'C2';
/** Counterweight behind the car, or at its left or right (as seen from the main landing). */
export type CwSide = 'rear' | 'left' | 'right';
/** Accessibility required by DM 236/1989, 8.1.12, or none. */
export type Access = 'none' | 'dm236_existing' | 'dm236_residential' | 'dm236_public';
/** One entrance (A, front wall); two opposite (A front, B rear); two adjacent at 90° (A front, B on a side wall). */
export type Entrances = 'one' | 'opposite' | 'adjacent';
/** Walls of the shaft. */
export type Wall = 'front' | 'rear' | 'left' | 'right';

/** Distances of the plan set by hand: each replaces what the layout works out [mm]. */
export interface PlanFix {
  /** car inside: width along the front wall and depth */
  A?: number;
  B?: number;
  /** the platform's side from the left wall */
  carX?: number;
  /** clear opening of the car door of entrance A, of entrance B, from the corner of its wall where its axis starts */
  doorA?: number;
  doorB?: number;
  /** clear opening of the landing door of entrance A, of entrance B, the same way and the same at every floor (absent:
   *  in line with the car door) */
  landA?: number;
  landB?: number;
  /** length of the car door operator */
  opLen?: number;
  /** central sling: the car rails' axis from the front wall; cantilever: the tip of the front car rail */
  railY?: number;
  /** cantilever sling: between the tips of the two car rails */
  dbg?: number;
  /** counterweight: its length in plan and where it starts along the wall it stands by (x at the back, y on a side) */
  cwLen?: number;
  cwPos?: number;
  /** car buffers (pit.ts): the middle between the outer ones from the left wall, their line from the front wall, and
   *  between the axes of the outer ones across the car (two or more) */
  bufX?: number;
  bufY?: number;
  bufSpan?: number;
  /** the counterweight's buffer along the wall the counterweight stands by (x at the back, y on a side) */
  cwBufPos?: number;
}

export type PlanKey = keyof PlanFix;

/** What a niche in a shaft wall holds: the counterweight, which runs in it; the shaft lighting, a recess at each lamp;
 *  the cable trunking, a chase from the pit floor to the slab. */
export type NicheUse = 'cw' | 'light' | 'duct';

/** A niche in a wall of the shaft [mm]. */
export interface Niche {
  use: NicheUse;
  wall: Wall;
  /** where it starts along the wall's axis (x on the front and rear walls, y on the side ones), its width along it */
  at: number;
  width: number;
  /** into the wall from its inner face */
  depth: number;
}

/** The landing call station of every landing door: beside the door on the landing, on the side seen from the
 *  landing; from the door's opening in the wall (its portal) to the middle of the panel, and the buttons' middle over
 *  the landing floor [mm]. */
export interface CallStation {
  side: 'left' | 'right';
  offset: number;
  height: number;
}

/** Linings of the landing doors' openings (imbotti) where a new door with a smaller clear opening goes into an old
 *  opening between the marbles: the side ones beside the portal, left and right as seen from the landing, and the top
 *  one over the portal's head; the same at every landing door [mm]. */
export interface Imbotti {
  left: number;
  right: number;
  top: number;
}

/** The landing doors' own frame (telaio di piano), the same at every landing door: its jambs' width beside the clear
 *  opening, its header's height over it (between the jambs) and its depth from the landing face of the wall [mm]. */
export interface DoorFrame {
  jamb: number;
  head: number;
  depth: number;
}

/** The inner faces of the shaft at the top floor and in the headroom, where an old building may have them elsewhere
 *  than at the main floor: how far each stands in from the main floor's (negative: further out) [mm]. The car, its
 *  rails and the counterweight run plumb; the landing door of the top floor stays in line with the car. */
export interface HeadWalls {
  front: number;
  rear: number;
  left: number;
  right: number;
}

export type ShaftInputs = {
  /** clear width of the shaft along the front wall [mm] */
  W: number;
  /** clear depth of the shaft [mm] */
  D: number;
  /** rated load [kg]; null: the largest car that fits and the load it needs */
  Q: number | null;
  door: DoorKind;
  /** clear width and height of the doors [mm] */
  doorWidth: number;
  doorHeight: number;
  cw: CwSide;
  access: Access;
  entrances: Entrances;
  /** side wall of the second entrance of an adjacent car */
  side2: 'left' | 'right';
  carRail: RailType;
  cwRail: RailType;
  /** walls around the shaft as drawn [mm] */
  wall: number;
  vertical: VerticalInputs;
  /** machine room above the shaft; null: not drawn */
  room: RoomInputs | null;
  /** distances of the plan set by hand (absent: all worked out) */
  plan?: PlanFix;
  /** niches in the walls (absent: none) */
  niches?: Niche[];
  /** landing call stations (absent: the typical place) */
  callStation?: CallStation;
  /** brackets of the counterweight rails: Panev's supports SU/SD with the SG (absent), or generic ones */
  cwBrackets?: 'panev' | 'generic';
  /** Panev's articles chosen by hand (staffe-ids.ts): the landing doors' pair A + B, the counterweight rails' support;
   *  absent: the software's choice */
  panev?: { door?: DoorPairId; cw?: CwChoice };
  /** the car door operator's supplier (its catalogue's length); missing: the longest of the catalogues */
  doorMaker?: 'generic' | '2sg' | 'fermator' | 'dapa';
  /** the overspeed governor's model (governor.ts); missing: by the rated speed */
  governor?: string;
  /** the walls at the top floor and in the headroom (head.ts); missing: as at the main floor */
  head?: HeadWalls;
  /** linings of the landing doors' openings (imbotti.ts); missing: none, the opening is the portal's */
  imbotti?: Imbotti;
  /** the landing doors' own frame (frame.ts); missing: the portal round the clear opening */
  frame?: DoorFrame;
} & Record<Allowance, number>;

export type ShaftCheckId =
  | 'v_fit' | 'v_area' | 'v_acc_car' | 'v_acc_door' | 'v_acc_side' | 'v_door' | 'v_door2' | 'v_land' | 'v_land2' | 'v_op' | 'v_wall' | 'v_sill' | 'v_cw' | 'v_cwlen'
  | 'v_place' | 'v_doorcar' | 'v_buffer' | 'v_niche' | 'v_staffa' | 'v_telaio' | 'v_head'
  | 'h_refuge' | 'h_clear' | 'h_top' | 'h_parapet' | 'h_stand' | 'h_door' | 'h_staffe' | 'h_car' | 'h_cw' | 'h_guide' | 'p_refuge' | 'p_apron' | 'p_screen'
  | 'b_runby' | 'b_type' | 'b_car' | 'b_cw' | 'm_height' | 'm_panel' | 'm_door'
  | 'm_beam' | 'm_beamf' | 'm_rinvio' | 'm_fit' | 'm_stand' | 'm_free' | 'm_calata'
  | 'gr_stress' | 'gr_flange' | 'gr_defl' | 'sg_type';

export interface ShaftCheck {
  id: ShaftCheckId;
  status: CheckStatus;
  value: number | null;
  limit: number | null;
  /** decimals shown */
  dec: number;
  unit: 'mm' | 'm²' | 'm/s' | 'MPa' | '';
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
  kind: 'car' | 'cw';
  /** the bracket runs from the foot of the rail along this axis to the wall (or support) at this coordinate */
  bracketAxis: 'x' | 'y';
  bracketTo: number;
}

export interface DoorLayout {
  /** entrance A (front wall) or B (the second one) */
  side: 'A' | 'B';
  wall: Wall;
  kind: DoorKind;
  /** clear width and height [mm] */
  width: number;
  height: number;
  /** clear opening of the car door along the wall (x on front and rear walls, y on side walls) */
  u0: number;
  u1: number;
  /** clear opening of the landing door along the wall: the car door's, or where the plan sets it apart */
  l0: number;
  l1: number;
  /** landing door frame along the wall, panels stacked */
  frame0: number;
  frame1: number;
  /** side where the panels stack, toward lower or higher u (T2) */
  stack: 'low' | 'high' | 'both';
  /** car door operator along the wall */
  op0: number;
  op1: number;
}

export interface CarFrame {
  /** central sling: the two car rails face each other across x, on the side walls; cantilever (arcata a zaino):
   *  both rails on the wall opposite the side entrance, the counterweight between them */
  kind: 'central' | 'cantilever';
  /** central: y of the rails' axis; cantilever: x of the line of the blade tips */
  axis: number;
  /** central: distance between the blade tips; cantilever: distance between the two rails along the wall [mm] */
  dbg: number;
}

export interface Layout {
  inputs: ShaftInputs;
  /** the pitch of the car's and of the counterweight's rail brackets the data of the installation declare [mm];
   *  absent: the rule's (KV_VERT.bracketPitch). Sheet 1, the plan's codes, the lists of articles and the 3D count with
   *  it (brackets.ts `withPitches`). */
  carBracketPitch?: number;
  cwBracketPitch?: number;
  /** a car of the smallest admissible size fits in the shaft */
  fits: boolean;
  /** car inside: width along the front wall and depth [mm] */
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
  /** car outside (the platform) and inside */
  car: Rect;
  carInner: Rect;
  doors: DoorLayout[];
  frame: CarFrame;
  cw: Rect;
  /** where the counterweight went (never on a wall with a door) */
  cwSide: CwSide;
  /** side counterweight: the bracket spanning its two rails that carries the car rail on that side */
  bridge: { x: number; y0: number; y1: number } | null;
  /** distance between the counterweight rails' tips [mm] */
  cwDbg: number;
  rails: Rail[];
  checks: ShaftCheck[];
}
