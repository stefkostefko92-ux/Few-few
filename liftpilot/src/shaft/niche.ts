// Niches in the walls of the shaft, as an existing shaft often has them: one the counterweight runs in (the car
// gains its depth), a recess at each lamp of the shaft lighting, a chase for the cable trunking from the pit floor to
// the slab. Along each wall u is the wall's axis (x on the front and rear walls, y on the side ones), as in types.ts;
// the depth goes into the wall from its inner face. Pure.
import { KV } from './norme';
import type { Section } from './section';
import type { CwSide, DoorLayout, Niche, ShaftInputs, Wall } from './types';

/** Length of a wall's axis. */
export const wallLength = (I: ShaftInputs, w: Wall): number => (w === 'front' || w === 'rear' ? I.W : I.D);

export const nichesOf = (I: ShaftInputs): readonly Niche[] => I.niches ?? [];

/** The niche the counterweight runs in: the first one for it on the wall it stands by. */
export const cwNiche = (I: ShaftInputs, side: CwSide): Niche | null => nichesOf(I).find((n) => n.use === 'cw' && n.wall === side) ?? null;

/** The niches that go from the pit floor to the slab (counterweight, trunking): the wall is thinner there at every level. */
export const chasesOn = (I: ShaftInputs, w: Wall): Niche[] => nichesOf(I).filter((n) => n.wall === w && n.use !== 'light');

/** Bottoms of the shaft's lamps of height h: 1500 mm over each floor, the top one 80 mm under the slab. */
export function lampHeights(S: Section, h: number): number[] {
  const top = S.ceiling - KV.lampUnderSlab - h;
  return [...S.levels.map((l) => l + KV.lampOverFloor).filter((z) => z + h < top), top];
}

/** How far two ranges run into each other (> 0), or apart (≤ 0). */
const overlap = (a0: number, a1: number, b0: number, b1: number): number => Math.min(a1, b1) - Math.max(a0, b0);

/** The tightest margin of the niches [mm], null when there are none: each inside its wall with the wall left behind
 *  it, off the landing doors' frames and the other niches; the counterweight with its rails (along its wall from lo to
 *  hi) inside the niche for it. */
export function nicheMargin(I: ShaftInputs, doors: readonly DoorLayout[], cwSide: CwSide, cw: { lo: number; hi: number }): number | null {
  const ns = nichesOf(I);
  if (!ns.length) return null;
  let m = Infinity;
  ns.forEach((n, i) => {
    const n1 = n.at + n.width;
    m = Math.min(m, n.at, wallLength(I, n.wall) - n1, I.wall - KV.nicheBackMin - n.depth);
    for (const d of doors) if (d.wall === n.wall) m = Math.min(m, -overlap(n.at, n1, d.frame0, d.frame1));
    for (const o of ns.slice(i + 1)) if (o.wall === n.wall) m = Math.min(m, -overlap(n.at, n1, o.at, o.at + o.width));
    if (n.use === 'cw') m = Math.min(m, n.wall === cwSide ? Math.min(cw.lo - n.at, n1 - cw.hi) - KV.nicheGap : -n.width);
  });
  return m;
}
