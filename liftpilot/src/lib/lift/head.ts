// The car's highest part under what hangs over it, with the car at its highest position (registry
// spazi.testata.pulegge): at 2:1 the car's pulley on the crosshead, its top Dp + 30 mm over the crosshead (rig.ts, the
// 3D sling); with the machine below, the head pulleys hanging under the slab over the car's drop (bottom.ts). At 2:1 the
// car's pulley is equipment on the roof (UNI EN 81-20:2020, 5.2.5.7.2 a): KV_VERT.headEquip); the crosshead under the
// hanging pulleys needs what the crosshead does (b): KV_VERT.headShoe). None at 1:1 with the machine above: there
// h_clear checks the crosshead under the slab. Under hung pulleys the check is h_hung, the car's pulley under the slab
// h_top. With the lift's rig in the shaft (Layout.rig) the refuge on the car roof and the free height over the roof are
// measured to what hangs there (roof.ts, registry spazi.tetto.appese): h_refuge_rig and h_stand_rig take the place of
// the shaft's own h_refuge and h_stand (mergeChecks). Pure.
import { check } from '@/shaft/checks';
import { KV_VERT } from '@/shaft/norme-vert';
import { roofParts, roofRefuge } from '@/shaft/roof';
import { section } from '@/shaft/section';
import { hangingOf } from '@/shaft/shaft-rig';
import type { Layout, ShaftCheck } from '@/shaft/types';
import type { BottomScheme } from './bottom';
import { KL } from './norme';

/** The car's pulley over its crosshead at 2:1, to its axle less the pulley's radius [mm]. */
export const CAR_PULLEY_GAP = 30;

export function headTopChecks(L: Layout, roping: number, Dp: number, scheme: BottomScheme | null): ShaftCheck[] {
  const two = roping === 2, hung = scheme === 'head' || scheme === 'under', out: ShaftCheck[] = [];
  if (two || hung) {
    const S = section(L), V = L.inputs.vertical, highest = S.top + S.moveUp;
    const carTop = highest + V.frameTop + (two ? CAR_PULLEY_GAP + Dp : 0);
    const over = hung ? S.ceiling - Dp - KL.headFrame : S.ceiling, gap = Math.round(over - carTop) || 0;
    const need = two ? KV_VERT.headEquip : KV_VERT.headShoe;
    out.push(check(hung ? 'h_hung' : 'h_top', gap >= need, gap, need, 0, 'mm'));
  }
  return [...out, ...refugeChecks(L)];
}

/** The refuge's checks under what the rig hangs over the roof (none without it, or with nothing hanging): the free
 *  height over the roof's free parts (h_refuge_rig: 5.2.5.7.1 and 5.2.5.7.3) and the refuge's plan clear of what hangs
 *  into its height (h_stand_rig). They take the place of the shaft's h_refuge and h_stand (mergeChecks) under their own
 *  ids: what hangs is the machine's (a machine below's pulleys, a 2:1 roping's dead ends), so a new machine brings them
 *  into the acceptance test as it does h_hung (collaudo.ts), while the shaft's own stay with the car and its frame. */
function refugeChecks(L: Layout): ShaftCheck[] {
  if (!L.rig || !hangingOf(L.rig).length) return [];
  const R = roofRefuge(L), H = KV_VERT.refugeH[L.inputs.vertical.topRefuge], clear = R.clear ?? 0;
  return [check('h_refuge_rig', clear >= H, clear, H, 0, 'mm'), check('h_stand_rig', R.fit >= 0, R.fit, 0, 0, 'mm')];
}

/** The headroom with which nothing the rig hangs over the free parts of the car roof stays under the refuge's height
 *  over it (the slab and what hangs under it raised alike), rounded up to 10 mm; null when nothing hangs into it — the
 *  slab alone lower than that is the shaft's own h_refuge, not the rig's (what hangs is lower than the slab, so the
 *  headroom that clears it clears the slab too). */
export function refugeHeadroom(L: Layout): number | null {
  const rig = L.rig;
  if (!rig) return null;
  const V = L.inputs.vertical, H = KV_VERT.refugeH[V.topRefuge], parts = roofParts(L);
  const over = hangingOf(rig).filter((o) => parts.some((p) => o.box.x0 < p.x1 - 1 && p.x0 < o.box.x1 - 1 && o.box.y0 < p.y1 - 1 && p.y0 < o.box.y1 - 1));
  const short = Math.max(0, ...over.map((o) => H - (o.z - rig.roof)));
  return short > 1e-9 ? Math.ceil((V.headroom + short) / 10) * 10 : null;
}
