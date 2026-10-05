// The project data of the one form that a brand new installation leaves empty: the shaft and its walls, the rated load,
// the entrances and doors, the counterweight's side, the accessibility, the speed, pit and headroom, the floors with
// their rises, doors and main floor, the machine room, the roping and where the machine stands; in a replacement the
// existing machine and the ropes in place too. Nothing is worked out until every one that applies is entered; the
// software's own values (allowances, rails, heights, buffers, the machine, the car mass…) come after, marked as such. A
// value that a choice brings into the form starts empty too (the second entrance's side, the doors of the floors, the
// scheme of a machine below, a machine room). The inputs underneath hold placeholders no field, drawing or record
// shows. Pure: the form, its draft and the server read it alike.
import { readInputs } from '@/calc/index';
import type { FormValues } from '@/calc/types';
import { MACHINE, ROPES } from '@/components/calc/fields';
import { visibleBad } from '@/lib/calc-input';
import { DEFAULT_ROOM, type Floor, type ShaftInputs, type VerticalInputs } from '@/shaft';
import { LIFT_STANDARD, newLift } from './defaults';
import type { LiftInputs } from './derive';

export const ROOM_FIELDS = ['W', 'D', 'shaftX', 'shaftY', 'H', 'slab', 'doorWall', 'doorAt', 'doorW', 'doorH', 'panelWall', 'panelAt', 'panelW', 'panelD', 'panelH'] as const;
type RoomField = (typeof ROOM_FIELDS)[number];
/** The values of the shaft entered at its top level, in the form's order. */
export const SHAFT_FIELDS = ['access', 'W', 'D', 'Q', 'Qkg', 'entrances', 'side2', 'door', 'doorWidth', 'doorHeight', 'cw', 'wall'] as const;
type ShaftField = (typeof SHAFT_FIELDS)[number];

export type BlankKey = ShaftField | 'v' | 'pit' | 'headroom' | 'floors' | `rise.${number}` | `fdoor.${number}` | 'main' | 'r' | 'layout' | 'bottom'
  | `room.${RoomField}`;

/** The form as it is being filled in: the inputs and the values still to enter. */
export interface LiftDraft {
  inputs: LiftInputs;
  blank: readonly BlankKey[];
}

const roomKeys = (): BlankKey[] => ROOM_FIELDS.map((k) => `room.${k}` as const);
const KEY = new RegExp(`^(?:${[...SHAFT_FIELDS, 'v', 'pit', 'headroom', 'floors', 'main', 'r', 'layout', 'bottom'].join('|')}|(?:rise|fdoor)\\.\\d{1,2}|room\\.(?:${ROOM_FIELDS.join('|')}))$`);
export const isBlankKey = (s: string): s is BlankKey => KEY.test(s);

/** The machines' values a new installation leaves empty: the new machine's (the proposal fills them in, else they come
 *  from the maker's datasheet) and, in a replacement, the existing machine's and the ropes in place; the standard
 *  assumptions stay (LIFT_STANDARD). */
const MACHINE_DATA: readonly string[] = [...MACHINE('n_'), ...ROPES('n_'), ...MACHINE('o_'), ...ROPES('o_')].map((f) => f.id).filter((id) => !(id in LIFT_STANDARD));

/** A brand new installation: every value of the project still to enter. */
export function blankLift(): LiftDraft {
  const d = newLift();
  return {
    inputs: { ...d, calc: { ...d.calc, ...Object.fromEntries(MACHINE_DATA.map((id) => [id, ''])) } },
    blank: [...SHAFT_FIELDS, 'v', 'pit', 'headroom', 'floors', 'r', 'layout', 'bottom', ...roomKeys()],
  };
}

/** The ropes the new machine keeps in a replacement: their number, diameter, breaking load and mass. */
const ROPES_IN_PLACE: readonly string[] = ROPES('n_').map((f) => f.id);
const isEmpty = (x: unknown): boolean => String(x ?? '').trim() === '';

/** A replacement's existing installation still to enter in the one form (the calculation's fields, in the form's
 *  order): the ropes in place when the new machine keeps them, the existing machine and its ropes when it is compared. */
