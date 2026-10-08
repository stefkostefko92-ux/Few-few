// Loads on the building for the data sheet and the drawings (P1…P9, daN; not simultaneous): the machine on its
// supports with the dynamic coefficient (a machine below: the head pulleys, the machine off the slab), the rope hitches
// of a 2:1 installation, the governor, the rails and the buffers on the pit floor, the whole on the slab. Registry: carichi.fossa, carichi.macchina (src/shaft/norme-vert.ts).
import { KV_VERT } from '@/shaft/norme-vert';
import { axisStatic } from '@/lib/lift/support';
import { impactFactor, type SafetyGear } from './forces';

const G = 9.81;
const daN = (kg: number): number => (kg * G) / 10;

export interface LoadsInput {
  /** car, rated load, counterweight, ropes, travelling cables, machine with bedframe [kg] */
  P: number;
  Q: number;
  Mcw: number;
  ropes: number;
  cables: number;
  machine: number;
  roping: number;
  /** rails: mass per metre [kg/m] and length [m] */
  carRailQ: number;
  carRailLen: number;
  cwRailQ: number;
  cwRailLen: number;
  safetyGear: SafetyGear;
  /** dynamic coefficient on the machine's static load */
  dyn: number;
  carBuffers: number;
  cwBuffers: number;
  /** load of the governor given by the installer [daN] */
  governor: number | null;
  /** a machine below: the static load on the head pulleys [kg] (support.ts headStatic), which P1 then is; the machine
   *  does not stand on the slab */
  below?: number | null;
}

export interface Loads {
  /** static load on the machine's axis (a machine below: on the head pulleys) [kg], with the dynamic coefficient [kg] */
  static: number;
  dynamic: number;
  /** daN; null where the installation has none */
  P: readonly (number | null)[];
}

export function loads(x: LoadsInput): Loads {
  const r = x.roping > 1 ? 2 : 1, dyn = x.dyn;
  const stat = x.below ?? axisStatic(x), dynamic = stat * dyn;
  const k1 = impactFactor(x.safetyGear);
  const P1 = daN(dynamic);
  const P2 = r === 2 ? daN(((x.P + x.Q) / 2) * dyn) : null;
  const P3 = r === 2 ? daN((x.Mcw / 2) * dyn) : null;
  // P with the travelling cables the car carries, as on the machine's axis (UNI EN 81-20:2020, 5.2.1.8.5)
  const Pc = x.P + x.cables;
  const P5 = daN((k1 * (Pc + x.Q)) / 2 + x.carRailQ * x.carRailLen);
  const P6 = daN((KV_VERT.bufferFactor * (Pc + x.Q)) / Math.max(1, x.carBuffers));
  const P7 = daN(x.cwRailQ * x.cwRailLen);
  const P8 = daN((KV_VERT.bufferFactor * x.Mcw) / Math.max(1, x.cwBuffers));
  const P9 = P1 + (P2 ?? 0) + (P3 ?? 0) + (x.below != null ? 0 : daN(x.machine));
  return { static: stat, dynamic, P: [P1, P2, P3, x.governor, P5, P6, P7, P8, P9] };
}

/** What P1 … P9 are, as sheet 1 names them (where each acts): the machine on its support — the head pulleys when the
 *  machine stands below —, the hitches of the ropes of a 2:1 installation, the governor, the rails and the buffers on
 *  the pit floor, the whole on the slab. */
export const loadNames = (below = false): readonly string[] => [
  below ? 'PULEGGE IN TESTATA' : 'ARGANO', 'ATTACCO FUNI CABINA', 'ATTACCO FUNI CONTRAPPESO', 'LIMITATORE', 'GUIDE CABINA',
  'AMMORTIZZATORI CABINA', 'GUIDE CONTRAPPESO', 'AMMORTIZZATORE CONTRAPPESO', 'TOTALE SULLA SOLETTA',
];

/** P4 without the governor's load in the data of the installation: its maker gives it (the governor's mass and the pull
 *  of its rope when tripped). */
export const GOVERNOR_LOAD_UNSET = 'DA FORNITORE';
