// What the issue form says before a set is numbered: the machine the data of the installation name against the one the
// calculation checked (a contradiction stops the issue: drawing-actions.ts), the identity of the lift the title block
// would leave empty — the plant number of an existing lift, the client — and the data of the installation sheet 1 reads
// that nobody entered, which it prints as a dash or as the software's assumption (round 37; they stay optional, the
// issue stays allowed). Pure.
import type { Plant } from '../plant';
import { machineConflict, machineName } from './machine-name';

/** The data of the installation sheet 1 reads, in the order of their form. */
export type SheetPlantField = 'control' | 'shaft' | 'carFinish' | 'safetyGear' | 'liftUse' | 'governorLoad' | 'cwSafetyGear' | 'cwGearTrip'
  | 'currentIn' | 'currentStart' | 'voltage' | 'lightVoltage' | 'frequency' | 'duty' | 'machine' | 'massShell' | 'massFloor' | 'massDoors' | 'massFrame';

export interface IssueChecks {
  /** the name the data of the installation give the machine and the catalogue's machine of the calculation, when they
   *  contradict each other (the issue is refused) */
  machine: { named: string; catalog: string } | null;
  /** an existing lift without its plant number (the sheets write «DA COMUNICARE») */
  plantNumber: boolean;
  /** no client in the project (the title block writes a dash) */
  client: boolean;
  /** the data of the installation sheet 1 reads that are not entered */
  empty: SheetPlantField[];
}

/** The sheet 1 the set has: a whole design's (`whole`: also the shaft, the car finish, the currents and the parts of the
 *  car mass in its table of loads; the lift's use with the check of the car rails, `rails`) or a replacement's; with a
 *  machine under the pit (`underPit`) the counterweight's safety gear and what trips it. */
export interface IssueSheet {
  whole: boolean;
  rails?: boolean;
  underPit?: boolean;
}

const isBlank = (v: unknown): boolean => v === undefined || (typeof v === 'string' && v.trim() === '');

/** The data of the installation sheet 1 reads and nobody entered — printed as a dash, as «DA FORNITORE», as «DA
 *  INDICARE» or as the software's assumption —; the machine's name only for a machine off the catalogue (the
 *  catalogue's names it), what trips the counterweight's gear not with a pillar in its place. Not the bracket pitches:
 *  left empty they are the rule's (KV_VERT.bracketPitch), the design's value the plan, the 3D and the bill draw and
 *  count alike, not a gap. */
export function emptyPlant(plant: Plant, catalog: { brand: string; model: string } | null, sheet: IssueSheet): SheetPlantField[] {
  const whole = sheet.whole, cwGear = whole && !!sheet.underPit;
  const read: readonly (SheetPlantField | false)[] = [
    'control', whole && 'shaft', whole && 'carFinish', 'safetyGear', whole && !!sheet.rails && 'liftUse', 'governorLoad',
    cwGear && 'cwSafetyGear', cwGear && plant.cwSafetyGear !== 'pillar' && 'cwGearTrip',
    whole && 'currentIn', whole && 'currentStart', 'voltage', 'lightVoltage', 'frequency', 'duty',
    // the optional ones: the name of a machine off the catalogue, the parts of the car mass (a dash each in the loads)
    !catalog && 'machine', whole && 'massShell', whole && 'massFloor', whole && 'massDoors', whole && 'massFrame',
  ];
  return read.filter((k): k is SheetPlantField => k !== false && isBlank(plant[k]));
}

export function issueChecks(plant: Plant, catalog: { brand: string; model: string } | null, project: { plantNumber: string | null; client: string | null },
  existing: boolean, sheet: IssueSheet): IssueChecks {
  return {
    machine: machineConflict(plant, catalog) ? { named: plant.machine?.trim() ?? '', catalog: machineName({}, catalog) } : null,
    plantNumber: existing && !project.plantNumber?.trim(),
    client: !project.client?.trim(),
    empty: emptyPlant(plant, catalog, sheet),
  };
}
