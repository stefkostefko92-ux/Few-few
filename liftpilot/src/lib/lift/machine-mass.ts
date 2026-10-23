// The machine's mass as the loads on the building count it (registry impianto.massa.argano): a catalogue's mass is the
// whole machine for some makers, without flywheel and sheave or the gearbox alone for others (src/lib/catalog/
// machines.ts massKindOf); what it leaves out — the motor by its rated power, the sheave by its diameter and its
// grooves, the flywheel — is estimated, so that the slab, the beams and the comparison between makers count the same
// thing. The calculation keeps the catalogue's mass: a bottom machine's anchors take the lower bound. Pure.
import type { Machine } from '@/calc/types';
import { BRANDS, catalogOf, massKindOf, type MassKind } from '@/lib/catalog/machines';
import { KM } from './norme-masse';

export interface MachineMass {
  /** the whole machine [kg] */
  kg: number;
  /** what the calculation's mass is: the catalogue's of `kind`, or the whole machine (entered, or the generic one) */
  kind: MassKind;
  /** the parts estimated over it [kg]; all 0 when it is the whole machine */
  motor: number;
  sheave: number;
  flywheel: number;
  /** some part is estimated */
  estimate: boolean;
}

/** An IEC 4-pole cast-iron motor of `kW` [kg]: the next row of the table up, past its end in proportion. */
export function motorKg(kW: number): number {
  const row = KM.motorKg.find(([p]) => p >= kW - 1e-9), last = KM.motorKg[KM.motorKg.length - 1];
  return row ? row[1] : Math.ceil((last[1] * kW) / last[0]);
}

/** A cast-iron sheave of pitch diameter D with n grooves for ropes of diameter d [kg]. */
export function sheaveKg(D: number, n: number, d: number): number {
  const pitch = KM.groovePitch.find(([upTo]) => d <= upTo)?.[1] ?? Math.ceil(1.35 * d);
  return Math.ceil(KM.sheaveKgMm2 * D * Math.max(KM.sheaveWidthMin, n * pitch + KM.sheaveRims));
}

/** The machine `N` of the calculation; `made` the maker's model it is (null: the generic machine, or none named). The
 *  catalogue's parts are added only when the calculation's mass is the catalogue's: one entered by hand is the whole
 *  machine. */
export function machineMass(N: Machine, made: { brand: string; model: string } | null): MachineMass {
  const brand = BRANDS.find((b) => b === made?.brand), c = made && brand ? catalogOf(brand, made.model)[0] ?? null : null;
  const kind: MassKind = c && c.mass !== null && Math.abs(c.mass - N.mass) < 0.5 ? massKindOf(c) : 'totale';
  const motor = kind === 'riduttore' ? motorKg(N.Pn) : 0, sheave = kind === 'totale' ? 0 : sheaveKg(N.D, N.n, N.d);
  const flywheel = kind === 'riduttore' || kind === 'senza_volano_puleggia' ? KM.flywheelKg : 0;
  return { kg: N.mass + motor + sheave + flywheel, kind, motor, sheave, flywheel, estimate: motor + sheave + flywheel > 0 };
}
