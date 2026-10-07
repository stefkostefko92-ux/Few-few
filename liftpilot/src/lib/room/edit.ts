// A dimension of the replacement's machine room changed where it is drawn (src/shaft/room-view.ts): the keys of the
// room (room.*), of the machine's support (sup.*, rinvio.height, sup.profile by choice), of the HEB beams under it (heb.option,
// heb.profile by choice), of the shaft under it (W, D)
// and of the drops, moved together from the car's (drop.carX, drop.carY); the new length gives the value as in a whole design (src/shaft/edit.ts).
// What the calculation decides (the drop's spacing, h) is not changed here: a new calculation is. Pure; the screen
// validates the result as the save does (surveySchema).
import type { Edit } from '@/drawing';
import { lengthBounds } from '@/lib/shaft-edit';
import { editValue } from '@/shaft/edit';
import { withHebChoice } from '@/shaft/heb';
import { PROFILE_NAMES } from '@/shaft/profiles';
import type { RoomInputs } from '@/shaft/room';
import { supportOf } from '@/shaft/support';
import { surveySchema, type Survey } from './survey';

type NumKey<T> = { [K in keyof T]-?: NonNullable<T[K]> extends number ? (number extends NonNullable<T[K]> ? K : never) : never }[keyof T];
const R_KEYS = ['W', 'D', 'shaftX', 'shaftY', 'H', 'ridge', 'slab', 'doorAt', 'doorW', 'doorH', 'panelAt', 'panelW', 'panelD', 'panelH'] as const satisfies readonly NumKey<RoomInputs>[];
const pick = <K extends string>(keys: readonly K[], k: string): K | undefined => keys.find((x) => x === k);

/** The survey with the input `key` set to `value`; null for a key it does not have or a value no support takes. */
export function withSurveyValue(s: Survey, key: string, value: number): Survey | null {
  if (key === 'W' || key === 'D') return { ...s, shaft: { ...s.shaft, [key]: value } };
  // the drops move together: the measured spacing and direction stay
  if (key === 'drop.carX' || key === 'drop.carY') {
    const f = key === 'drop.carX' ? 'x' : 'y', cw = s.cw[f] + value - s.car[f];
    return value < 0 || cw < 0 ? null : { ...s, car: { ...s.car, [f]: value }, cw: { ...s.cw, [f]: cw } };
  }
  const dot = key.indexOf('.'), head = key.slice(0, dot), sub = key.slice(dot + 1), r = head === 'room' ? pick(R_KEYS, sub) : undefined;
  if (r) return { ...s, room: { ...s.room, [r]: value } };
  // the top of the bedplate with the diverting pulley: that support, ours, at that height
  if (key === 'rinvio.height') return value < 0 ? null : { ...s, room: { ...s.room, support: { kind: 'rinvio', height: value } } };
  if (key === 'sup.height' || key === 'sup.length') {
    const f = key === 'sup.height' ? 'height' : 'length';
    return value < (f === 'length' ? 300 : 0) ? null : { ...s, room: { ...s.room, support: { ...supportOf(s.room), [f]: value } } };
  }
  return null;
}

/** The survey after the dimension of `e` is given the new length (an edit by choice: the index of the entry chosen). */
export function applySurveyEdit(s: Survey, e: Edit, length: number): Survey | null {
  if (e.pick) {
    const o = e.pick.options[length], p = PROFILE_NAMES.find((x) => x === o?.set), hb = o ? withHebChoice(s.room, e.key, o.set) : null;
    if (hb) return { ...s, room: hb };
    if (e.key !== 'sup.profile' || !p) return null;
    // another profile: the support's height goes back to the profile's own
    const sup = supportOf(s.room);
    return { ...s, room: { ...s.room, support: { kind: sup.kind, profile: p, ...(sup.length !== undefined ? { length: sup.length } : {}) } } };
  }
  let out: Survey | null = s;
  for (const a of e.also ?? []) out = out && withSurveyValue(out, a.key, a.value);
  return out && withSurveyValue(out, e.key, editValue(e, length));
}

/** Where the input of an edit's key sits in the survey, as a validation issue names it. */
const pathOf = (key: string): string => (key === 'W' || key === 'D' ? `shaft.${key}` : key === 'drop.carX' ? 'car.x' : key === 'drop.carY' ? 'car.y'
  : key.startsWith('sup.') || key === 'rinvio.height' ? `room.support.${key.slice(key.indexOf('.') + 1)}` : key);

/** The survey after an edit, validated as the save validates it: the new survey, or the bounds of the dimension typed
 *  when the value broke its input's (else none). */
export function editSurvey(s: Survey, e: Edit, length: number): { ok: true; survey: Survey } | { ok: false; min: number | null; max: number | null } {
  const next = applySurveyEdit(s, e, length);
  if (!next) return e.pick ? { ok: false, min: null, max: null } : { ok: false, ...lengthBounds(e, e.key === 'sup.length' ? 300 : e.key.startsWith('drop.') ? null : 0, null) };
  const r = surveySchema.safeParse(next);
  if (r.success) return { ok: true, survey: r.data };
  const issue = r.error.issues[0], own = !e.pick && issue?.path.join('.') === pathOf(e.key);
  if (!own || !issue) return { ok: false, min: null, max: null };
  return { ok: false, ...lengthBounds(e, issue.code === 'too_small' ? Number(issue.minimum) : null, issue.code === 'too_big' ? Number(issue.maximum) : null) };
}
