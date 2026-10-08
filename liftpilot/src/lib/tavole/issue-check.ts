// What the issue form says before a set is numbered: the machine the data of the installation name against the one the
// calculation checked (a contradiction stops the issue: drawing-actions.ts), and the identity of the lift the title block
// would leave empty — the plant number of an existing lift, the client. Pure.
import type { Plant } from '../plant';
import { machineConflict, machineName } from './machine-name';

export interface IssueChecks {
  /** the name the data of the installation give the machine and the catalogue's machine of the calculation, when they
   *  contradict each other (the issue is refused) */
  machine: { named: string; catalog: string } | null;
  /** an existing lift without its plant number (the sheets write «DA COMUNICARE») */
  plantNumber: boolean;
  /** no client in the project (the title block writes a dash) */
  client: boolean;
}

export function issueChecks(plant: Plant, catalog: { brand: string; model: string } | null, project: { plantNumber: string | null; client: string | null },
  existing: boolean): IssueChecks {
  return {
    machine: machineConflict(plant, catalog) ? { named: plant.machine?.trim() ?? '', catalog: machineName({}, catalog) } : null,
    plantNumber: existing && !project.plantNumber?.trim(),
    client: !project.client?.trim(),
  };
}
