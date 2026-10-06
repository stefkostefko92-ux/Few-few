// The car's highest part under what hangs over it, with the car at its highest position (registry
// spazi.testata.pulegge): at 2:1 the car's pulley on the crosshead, its top Dp + 30 mm over the crosshead (rig.ts, the
// 3D sling); with the machine below, the head pulleys hanging under the slab over the car's drop (bottom.ts). At 2:1 the
// car's pulley is equipment on the roof (UNI EN 81-20:2020, 5.2.5.7.2 a): KV_VERT.headEquip); the crosshead under the
// hanging pulleys needs what the crosshead does (b): KV_VERT.headShoe). None at 1:1 with the machine above: there
// h_clear checks the crosshead under the slab. Pure.
import { check } from '@/shaft/checks';
import { KV_VERT } from '@/shaft/norme-vert';
import { section } from '@/shaft/section';
import type { Layout, ShaftCheck } from '@/shaft/types';
import type { BottomScheme } from './bottom';
import { KL } from './norme';

/** The car's pulley over its crosshead at 2:1, to its axle less the pulley's radius [mm]. */
export const CAR_PULLEY_GAP = 30;

export function headTopChecks(L: Layout, roping: number, Dp: number, scheme: BottomScheme | null): ShaftCheck[] {
  const two = roping === 2, hung = scheme === 'head' || scheme === 'under';
  if (!two && !hung) return [];
  const S = section(L), V = L.inputs.vertical, highest = S.top + S.moveUp;
  const carTop = highest + V.frameTop + (two ? CAR_PULLEY_GAP + Dp : 0);
  const over = hung ? S.ceiling - Dp - KL.headFrame : S.ceiling, gap = Math.round(over - carTop) || 0;
  const need = two ? KV_VERT.headEquip : KV_VERT.headShoe;
  return [check('h_top', gap >= need, gap, need, 0, 'mm')];
}
