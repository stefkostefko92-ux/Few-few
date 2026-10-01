// Changing a distance where it is drawn. The key of a dimension's edit (src/drawing/model.ts) names an input of the
// shaft: its size (W, D), the doors' size, an allowance, a distance of the plan set by hand (plan.*), a height of
// section A-A (v.*) or a size of the machine room (room.*); the new length of the dimension gives its value. Pure:
// the screens validate the result as the save does (src/lib/shaft-edit.ts).
import type { Edit } from '../drawing';
import { DEFAULTS, type Allowance } from './norme';
import { counterweightSide } from './layout';
import type { RoomInputs } from './room';
import type { Layout, PlanFix, PlanKey, ShaftInputs } from './types';
import type { VerticalInputs } from './vertical';

/** The keys of T whose values are plain numbers. */
type NumKey<T> = { [K in keyof T]-?: number extends T[K] ? (T[K] extends number ? K : never) : never }[keyof T];

export const PLAN_KEYS: readonly PlanKey[] = ['A', 'B', 'carX', 'doorA', 'doorB', 'opLen', 'railY', 'dbg', 'cwLen', 'cwPos'];
const V_KEYS = ['pit', 'headroom', 'carH', 'carOutH', 'platform', 'opTop', 'frameTop', 'frameBelow', 'parapet', 'carBufferH', 'carBufferStroke',
  'carBufferBase', 'cwH', 'cwBufferH', 'cwBufferStroke', 'cwBufferBase', 'cwRunby'] as const satisfies readonly NumKey<VerticalInputs>[];
const R_KEYS = ['W', 'D', 'shaftX', 'shaftY', 'H', 'ridge', 'slab', 'doorAt', 'doorW', 'doorH', 'panelAt', 'panelW', 'panelD', 'panelH'] as const satisfies readonly NumKey<RoomInputs>[];
const SIZES = ['W', 'D', 'doorWidth', 'doorHeight'] as const;
// the arrangement's distances: they mean something else once the entrances or the counterweight's side change
const ARRANGEMENT: readonly PlanKey[] = ['doorB', 'railY', 'dbg', 'cwLen', 'cwPos'];

const pick = <K extends string>(keys: readonly K[], k: string): K | undefined => keys.find((x) => x === k);
const isAllowance = (k: string): k is Allowance => Object.hasOwn(DEFAULTS, k);

/** The value an edit gives for a new length, to the millimetre: base + k · length, a half millimetre rounded the way
 *  that keeps the dimension reading the length typed. */
export const editValue = (e: Edit, length: number): number => Math.round(e.base + e.k * length - Math.sign(e.k) * 1e-6);

/** The inputs with the input `key` set to `value`; null for a key that names no input of these inputs. */
export function withValue(I: ShaftInputs, key: string, value: number): ShaftInputs | null {
  const size = pick(SIZES, key);
  if (size) return { ...I, [size]: value };
  if (isAllowance(key)) return { ...I, [key]: value };
  const dot = key.indexOf('.'), head = key.slice(0, dot), sub = key.slice(dot + 1);
  const p = head === 'plan' ? pick(PLAN_KEYS, sub) : undefined;
  if (p) return { ...I, plan: { ...I.plan, [p]: value } };
  const v = head === 'v' ? pick(V_KEYS, sub) : undefined;
  if (v) return { ...I, vertical: { ...I.vertical, [v]: value } };
  const r = head === 'room' ? pick(R_KEYS, sub) : undefined;
  if (r && I.room) return { ...I, room: { ...I.room, [r]: value } };
  return null;
}

/** The inputs after the dimension of `e` is given the new length: the edited input and the ones it keeps in place. */
export function applyEdit(I: ShaftInputs, e: Edit, length: number): ShaftInputs | null {
  let out: ShaftInputs | null = I;
  for (const a of e.also ?? []) out = out && withValue(out, a.key, a.value);
  return out && withValue(out, e.key, editValue(e, length));
}

/** The current value of an input named by an edit's key; null for a key that names none. */
export function valueOf(I: ShaftInputs, key: string): number | null {
  const size = pick(SIZES, key);
  if (size) return I[size];
  if (isAllowance(key)) return I[key];
  const dot = key.indexOf('.'), head = key.slice(0, dot), sub = key.slice(dot + 1);
  const p = head === 'plan' ? pick(PLAN_KEYS, sub) : undefined;
  if (p) return I.plan?.[p] ?? null;
  const v = head === 'v' ? pick(V_KEYS, sub) : undefined;
  if (v) return I.vertical[v];
  const r = head === 'room' ? pick(R_KEYS, sub) : undefined;
  return r && I.room ? I.room[r] : null;
}

/** The distances of the plan that can be set by hand on this layout, with their values now (worked out or set). */
export function planValues(L: Layout): Partial<Record<PlanKey, number>> {
  const [d0, d1] = L.doors, rail = L.rails.find((r) => r.kind === 'car');
  const out: Partial<Record<PlanKey, number>> = {
    A: L.A, B: L.B, carX: L.car.x, doorA: d0.u0, opLen: d0.op1 - d0.op0,
    railY: L.frame.kind === 'central' ? L.frame.axis : rail?.y, cwLen: L.cwSide === 'rear' ? L.cw.w : L.cw.h, cwPos: L.cwSide === 'rear' ? L.cw.x : L.cw.y,
  };
  if (d1) out.doorB = d1.u0;
  if (L.frame.kind === 'cantilever') out.dbg = L.frame.dbg;
  return out;
}

/** The distances set by hand that `keep` keeps; undefined when none is left. */
function picked(plan: PlanFix, keep: (k: PlanKey) => boolean): PlanFix | undefined {
  const out: PlanFix = {};
  for (const k of PLAN_KEYS) {
    const v = plan[k];
    if (v !== undefined && keep(k)) out[k] = v;
  }
  return PLAN_KEYS.some((k) => out[k] !== undefined) ? out : undefined;
}

/** The distances set by hand that still mean the same after a change of the inputs: those of the arrangement go when
 *  the entrances or the counterweight's side change. */
export function keptPlan(prev: ShaftInputs, next: ShaftInputs): PlanFix | undefined {
  const same = prev.entrances === next.entrances && prev.side2 === next.side2 && counterweightSide(prev) === counterweightSide(next);
  return next.plan && picked(next.plan, (k) => same || !ARRANGEMENT.includes(k));
}

/** The plan without one distance set by hand (it goes back to the one worked out). */
export const withoutFix = (I: ShaftInputs, key: PlanKey): ShaftInputs => ({ ...I, plan: I.plan && picked(I.plan, (k) => k !== key) });
