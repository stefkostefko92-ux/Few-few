// A dimension of the replacement's machine room changed where it is drawn (src/shaft/room-view.ts): the keys of the
// room (room.*), of the machine's support (sup.*, rinvio.height, sup.profile by choice), of the shaft under it (W, D)
// and of the drops, moved together from the car's (drop.carX, drop.carY); the new length gives the value as in a whole design (src/shaft/edit.ts).
// What the calculation decides (the drop's spacing, h) is not changed here: a new calculation is. Pure; the screen
// validates the result as the save does (surveySchema).
import type { Edit } from '@/drawing';
import { editValue } from '@/shaft/edit';
import { PROFILE_NAMES } from '@/shaft/profiles';
import type { RoomInputs } from '@/shaft/room';
import { supportOf } from '@/shaft/support';
import { surveySchema, type Survey } from './survey';

type NumKey<T> = { [K in keyof T]-?: NonNullable<T[K]> extends number ? (number extends NonNullable<T[K]> ? K : never) : never }[keyof T];
const R_KEYS = ['W', 'D', 'shaftX', 'shaftY', 'H', 'ridge', 'slab', 'doorAt', 'doorW', 'doorH', 'panelAt', 'panelW', 'panelD', 'panelH'] as const satisfies readonly NumKey<RoomInputs>[];
const pick = <K extends string>(keys: readonly K[], k: string): K | undefined => keys.find((x) => x === k);

/** Every key a dimension of the replacement's room carries (the screens name each one). */
export const ROOM_EDIT_KEYS: readonly string[] = [...R_KEYS.map((k) => `room.${k}`), 'sup.height', 'sup.length', 'sup.profile', 'rinvio.height', 'W', 'D', 'drop.carX', 'drop.carY'];

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
    const o = e.pick.options[length], p = PROFILE_NAMES.find((x) => x === o?.set);
    if (e.key !== 'sup.profile' || !p) return null;
    // another profile: the support's height goes back to the profile's own
    const sup = supportOf(s.room);
    return { ...s, room: { ...s.room, support: { kind: sup.kind, profile: p, ...(sup.length !== undefined ? { length: sup.length } : {}) } } };
  }
  let out: Survey | null = s;
  for (const a of e.also ?? []) out = out && withSurveyValue(out, a.key, a.value);
  return out && withSurveyValue(out, e.key, editValue(e, length));
}

/** The survey after an edit, validated as the save validates it: the new survey, or the bounds the value broke. */
export function editSurvey(s: Survey, e: Edit, length: number): { ok: true; survey: Survey } | { ok: false; min: number | null; max: number | null } {
  const next = applySurveyEdit(s, e, length);
  if (!next) return { ok: false, min: null, max: null };
  const r = surveySchema.safeParse(next);
  if (r.success) return { ok: true, survey: r.data };
  const issue = r.error.issues[0];
  return { ok: false, min: issue?.code === 'too_small' ? Number(issue.minimum) : null, max: issue?.code === 'too_big' ? Number(issue.maximum) : null };
}
