// Changing a distance where it is drawn. The key of a dimension's edit (src/drawing/model.ts) names an input of the
// shaft: its size (W, D), the doors' size, an allowance, a distance of the plan set by hand (plan.*), a niche's place
// and size (n.<index>.*), the call stations' place (cs.*), a height of section A-A (v.*), a floor's rise (f.<index>.rise)
// or a size of the machine room (room.*), where a wall stands in the headroom (head.*), the doors' linings (imb.*), the
// machine's support (sup.*); the new length of the dimension gives its value. A length a catalogue or a table gives is
// changed by choice (carRail, cwRail, v.topRefuge, v.pitRefuge, sup.profile): the edit lists the entries. Keys of the calculation (calc.*) are
// applied by the screen that holds it. Pure: the screens validate the result as the save does (src/lib/shaft-edit.ts).
import type { Edit } from '../drawing';
import { callStationOf } from './callstation';
import { DEFAULTS, type Allowance } from './norme';
import { headOf } from './head';
import { imbottiOf, marbleHeight, marbleWidth, withImbotti, withMarbleHeight, withMarbleWidth } from './imbotti';
import { counterweightSide, layout } from './layout';
import { PROFILE_NAMES } from './profiles';
import { RAIL_TYPES } from './rails';
import { supportOf } from './support';
import type { RoomInputs } from './room';
import type { Layout, PlanFix, PlanKey, ShaftInputs } from './types';
import type { VerticalInputs } from './vertical';

/** The keys of T whose values are plain numbers (set or not). */
type NumKey<T> = { [K in keyof T]-?: NonNullable<T[K]> extends number ? (number extends NonNullable<T[K]> ? K : never) : never }[keyof T];

export const PLAN_KEYS: readonly PlanKey[] = ['A', 'B', 'carX', 'doorA', 'doorB', 'opLen', 'railY', 'dbg', 'cwLen', 'cwPos'];
const V_KEYS = ['pit', 'headroom', 'carH', 'carOutH', 'platform', 'opTop', 'frameTop', 'frameBelow', 'parapet', 'carBufferH', 'carBufferStroke',
  'carBufferBase', 'cwH', 'cwBufferH', 'cwBufferStroke', 'cwBufferBase', 'cwRunby', 'cwScreen', 'standW', 'standD'] as const satisfies readonly NumKey<VerticalInputs>[];
const R_KEYS = ['W', 'D', 'shaftX', 'shaftY', 'H', 'ridge', 'slab', 'doorAt', 'doorW', 'doorH', 'panelAt', 'panelW', 'panelD', 'panelH'] as const satisfies readonly NumKey<RoomInputs>[];
const SIZES = ['W', 'D', 'doorWidth', 'doorHeight'] as const;
const N_KEYS = ['at', 'width', 'depth'] as const;
const CS_KEYS = ['offset', 'height'] as const;
const H_KEYS = ['front', 'rear', 'left', 'right'] as const;
const IMB_KEYS = ['left', 'right', 'top', 'marble', 'height'] as const;
const SUP_KEYS = ['height', 'length'] as const;
/** Inputs changed by choosing an entry of a catalogue or a table. */
const PICK_KEYS = ['carRail', 'cwRail', 'v.topRefuge', 'v.pitRefuge', 'sup.profile'] as const;
/** Inputs of the calculation a drawing of the machine room shows (applied by the screen that holds them). */
export const CALC_KEYS = ['calc.h'] as const;
// the arrangement's distances: they mean something else once the entrances or the counterweight's side change
const ARRANGEMENT: readonly PlanKey[] = ['doorB', 'railY', 'dbg', 'cwLen', 'cwPos'];
// a door's place along its wall and its operator: kept when the shaft changes size while the door still opens on the car
const DOORS: readonly PlanKey[] = ['doorA', 'doorB', 'opLen'];

const pick = <K extends string>(keys: readonly K[], k: string): K | undefined => keys.find((x) => x === k);
const isAllowance = (k: string): k is Allowance => Object.hasOwn(DEFAULTS, k);

/** The value an edit gives for a new length, to the millimetre: base + k · length, a half millimetre rounded the way
 *  that keeps the dimension reading the length typed. */
export const editValue = (e: Edit, length: number): number => Math.round(e.base + e.k * length - Math.sign(e.k) * 1e-6);

