// The counterweight's safety gear over a space people reach under the shaft (UNI EN 81-20:2020, 5.2.5.4; registry
// paracadute.contrappeso): a machine under the pit makes one, so sheet 1 writes the gear and what trips it as the data of
// the installation give them, loads the counterweight rails with its operation (P7, loads.ts) and checks it (sg_cw) —
// failing until both are given. In a modification an existing pillar to the ground may stand in its place
// (UNI 10411-1:2024, 6.14). What trips the gear (cwTripOf) gives sheet 1 the counterweight's own governor and the bill
// its parts (src/lib/prices/bom-parts.ts). Pure.
import { check } from '@/shaft/checks';
import { KV_VERT } from '@/shaft/norme-vert';
import type { ShaftCheck } from '@/shaft/types';
import type { Plant } from '../plant';
import type { SafetyGear } from './forces';

const GEAR: Readonly<Record<NonNullable<Plant['cwSafetyGear']>, string>> = {
  progressive: 'PROGRESSIVO', roller: 'ISTANTANEO A RULLI', instantaneous: 'ISTANTANEO', pillar: 'PILASTRO ESISTENTE FINO AL TERRENO',
};
const TRIP: Readonly<Record<NonNullable<Plant['cwGearTrip']>, string>> = {
  governor: 'DA LIMITATORE', rupture: 'PER ROTTURA SOSPENSIONE', rope: 'DA FUNE DI SICUREZZA',
};

/** The gear whose operation loads the counterweight rails (P7): the one given, else a progressive one; none without a
 *  space under the shaft or with a pillar in its place. */
export const cwGearOf = (under: boolean, Pl: Plant): SafetyGear | null => (!under || Pl.cwSafetyGear === 'pillar' ? null : Pl.cwSafetyGear ?? 'progressive');

/** What trips that gear as the data of the installation give it (null without a gear, or while it is not given): its
 *  own governor with its rope and tension weight (UNI EN 81-20:2020, 5.6.2.2.1 — the car's governor rope is clamped to
 *  the car, so a second one), the breakage of the suspension (5.6.2.2.2) or a safety rope (5.6.2.2.3). Sheet 1 writes
 *  the counterweight's governor and the bill counts the parts from this one place. */
export const cwTripOf = (under: boolean, Pl: Plant): NonNullable<Plant['cwGearTrip']> | null => (cwGearOf(under, Pl) ? Pl.cwGearTrip ?? null : null);

/** The data with the counterweight's gear `g` chosen in their form: a pillar in its place takes away what tripped a gear
 *  (nothing trips a pillar: no stale choice kept behind the disabled field); a gear keeps it. */
export const cwGearPicked = (Pl: Plant, g: Plant['cwSafetyGear']): Plant =>
  g === 'pillar' ? { ...Pl, cwSafetyGear: g, cwGearTrip: undefined } : { ...Pl, cwSafetyGear: g };

/** Sheet 1's row of the counterweight's safety gear: the gear and what trips it, or that they are to be given. */
export function cwGearRow(Pl: Plant): string {
  const g = Pl.cwSafetyGear, t = Pl.cwGearTrip;
  if (g === 'pillar') return GEAR.pillar;
  return g && t ? `${GEAR[g]} ${TRIP[t]}` : 'OBBLIGATORIO, DA INDICARE (5.2.5.4)';
}

/** The check sg_cw with a space under the shaft (`under`): the gear and what trips it given; instantaneous, or tripped
 *  otherwise than by a governor, only up to KV_VERT.cwGearInstantV; a pillar in its place only in a modification. */
export function cwGearChecks(under: boolean, Pl: Plant, v: number, modification: boolean): ShaftCheck[] {
  if (!under) return [];
  const g = Pl.cwSafetyGear, t = Pl.cwGearTrip, lim = KV_VERT.cwGearInstantV;
  if (g === 'pillar') return [check('sg_cw', modification, null, null, 0, '')];
  if (!g || !t) return [check('sg_cw', false, null, null, 0, '')];
  const slow = g !== 'progressive' || t !== 'governor';
  return [check('sg_cw', !slow || v <= lim + 1e-9, v, slow ? lim : null, 2, 'm/s')];
}