export function existingMissing(V: FormValues): string[] {
  if (V.context !== 'repl') return [];
  return visibleBad(readInputs(V).bad, V).filter((id) => isEmpty(V[id]) && (id.startsWith('o_') || (!!V.keepRopes && ROPES_IN_PLACE.includes(id))));
}

const indexOf = (k: string, prefix: string): number => Number(k.slice(prefix.length));

/** Whether a value still to enter is asked for with the choices made so far. */
export function relevant(k: BlankKey, d: LiftDraft): boolean {
  const S = d.inputs.shaft, has = (x: BlankKey): boolean => !d.blank.includes(x), n = S.vertical.floors.length;
  const one = !has('entrances') || S.entrances === 'one';
  if (k === 'side2') return has('entrances') && S.entrances === 'adjacent';
  if (k === 'cw') return one;
  if (k === 'Qkg') return has('Q') && S.Q !== null;
  if (k.startsWith('rise.')) return has('floors') && indexOf(k, 'rise.') < n - 1;
  if (k.startsWith('fdoor.')) return has('floors') && !one && indexOf(k, 'fdoor.') < n;
  if (k === 'main') return has('floors');
  if (k === 'bottom') return has('layout') && d.inputs.calc.layout === 'bottom';
  if (k.startsWith('room.')) return has('layout') && d.inputs.calc.layout !== 'bottom' && S.room !== null;
  return true;
}

/** The values still to enter that the choices ask for, in the form's order. */
export function missingOf(d: LiftDraft): BlankKey[] {
  const order = (k: BlankKey): number => {
    const head = k.split('.')[0], at = k.includes('.') ? Number(k.split('.')[1]) || 0 : 0;
    const base = ['W', 'D', 'Q', 'Qkg', 'entrances', 'side2', 'door', 'doorWidth', 'doorHeight', 'cw', 'wall', 'access', 'v', 'pit', 'headroom', 'floors', 'rise', 'fdoor',
      'main', 'room', 'r', 'layout', 'bottom'].indexOf(head);
    return base * 100 + (head === 'room' ? ROOM_FIELDS.indexOf(k.slice(5) as RoomField) : at);
  };
  return d.blank.filter((k) => relevant(k, d)).sort((a, b) => order(a) - order(b));
}

export const filled = (blank: readonly BlankKey[], keys: readonly BlankKey[]): BlankKey[] => blank.filter((k) => !keys.includes(k));
export const emptied = (blank: readonly BlankKey[], keys: readonly BlankKey[]): BlankKey[] => [...blank, ...keys.filter((k) => !blank.includes(k))];

/** The keys of the top level of the shaft a patch of it enters (the given load's figure is entered by its own field). */
export function enteredBy(patch: Partial<ShaftInputs>): BlankKey[] {
  return SHAFT_FIELDS.filter((k) => k !== 'Qkg' && k in patch);
}

const range = (from: number, to: number): number[] => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);
const floorKeys = (from: number, n: number, multi: boolean): BlankKey[] => [
  ...range(from, n - 1).map((i): BlankKey => `rise.${i}`), ...(multi ? range(from, n).map((i): BlankKey => `fdoor.${i}`) : []),
];

/** The rise a new interval holds until it is entered [mm] (never shown). */
const RISE_PLACEHOLDER = 3000;

/**
 * The floors set to `n`: the first time n rows numbered from 0, each rise, the doors of a shaft with two entrances and
 * the main floor to enter; later the rows above added (their rises and doors to enter) or taken off (the main floor to
 * enter again when it was one of them).
 */