/** A niche's size named by `n.<index>.<at|width|depth>`: its index and field, or null. */
function nicheKey(I: ShaftInputs, head: string, sub: string): { i: number; f: (typeof N_KEYS)[number] } | null {
  if (head !== 'n') return null;
  const [n, field] = sub.split('.'), i = Number(n), f = pick(N_KEYS, field ?? '');
  return f && Number.isInteger(i) && I.niches?.[i] ? { i, f } : null;
}

/** A floor's rise named by `f.<index>.rise`: the floor's index (the top floor has no rise), or null. */
function floorKey(I: ShaftInputs, head: string, sub: string): number | null {
  if (head !== 'f') return null;
  const [n, field] = sub.split('.'), i = Number(n);
  return field === 'rise' && Number.isInteger(i) && i >= 0 && i < I.vertical.floors.length - 1 ? i : null;
}

/** Every key an edit can carry (a niche's and a floor's with index 0): the screens name each one (editLabel). */
export const editKeys = (): string[] => [
  ...SIZES, ...Object.keys(DEFAULTS), ...PLAN_KEYS.map((k) => `plan.${k}`), ...V_KEYS.map((k) => `v.${k}`), ...R_KEYS.map((k) => `room.${k}`),
  ...N_KEYS.map((k) => `n.0.${k}`), ...CS_KEYS.map((k) => `cs.${k}`), ...H_KEYS.map((k) => `head.${k}`), 'f.0.rise', ...IMB_KEYS.map((k) => `imb.${k}`),
  ...SUP_KEYS.map((k) => `sup.${k}`), ...PICK_KEYS, ...CALC_KEYS,
];

/** The message (namespace shaft) naming the input behind an edit's key as the form calls it; the rail's distance reads
 *  differently on a cantilever frame. */
export function editLabel(key: string, cantilever: boolean): string {
  const dot = key.indexOf('.'), head = dot < 0 ? '' : key.slice(0, dot), sub = key.slice(dot + 1);
  if (head === 'plan') return sub === 'railY' && cantilever ? 'pk_railY_cant' : `pk_${sub}`;
  if (head === 'v') return `vt_${sub}`;
  if (head === 'room') return `rm_${sub}`;
  if (head === 'n') return `nc_${sub.slice(sub.indexOf('.') + 1)}`;
  if (head === 'cs') return `cs_${sub}`;
  if (head === 'head') return `hd_${sub}`;
  if (head === 'f') return 'fl_rise';
  if (head === 'imb') return `im_${sub}`;
  if (head === 'sup') return `su_${sub}`;
  if (head === 'calc') return `calc_${sub}`;
  return isAllowance(key) ? `a_${key}` : key;
}

/** The inputs with the input `key` set to `value`; null for a key that names no input of these inputs. */
export function withValue(I: ShaftInputs, key: string, value: number): ShaftInputs | null {
  const size = pick(SIZES, key);
  if (size) return { ...I, [size]: value };
  if (isAllowance(key)) return { ...I, [key]: value };
  const dot = key.indexOf('.'), head = key.slice(0, dot), sub = key.slice(dot + 1);
  const n = nicheKey(I, head, sub);
  if (n && I.niches) return { ...I, niches: I.niches.map((x, j) => (j === n.i ? { ...x, [n.f]: value } : x)) };
  const f = floorKey(I, head, sub);
  if (f !== null) return { ...I, vertical: { ...I.vertical, floors: I.vertical.floors.map((x, j) => (j === f ? { ...x, rise: value } : x)) } };
  const cs = head === 'cs' ? pick(CS_KEYS, sub) : undefined;
  if (cs) return { ...I, callStation: { ...callStationOf(I), [cs]: value } };
  const p = head === 'plan' ? pick(PLAN_KEYS, sub) : undefined;
  if (p) return { ...I, plan: { ...I.plan, [p]: value } };
  const v = head === 'v' ? pick(V_KEYS, sub) : undefined;
  if (v) return { ...I, vertical: { ...I.vertical, [v]: value } };
  const r = head === 'room' ? pick(R_KEYS, sub) : undefined;
  if (r && I.room) return { ...I, room: { ...I.room, [r]: value } };
  const m = head === 'imb' ? pick(IMB_KEYS, sub) : undefined;
  if (m) return m === 'marble' ? withMarbleWidth(I, value) : m === 'height' ? withMarbleHeight(I, value) : withImbotti(I, { ...imbottiOf(I), [m]: value });
  const su = head === 'sup' ? pick(SUP_KEYS, sub) : undefined;
  // a support below the floor or a frame or plinth shorter than the zod range is no support
  if (su && I.room) return value < (su === 'length' ? 300 : 0) ? null : { ...I, room: { ...I.room, support: { ...supportOf(I.room), [su]: value } } };
  const w = head === 'head' ? pick(H_KEYS, sub) : undefined;
  if (w) {
    // walls back where the main floor has them leave no headroom of their own
    const next = { ...headOf(I), [w]: value };
    return { ...I, head: H_KEYS.some((k) => next[k] !== 0) ? next : undefined };
  }
  return null;
}

