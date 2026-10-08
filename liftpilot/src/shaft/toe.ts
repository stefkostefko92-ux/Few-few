// The plate under each landing sill (UNI EN 81-20:2020, 5.2.5.3.2; registry porte.sottosoglia): a smooth surface joined to
// the sill's edge toward the car, from the landing level down as far as the unlocking zone the door supplier gives (over
// and under the landing) + 50 mm — while none is entered, the most the standard allows, with a warning —, as wide as
// the car's clear entrance + 25 mm each side, then a bevel at 60° back to the wall. Section A-A draws it under every
// landing sill it cuts and the detail of the car at a floor dimensions it; the list of articles counts one per landing
// door. Pure.
import { path, type Entity, type Pt } from '../drawing';
import { KV_VERT } from './norme-vert';
import { SILL_H } from './sill';
import type { ShaftInputs } from './types';

export interface Toe {
  /** from the landing level down to the plate's lower edge [mm] */
  h: number;
  /** the unlocking zone it is made for, and whether the design gives it */
  zone: number;
  entered: boolean;
  /** the bevel's drop from the plate's lower edge back to the wall at 60°: its horizontal projection is the sill's depth
   *  from the wall (at least the 20 mm of 5.2.5.3.2 d) at every usual depth) [mm] */
  bevel: number;
}

/** The plate under the landing sills of a design. */
export function toeOf(I: ShaftInputs): Toe {
  const K = KV_VERT, entered = I.vertical.unlockZone !== undefined, zone = I.vertical.unlockZone ?? K.unlockMax;
  return { h: zone + K.toeOver, zone, entered, bevel: I.landingDepth * Math.tan((K.toeBevelAngle * Math.PI) / 180) };
}

/** Its width along the wall: the car's clear entrance and 25 mm each side [mm]. */
export const toeWidth = (doorWidth: number): number => doorWidth + 2 * KV_VERT.toeSide;

/** The plate in section under the sill of the landing at zf, its sill's edge `depth` from the wall's face: the sheet down
 *  the sill's edge, then the bevel to the wall; `P` maps (v from the wall's face into the shaft, z). */
export function toeSection(I: ShaftInputs, zf: number, P: (v: number, z: number) => Pt): Entity[] {
  const t = toeOf(I), dl = I.landingDepth, s = 3, z0 = zf - t.h, z1 = z0 - t.bevel;
  return [path([P(dl - s, zf - SILL_H), P(dl, zf - SILL_H), P(dl, z0), P(0, z1), P(0, z1 + s * 2), P(dl - s, z0 + s * 0.6)], true, 'thin', 'zinc')];
}
