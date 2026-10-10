// The linings (imbotti) of the landing doors' openings: where a new door with a smaller clear opening goes into an old
// opening between the marbles, sheet-metal linings fill the rest of it — beside the portal (or the door's own frame,
// frame.ts), left and right as seen from the landing, and over its head. The same at every landing door (registry
// porte.imbotti). Along the door's wall the plan's own coordinate (u); heights from the landing floor. Pure.
import { lowIsLeft } from './callstation';
import { portalOf } from './frame';
import type { DoorLayout, Imbotti, ShaftInputs } from './types';

export const NO_IMBOTTI: Imbotti = { left: 0, right: 0, top: 0 };

export const imbottiOf = (I: ShaftInputs): Imbotti => I.imbotti ?? NO_IMBOTTI;

export function hasImbotti(I: ShaftInputs): boolean {
  const m = imbottiOf(I);
  return m.left > 0 || m.right > 0 || m.top > 0;
}

/** The opening between the marbles at a landing door: along its wall from u0 to u1, its height over the landing floor,
 *  and the side linings at lower and at higher u (which is left or right depends on the wall) [mm]. */
export function marbleOpening(I: ShaftInputs, d: DoorLayout): { u0: number; u1: number; h: number; low: number; high: number } {
  const m = imbottiOf(I), [low, high] = lowIsLeft(d.wall) ? [m.left, m.right] : [m.right, m.left], p = portalOf(I);
  return { u0: d.l0 - p.jamb - low, u1: d.l1 + p.jamb + high, h: d.height + p.head + m.top, low, high };
}

/** Distance between the marbles and height under the top marble of the landing doors [mm]. */
export const marbleWidth = (I: ShaftInputs): number => {
  const m = imbottiOf(I);
  return m.left + I.doorWidth + 2 * portalOf(I).jamb + m.right;
};
export const marbleHeight = (I: ShaftInputs): number => I.doorHeight + portalOf(I).head + imbottiOf(I).top;

/** The opening in the wall at a landing door, its height over the landing floor [mm]: between the marbles round the
 *  linings, the door's own frame's outside, or the door's clear height (the portal stands on the wall's face). */
export const wallOpeningHeight = (I: ShaftInputs): number => (hasImbotti(I) ? marbleHeight(I) : I.frame ? I.doorHeight + I.frame.head : I.doorHeight);

/** The linings for a distance between the marbles, shared by the two sides (the odd millimetre on the right). */
export function withMarbleWidth(I: ShaftInputs, w: number): ShaftInputs {
  const m = imbottiOf(I), rest = w - I.doorWidth - 2 * portalOf(I).jamb, left = Math.floor(rest / 2);
  return withImbotti(I, { ...m, left, right: rest - left });
}

/** The top lining for a height under the top marble. */
export const withMarbleHeight = (I: ShaftInputs, h: number): ShaftInputs => withImbotti(I, { ...imbottiOf(I), top: h - I.doorHeight - portalOf(I).head });

/** The inputs with these linings; none at all leaves the opening the portal's. */
export function withImbotti(I: ShaftInputs, m: Imbotti): ShaftInputs {
  const { imbotti: _drop, ...rest } = I;
  void _drop;
  return m.left === 0 && m.right === 0 && m.top === 0 ? rest : { ...rest, imbotti: m };
}