/** The inputs with the input `key` set to an entry of its catalogue or table; null when it is not one of them. */
export function withChoice(I: ShaftInputs, key: string, set: string | number): ShaftInputs | null {
  if (key === 'carRail' || key === 'cwRail') {
    const r = RAIL_TYPES.find((x) => x === set);
    return r ? { ...I, [key]: r } : null;
  }
  if (key === 'v.topRefuge') return set === 1 || set === 2 ? { ...I, vertical: { ...I.vertical, topRefuge: set } } : null;
  if (key === 'v.pitRefuge') return set === 1 || set === 2 || set === 3 ? { ...I, vertical: { ...I.vertical, pitRefuge: set } } : null;
  if (key === 'sup.profile' && I.room) {
    // another profile: the support's height goes back to the profile's own
    const p = PROFILE_NAMES.find((x) => x === set), s = supportOf(I.room);
    return p ? { ...I, room: { ...I.room, support: { kind: s.kind, profile: p, ...(s.length !== undefined ? { length: s.length } : {}) } } } : null;
  }
  return null;
}

/** The inputs after the dimension of `e` is given the new length (for an edit by choice: the index of the entry
 *  chosen): the edited input and the ones it keeps in place. */
export function applyEdit(I: ShaftInputs, e: Edit, length: number): ShaftInputs | null {
  if (e.pick) {
    const o = e.pick.options[length];
    return o ? withChoice(I, e.key, o.set) : null;
  }
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
  const n = nicheKey(I, head, sub);
  if (n && I.niches) return I.niches[n.i][n.f];
  const f = floorKey(I, head, sub);
  if (f !== null) return I.vertical.floors[f].rise;
  const cs = head === 'cs' ? pick(CS_KEYS, sub) : undefined;
  if (cs) return callStationOf(I)[cs];
  const p = head === 'plan' ? pick(PLAN_KEYS, sub) : undefined;
  if (p) return I.plan?.[p] ?? null;
  const v = head === 'v' ? pick(V_KEYS, sub) : undefined;
  if (v) return I.vertical[v] ?? null;
  const r = head === 'room' ? pick(R_KEYS, sub) : undefined;
  if (r) return I.room ? I.room[r] : null;
  const m = head === 'imb' ? pick(IMB_KEYS, sub) : undefined;
  if (m) return m === 'marble' ? marbleWidth(I) : m === 'height' ? marbleHeight(I) : imbottiOf(I)[m];
  const su = head === 'sup' ? pick(SUP_KEYS, sub) : undefined;
  if (su) return I.room?.support?.[su] ?? null;
  const w = head === 'head' ? pick(H_KEYS, sub) : undefined;
  return w ? headOf(I)[w] : null;
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
 *  the entrances or the counterweight's side change. A shaft of another size gets its car proposed again, with the
 *  rails and the counterweight round it: of the distances set by hand only the doors' stay, and only while they still
 *  open on the new car. */
export function keptPlan(prev: ShaftInputs, next: ShaftInputs): PlanFix | undefined {
  const same = prev.entrances === next.entrances && prev.side2 === next.side2 && counterweightSide(prev) === counterweightSide(next);
  if (!next.plan) return undefined;
  if (prev.W === next.W && prev.D === next.D) return picked(next.plan, (k) => same || !ARRANGEMENT.includes(k));
  const doors = picked(next.plan, (k) => DOORS.includes(k) && (same || !ARRANGEMENT.includes(k)));
  if (!doors) return undefined;
  return layout({ ...next, plan: doors }).checks.some((c) => c.id === 'v_doorcar' && c.status !== 'ok') ? undefined : doors;
}

/** The plan without one distance set by hand (it goes back to the one worked out). */
export const withoutFix = (I: ShaftInputs, key: PlanKey): ShaftInputs => ({ ...I, plan: I.plan && picked(I.plan, (k) => k !== key) });