export function floorsTo(V: VerticalInputs, blank: readonly BlankKey[], n: number, multi: boolean): { vertical: VerticalInputs; blank: BlankKey[] } {
  const count = Math.max(2, Math.min(60, Math.round(n)));
  if (blank.includes('floors')) {
    const floors: Floor[] = range(0, count).map((i) => ({ label: String(i), rise: i < count - 1 ? RISE_PLACEHOLDER : 0, door: 'A' }));
    return { vertical: { ...V, floors, main: 0 }, blank: emptied(filled(blank, ['floors']), [...floorKeys(0, count, multi), 'main']) };
  }
  const cur = V.floors;
  if (count === cur.length) return { vertical: V, blank: [...blank] };
  if (count > cur.length) {
    const top = Number(cur[cur.length - 1]?.label), label = (i: number): string => (Number.isFinite(top) ? String(top + 1 + i - cur.length) : String(i));
    const floors: Floor[] = [
      ...cur.slice(0, -1), ...cur.slice(-1).map((f) => ({ ...f, rise: f.rise || RISE_PLACEHOLDER })),
      ...range(cur.length, count).map((i) => ({ label: label(i), rise: i < count - 1 ? RISE_PLACEHOLDER : 0, door: 'A' as const })),
    ];
    return { vertical: { ...V, floors }, blank: emptied(blank, floorKeys(cur.length - 1, count, multi).filter((k) => k !== `fdoor.${cur.length - 1}`)) };
  }
  const floors = cur.slice(0, count).map((f, i) => (i === count - 1 ? { ...f, rise: 0 } : f));
  const gone = (k: BlankKey): boolean => (k.startsWith('rise.') && indexOf(k, 'rise.') >= count - 1) || (k.startsWith('fdoor.') && indexOf(k, 'fdoor.') >= count);
  const lost = V.main >= count;
  return { vertical: { ...V, floors, main: lost ? 0 : V.main }, blank: emptied(blank.filter((k) => !gone(k)), lost ? ['main'] : []) };
}

/**
 * The floor `i` taken off: the rows above move down with what they still have to enter, every other stop at its level
 * (a stop between two others leaves the floor below it the two rises, still to enter when either was).
 */
export function floorRemoved(V: VerticalInputs, blank: readonly BlankKey[], i: number): { vertical: VerticalInputs; blank: BlankKey[] } {
  const n = V.floors.length, between = i > 0 && i < n - 1, unknown = between && (blank.includes(`rise.${i - 1}`) || blank.includes(`rise.${i}`));
  const floors = V.floors.flatMap((f, j) => (j === i ? [] : j === i - 1 && between ? [{ ...f, rise: f.rise + (V.floors[i]?.rise ?? 0) }] : [f])), last = floors.length - 1;
  const shift = (k: BlankKey): BlankKey | null => {
    for (const p of ['rise.', 'fdoor.'] as const) {
      if (!k.startsWith(p)) continue;
      const j = indexOf(k, p);
      if (j === i) return null;
      return `${p}${j > i ? j - 1 : j}`;
    }
    return k;
  };
  const next = blank.map(shift).filter((k): k is BlankKey => k !== null && !(k === `rise.${last}`));
  const lost = V.main === i;
  return {
    vertical: { ...V, floors: floors.map((f, j) => (j === last ? { ...f, rise: 0 } : f)), main: lost ? 0 : Math.min(V.main > i ? V.main - 1 : V.main, last) },
    blank: emptied(next, [...(lost ? ['main' as const] : []), ...(unknown ? [`rise.${i - 1}` as const] : [])]),
  };
}

/** The entrances changed: a second entrance on the side brings its side to enter; two entrances, the doors of every floor. */
export function entrancesTo(S: ShaftInputs, blank: readonly BlankKey[], next: ShaftInputs['entrances']): BlankKey[] {
  const was = blank.includes('entrances') ? null : S.entrances, n = S.vertical.floors.length;
  const add: BlankKey[] = [];
  if (next === 'adjacent' && was !== 'adjacent') add.push('side2');
  if (next !== 'one' && (was === 'one' || was === null) && !blank.includes('floors')) add.push(...range(0, n).map((i): BlankKey => `fdoor.${i}`));
  return emptied(filled(blank, ['entrances']), add);
}

/** The machine's place chosen: below, the scheme of its ropes to choose (when it was elsewhere). */
export function layoutTo(prev: string | undefined, blank: readonly BlankKey[], next: string): BlankKey[] {
  const was = blank.includes('layout') ? null : prev;
  return emptied(filled(blank, ['layout']), next === 'bottom' && was !== 'bottom' ? ['bottom'] : []);
}

/** A machine room added to the design: every measure of it to enter. */
export const roomAdded = (blank: readonly BlankKey[]): BlankKey[] => emptied(blank, roomKeys());

/** The given load a choice of it starts from until its figure is entered [kg] (never shown). */
export const Q_PLACEHOLDER = 630;

/** The placeholder room a machine room added starts from (never shown). */
export const ROOM_PLACEHOLDER = DEFAULT_ROOM;
