// The types of the one form's derivation (derive.ts): what is entered, what the software fills in and what it derives
// from them. Pure types.
import type { FormValues } from '@/calc/types';
import type { HebTaken, Layout, ShaftCheck, ShaftInputs } from '@/shaft';
import type { MachineSpec } from '@/shaft/machine-room';
import type { Analysis } from '@/lib/present/analysis';
import type { SimModel } from '@/sim';
import type { CatalogFit } from '@/lib/catalog/machines';
import type { BottomScheme } from './bottom';
import type { CatalogChoice } from './catalog';
import type { Collaudo } from './collaudo';
import type { Drawn } from './drawn';

/** Values the software fills in (true) or takes as entered (false). */
export interface AutoFlags {
  P: boolean;
  machine: boolean;
  L0: boolean;
  dx: boolean;
  Hv: boolean;
  /** the control panel's wall and place in the machine room (registry locale.quadro.posto); missing: as entered (the
   *  records before it) */
  panel?: boolean;
}

/** The one form of an installation: the shaft (plan, floors, machine room), the calculator's values, the switches. */
export interface LiftInputs {
  shaft: ShaftInputs;
  calc: FormValues;
  auto: AutoFlags;
  /** the rope scheme of a machine below (bottom.ts); missing: pulleys under the shaft's slab */
  bottom?: BottomScheme;
  /** the maker (and model) the proposal takes the machine from (catalog.ts); missing: the calculation grid */
  catalog?: CatalogChoice;
  /** the acceptance test's standard and what the intervention replaces (collaudo.ts); missing: by the intervention */
  collaudo?: Collaudo;
}

export type Origin = 'entered' | 'auto' | 'estimate';
export type DerivedKey = 'Q' | 'v' | 'H' | 'P' | 'L0' | 'dx' | 'Hv' | 'machine' | 'panel';
/** What the plan cannot give or contradicts: the diverting pulley's distance, a direct pull's falls (calata), a pulley
 *  the h entered by hand puts under the room's floor (rinvio: it stays in the room). */
export type IssueKey = DerivedKey | 'calata' | 'rinvio';

export interface LiftDerived {
  shaft: ShaftInputs;
  /** the calculator's values, complete: what the calculation record stores */
  values: FormValues;
  layout: Layout;
  analysis: Analysis;
  origin: Readonly<Record<DerivedKey, Origin>>;
  /** the sizing found no machine: the one entered is checked instead */
  noProposal: boolean;
  /** automatic values the plan cannot give (the pulleys do not fit as a simple bend between the rope drops), and a direct
   *  pull whose falls in the plan are not the sheave's diameter apart */
  issues: readonly IssueKey[];
  /** direct pull (no diverting pulley): the spacing of the falls in the plan, which the sheave's pitch diameter must
   *  equal [mm]; null with a diverting pulley or the machine below */
  calata: number | null;
  /** where the diverting pulley stands where it may not (the issue 'rinvio'): under the room's floor, or up into the
   *  machine over the bedplate's top (rinvio.ts rinvioClash) */
  rinvioClash: 'floor' | 'machine' | null;
  machine: MachineSpec;
  /** the checks of the machine's support in the room (the beams under it), at the load sheet 1 counts */
  supportChecks: readonly ShaftCheck[];
  /** the HEB beams on the shaft's walls (heb.ts): the six weighed, the one taken (the shaft's room names it), and
   *  whether its profile and its direction are the software's; null without them */
  heb: HebTaken | null;
  /** the rope scheme of a machine below; null with the machine above */
  bottom: BottomScheme | null;
  /** its runs to the machine do not clear the counterweight and its brackets: the gap behind the counterweight as
   *  designed and the least that clears them (null: none up to 1,5 m more) [mm]; null when they clear */
  bottomGap: { now: number; need: number | null } | null;
  /** the head pulleys of the scheme (the calculation counts two of them for the bottom layout) */
  headPulleys: number;
  /** what the rig hangs over the car roof (the pulleys hung under the slab) reaches into the refuge's height: the
   *  headroom as designed and the least that clears it [mm] (head.ts refugeHeadroom); null when nothing does */
  refugeHead: { now: number; need: number } | null;
  /** the proposal from a catalogue: the maker's machine taken, or none of the choice taken (the grid's proposal) — none
   *  passing the checks, or with the sheave through the wall none of the choice a long-shaft or outboard-support variant
   *  (`wall`: a standard model named, or a maker without them) */
  catalog: { fit: CatalogFit | null; miss: false | 'checks' | 'wall' } | null;
  /** the standard the lift is tested to and what the intervention replaces: which checks apply (collaudo.ts) */
  collaudo: Collaudo;
  /** what the shaft design gives for the rope beyond the travel and a machine below's Hv entered by hand (null: taken
   *  from it, or no Hv); an entered value it contradicts is an issue (drawn.ts) */
  drawn: Drawn;
  sim: SimModel;
}
