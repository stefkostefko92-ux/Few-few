// A machine below pulls its anchors up (registry albero.sollevamento): the net pull at the test with 1,25·Q (the
// calculation's uplift) and with the rated load times the dynamic coefficient of the loads on the building (registry
// carichi.macchina), each less the machine's mass, which is never multiplied (on the safe side). The anchor bolts and
// the chemical anchors take the larger. Pure.
import type { ShaftResult } from '@/calc/types';
import { KV_VERT } from '@/shaft/norme-vert';

export interface AnchorPull {
  /** at the test with 1,25·Q, static [kg] */
  test: number;
  /** with the rated load times the dynamic coefficient [kg] */
  dyn: number;
  /** the larger of the two [kg] */
  max: number;
  /** the dynamic coefficient taken */
  factor: number;
}

/** The pulls on a bottom machine's anchors for the machine of `mass` [kg]; null when the ropes pull the sheave down. */
export function anchorPull(sh: ShaftResult, mass: number, factor: number = KV_VERT.dynFactor): AnchorPull | null {
  if (!sh.up) return null;
  const test = sh.testKg - mass, dyn = factor * sh.ratedKg - mass;
  return { test, dyn, max: Math.max(test, dyn), factor };
}
