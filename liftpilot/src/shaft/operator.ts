// The car door operator on the car roof, over the car sill and along the door's wall: its length as f·L + e and its
// depth from the car sill's line, by the supplier chosen or, without one, the longest and deepest of the catalogues
// (registry porte.operatore). Pure.
import { KV } from './norme';
import type { ShaftInputs } from './types';

type Maker = Exclude<NonNullable<ShaftInputs['doorMaker']>, 'generic'>;
const makerOf = (I: ShaftInputs): Maker | null => (I.doorMaker && I.doorMaker !== 'generic' ? I.doorMaker : null);

/** The operator's length as f·L + e. */
export function doorOpOf(I: ShaftInputs): readonly [number, number] {
  const m = makerOf(I);
  return m ? KV.doorOpMakers[m][I.door] : I.door === 'C2' ? KV.doorOpC2 : KV.doorOpT2;
}

/** How deep the operator is from the car sill's line [mm]. */
export function doorOpDepthOf(I: ShaftInputs): number {
  const m = makerOf(I);
  return m ? KV.doorOpMakers[m].depth : KV.doorOpDepth;
}
