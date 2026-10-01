// The machine as the drawings of the machine room take it from the calculation: the sheave, the ropes, the diverting
// pulley at the h of the calculation and on the side its bend takes it, the sheave's axis at KL.sheaveAxisPerD·D over
// the room's floor (the L0 of the calculation counts the same height, the 3D's rope rig puts it there: rig.ts).
import { deflectorAngle } from '@/calc/geometry';
import type { ParsedInputs } from '@/calc/types';
import type { MachineSpec } from '@/shaft/machine-room';
import { KL } from './norme';

export function machineSpec({ I, N }: Pick<ParsedInputs, 'I' | 'N'>, mass: number = N.mass, label = ''): MachineSpec {
  const defl = I.layout === 'topDefl';
  return {
    D: N.D, Dp: defl ? I.Dp : 0, n: N.n, d: N.d, mass, label, axis: KL.sheaveAxisPerD * N.D,
    h: defl ? I.h * 1000 : 0, reverse: defl && (deflectorAngle(N.D, I.Dp, I.dx, I.h)?.reverse ?? false), ropeIn: I.r === 2 ? I.Dp / 2 : 0,
  };
}
