// The clearance between the counterweight and its buffer the sign by the counterweight's screen gives, with the car at the
// top floor (UNI EN 81-20:2020, 5.2.5.7.1; registry contrappeso.cartello): every millimetre more run-by raises the car's
// highest position, and the counterweight's with the car on its buffers, by as much, so the most it may be is the
// design's run-by plus the least margin of the checks that position sets — the refuge on the roof (h_refuge), the
// clearances under the ceiling (h_clear), at 2:1 or under hanging pulleys the car's highest part under what hangs over it
// (h_top, h_hung), the refuge measured to the rope rig in the shaft (h_refuge_rig; all three known with the calculation),
// the counterweight's guided travel (h_cw) and, while they pass, the warnings of the
// crosshead under the ceiling (h_cross) and of the car's guided travel (h_guide): a warning already given does not change
// — rounded down to 5 mm; none where even no clearance would do. So at that clearance no check of the design changes its
// outcome. An information (h_cwgap) in the checks of the design, of sheet 1 and of the relazione; written on the screen
// in section A-A. Pure.
import { TEXT, type Box, type Entity, type Pt } from '../drawing';
import { mergeChecks } from './checks';
import { KV_VERT } from './norme-vert';
import { pitKit } from './pit-kit';
import { cwScreen } from './screen';
import { firstClear } from './lettering-place';
import { TAG_SCALE } from './tag-place';
import type { Section } from './section';
import type { Layout, ShaftCheck, ShaftCheckId } from './types';

/** The checks each millimetre of run-by takes a millimetre from: the ones that must pass, and the warnings (counted
 *  while they pass: one already given stays as it is). */
const HEAD: readonly ShaftCheckId[] = ['h_refuge', 'h_refuge_rig', 'h_clear', 'h_top', 'h_hung', 'h_cw'];
const HEAD_WARN: readonly ShaftCheckId[] = ['h_cross', 'h_guide'];

/** The most clearance counterweight–buffer the headroom allows, from the checks `checks` [mm]; null where even none
 *  would do (a headroom's check fails by more than the run-by): the sign waits for the design to pass. */
export function cwGapMax(L: Layout, checks: readonly ShaftCheck[]): number | null {
  const counts = (c: ShaftCheck): boolean => HEAD.includes(c.id) || (HEAD_WARN.includes(c.id) && c.status === 'ok');
  const margins = checks.flatMap((c) => (counts(c) && c.value !== null && c.limit !== null ? [c.value - c.limit] : []));
  const m = margins.length ? Math.min(...margins) : 0, step = KV_VERT.cwGapStep, gap = L.inputs.vertical.cwRunby + m;
  return gap < 0 ? null : Math.floor(gap / step + 1e-9) * step;
}

/** The information h_cwgap from `checks` (the design's, and the calculation's h_top where known). */
export const cwGapCheck = (L: Layout, checks: readonly ShaftCheck[]): ShaftCheck =>
  ({ id: 'h_cwgap', status: 'info', value: cwGapMax(L, checks), limit: null, dec: 0, unit: 'mm' });

/** The checks of the calculation that move the most clearance: the car's top under what hangs over it (h_top, h_hung)
 *  and the refuge measured to the rope rig in the shaft (h_refuge_rig, in place of the shaft's h_refuge). */
const OVER: readonly ShaftCheckId[] = ['h_top', 'h_hung', 'h_refuge_rig'];

/** The information again where the calculation adds checks of the headroom (`extra` with one of OVER): to merge over the
 *  design's own (mergeChecks); none otherwise. */
export const cwGapOver = (L: Layout, extra: readonly ShaftCheck[]): ShaftCheck[] =>
  (extra.some((c) => OVER.includes(c.id)) ? [cwGapCheck(L, mergeChecks(L.checks, extra))] : []);

/** The sign on the screen in section A-A: upright beside the screen seen edge-on (the counterweight at the back), across
 *  it seen face-on (on a side), near the screen's top — or under the pit's control box where its heights are written
 *  there (pit-kit.ts) —, else at the first height along the screen clear of the view's lettering (`taken`, at its
 *  `scale`: lettering-place.ts); where none is, the one that covers least of the pit kit's heights (`hard`). */
export function cwGapLabel(L: Layout, S: Section, P: (x: number, z: number) => Pt, gap: number, taken: Box[] = [], scale: number = TAG_SCALE, hard: readonly Box[] = []): Entity[] {
  const s = cwScreen(L), c = L.cw, text = `CARTELLO: GIOCO MAX CONTRAPPESO–AMMORTIZZATORE ${gap} mm`, low = S.pitFloor + s.low, high = S.pitFloor + s.high;
  const step = (TEXT.min + 1) * Math.max(TAG_SCALE, scale), along = (z0: number): number[] => {
    const out = [z0];
    for (let z = high - 160; z > low + 100; z -= step) if (Math.abs(z - z0) > 1) out.push(z);
    return out;
  };
  if (L.cwSide === 'rear') {
    return [...firstClear(along((low + high) / 2).map((z): Entity[] => [{ e: 'text', at: P(c.y - 70, z), text, size: 1.8, angle: 90, align: 'c', halo: true }]), taken, scale, undefined, [hard])];
  }
  const k = pitKit(L), busy = k.box ? [k.stop, k.light, ...(k.lowStop !== null ? [k.lowStop] : [])] : [], top = high - 160;
  const hit = busy.filter((b) => top > b - 120 && top < b + 70), under = hit.length ? Math.min(...hit) - 130 : top;
  const z = under > low + 100 ? under : top;
  return [...firstClear(along(z).map((h): Entity[] => [{ e: 'text', at: P((s.u0 + s.u1) / 2, h), text, size: 1.8, align: 'c', halo: true, fit: s.u1 - s.u0 }]), taken, scale, undefined, [hard])];
}
