// The numbers of the RT after the owner's model (round 52) that no other registry holds (KR2), each with its entry in
// VOCI_RT2 (norme-voci.ts) whose text states it (rt2-norme.test.ts). The numbers of the standards the engines already
// hold stay in their registries and are reused by name (K of the calculation, KV_* of the shaft, KR of the first RT).
// Some are the model's own choices, kept where they are on the safe side of the standard (status 'prassi'); clause
// numbers and values only, never a text of a standard. Pure.
import type { Stato } from '@/calc/norme';

export const KR2 = {
  // the model's «a» of D.1 by the rated speed's band [m/s, m/s²] (its reading of C1's minima as decelerations: C1 =
  // (g + a)/(g − a) comes out above the minimum of UNI 10411-1:2024 D.1 in every band — kept, on the safe side), and
  // with the reduced deceleration chosen 0,5 m/s² — never under C1's minimum (correction); over the last band the
  // calculation's braking deceleration (correction: the model took 0,5 there too)
  d1Bande: [[0.63, 1.1], [1.0, 1.15], [1.6, 1.2], [2.5, 1.25]] as const,
  d1Ridotta: 0.5,
  // the model's limit of the specific pressure: (12,5 + 4·v_c)/(1 + v_c) of D.2 times this factor (stricter by 1,9 %,
  // kept and printed in the formula)
  pressioneFattore: 0.981,
  // the travelling cable's mass per metre the model takes, on half the travel [kg/m] (the model adds it without g:
  // corrected)
  caviMassa: 0.8,
  // compensation ropes on their tensioner pulley: D/d at least this (the model's; UNI EN 81-20:2020, 5.5.6.2 c))
  compDd: 30,
} as const;
export type CostanteRt2 = keyof typeof KR2;

export interface VoceRt2 {
  id: string;
  /** the component or page it belongs to («funi», «generale»…) */
  area: string;
  titolo: string;
  valore: string;
  riferimento: string;
  fonte: string;
  stato: Stato;
  /** the constants of this registry (KR2) or of an area's own registry (norme-<area>.ts) the entry states */
  costanti?: readonly string[];
  /** the ids of the checks (VerificaRt2.id) the entry describes */
  verifiche?: readonly string[];
  nota?: string;
}
