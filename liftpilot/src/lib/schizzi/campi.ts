// The measures a hand-drawn survey sketch may give (round 50), by target: the shaft of /progetto ('vano': the ids of the
// one form's values still to enter, src/lib/lift/blank.ts BlankKey) and the machine room of a machine replacement
// ('locale': the survey's fields, src/lib/room/survey.ts SURVEY_FIELDS, the ridge, the governor and the existing
// support found on site). Each with its type — millimetres or a count as whole numbers within the very ranges the forms'
// schemas take (read from them here, never copied: a test pins them), a choice with its values, yes/no —, its Italian
// label (messages/it.json schizzi.campi.<label>) and what it is, for the model (English, src/lib/schizzi/prompt.ts).
// The reading's proposal is checked against it (proposta.ts) and the panel applies it to the forms (Part C). Pure:
// the server and the browser share it.
import { z } from 'zod';
import { roomSchema, shaftInputsReadSchema, verticalSchema } from '@/lib/shaft-input';
import { surveySchema } from '@/lib/room/survey';

/** What a sketch is read for: the shaft (/progetto) or the machine room of a replacement (/calculations/<id>/locale). */
export const TARGETS = ['vano', 'locale'] as const;
export type Target = (typeof TARGETS)[number];
export const isTarget = (x: unknown): x is Target => TARGETS.some((t) => t === x);

export type TipoCampo =
  | { kind: 'mm'; min: number; max: number }
  | { kind: 'int'; min: number; max: number }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'bool' };

export interface Campo {
  /** the id as the forms use it; an indexed field's ids are `${id}.${n}`, n = 0..indexed.max */
  id: string;
  indexed?: { max: number };
  tipo: TipoCampo;
  /** the key of its Italian label under schizzi.campi (an indexed one takes {n}, the index) */
  label: string;
  /** the group it belongs to on the sketch (the model's instructions and the panel's order) */
  group: 'vano' | 'fermate' | 'locale' | 'calate' | 'rilievi';
  /** what it is and how it is measured, for the model */
  hint: string;
}

// --- the ranges, read from the forms' schemas ------------------------------------------------------------------------

/** The schema under its defaults, optionals, nullables and refinements. */
function bare(s: z.ZodTypeAny): z.ZodTypeAny {
  for (let t = s; ;) {
    if (t instanceof z.ZodDefault) t = t._def.innerType;
    else if (t instanceof z.ZodOptional || t instanceof z.ZodNullable) t = t.unwrap();
    else if (t instanceof z.ZodEffects) t = t.innerType();
    else return t;
  }
}

/** An object schema's shape (under its wrappers). */
function shape(s: z.ZodTypeAny): z.ZodRawShape {
  const o = bare(s);
  if (!(o instanceof z.ZodObject)) throw new Error('schizzi/campi: not an object schema');
  return o.shape;
}
const at = (sh: z.ZodRawShape, k: string): z.ZodTypeAny => {
  const s = sh[k];
  if (!s) throw new Error(`schizzi/campi: no field ${k}`);
  return s;
};

/** A whole number's range as its schema takes it. */
function intRange(s: z.ZodTypeAny): { min: number; max: number } {
  const n = bare(s);
  if (!(n instanceof z.ZodNumber) || !n.isInt || n.minValue === null || n.maxValue === null) throw new Error('schizzi/campi: not a bounded integer');
  return { min: n.minValue, max: n.maxValue };
}
const mm = (s: z.ZodTypeAny): TipoCampo => ({ kind: 'mm', ...intRange(s) });
function choice(s: z.ZodTypeAny): TipoCampo {
  const e = bare(s);
  if (!(e instanceof z.ZodEnum)) throw new Error('schizzi/campi: not an enum');
  return { kind: 'enum', values: [...(e.options as readonly string[])] };
}
function bool(s: z.ZodTypeAny): TipoCampo {
  if (!(bare(s) instanceof z.ZodBoolean)) throw new Error('schizzi/campi: not a boolean');
  return { kind: 'bool' };
}

const S = shaftInputsReadSchema.shape, V = shape(verticalSchema), R = roomSchema.shape;
const floorsSchema = bare(at(V, 'floors'));
if (!(floorsSchema instanceof z.ZodArray)) throw new Error('schizzi/campi: floors is not an array');
const FLOOR = shape(floorsSchema.element);
/** The stops a shaft may have (the floors' array in the schema). */
const FLOORS = { min: floorsSchema._def.minLength?.value ?? 2, max: floorsSchema._def.maxLength?.value ?? 60 };
const SV = surveySchema.shape, SHAFT = shape(SV.shaft), DROP = shape(SV.car), GOV = shape(SV.governor), OLD = shape(SV.existingSupport);

// --- the frames, said once to the model ------------------------------------------------------------------------------

const ROOM_FRAME = 'Machine-room plan frame: the room\'s FRONT wall is the one on the side of entrance A of the shaft below (the main landing door side); ' +
  'x runs along the front wall from the room\'s LEFT inner wall (left as seen standing at the front wall looking into the room), y from the front inner wall into the room.';
const WALL = 'one of front, rear, left, right (room walls as in the machine-room plan frame)';
const AT = 'distance along that wall from its starting corner: along front/rear walls measured from the left wall (x), along left/right walls measured from the front wall (y)';

/** The room over the shaft: the same fields on both targets (the machine room above the shaft; on /progetto only when the
 *  sketch shows it). */
const ROOM: readonly Campo[] = [
  { id: 'room.W', tipo: mm(R.W), label: 'room_W', group: 'locale', hint: `machine room clear width along x (front wall), inner wall to inner wall. ${ROOM_FRAME}` },
  { id: 'room.D', tipo: mm(R.D), label: 'room_D', group: 'locale', hint: 'machine room clear depth along y, front inner wall to rear inner wall' },
  { id: 'room.shaftX', tipo: mm(R.shaftX), label: 'room_shaftX', group: 'locale', hint: 'x of the shaft below: from the room\'s left inner wall to the shaft\'s left inner face (the shaft corner on the entrance-A side, on the left)' },
  { id: 'room.shaftY', tipo: mm(R.shaftY), label: 'room_shaftY', group: 'locale', hint: 'y of the shaft below: from the room\'s front inner wall to the shaft\'s inner face on the entrance-A side' },
  { id: 'room.H', tipo: mm(R.H), label: 'room_H', group: 'locale', hint: 'clear height of the room at its lowest point (under beams or the lowest ceiling)' },
  { id: 'room.ridge', tipo: mm(R.ridge), label: 'room_ridge', group: 'locale', hint: 'clear height under the ridge of a pitched roof; 0 only when the sketch says the roof is flat' },
  { id: 'room.slab', tipo: mm(R.slab), label: 'room_slab', group: 'locale', hint: 'thickness of the slab between the room and the shaft' },
  { id: 'room.doorWall', tipo: choice(R.doorWall), label: 'room_doorWall', group: 'locale', hint: `wall of the room door: ${WALL}` },
  { id: 'room.doorAt', tipo: mm(R.doorAt), label: 'room_doorAt', group: 'locale', hint: `position of the room door's left jamb (start of the clear opening): ${AT}` },
  { id: 'room.doorW', tipo: mm(R.doorW), label: 'room_doorW', group: 'locale', hint: 'clear width of the room door' },
  { id: 'room.doorH', tipo: mm(R.doorH), label: 'room_doorH', group: 'locale', hint: 'clear height of the room door' },
  { id: 'room.panelWall', tipo: choice(R.panelWall), label: 'room_panelWall', group: 'locale', hint: `wall the control panel stands against: ${WALL}` },
  { id: 'room.panelAt', tipo: mm(R.panelAt), label: 'room_panelAt', group: 'locale', hint: `position of the control panel's start: ${AT}` },
  { id: 'room.panelW', tipo: mm(R.panelW), label: 'room_panelW', group: 'locale', hint: 'control panel width along its wall' },
  { id: 'room.panelD', tipo: mm(R.panelD), label: 'room_panelD', group: 'locale', hint: 'control panel depth out of its wall' },
  { id: 'room.panelH', tipo: mm(R.panelH), label: 'room_panelH', group: 'locale', hint: 'control panel height' },
];

const SHAFT_FRAME = 'Shaft plan frame: W is the inner width along the wall of entrance A (the main landing doors), D the inner depth from that wall to the opposite one.';

/** The shaft of /progetto: the one form's values (BlankKey ids), its floors, and the room over it. */
const VANO: readonly Campo[] = [
  { id: 'W', tipo: mm(S.W), label: 'W', group: 'vano', hint: `shaft inner width along the entrance-A wall. ${SHAFT_FRAME}` },
  { id: 'D', tipo: mm(S.D), label: 'D', group: 'vano', hint: 'shaft inner depth, from the entrance-A wall to the opposite wall' },
  { id: 'wall', tipo: mm(S.wall), label: 'wall', group: 'vano', hint: 'thickness of the shaft walls' },
  { id: 'door', tipo: choice(S.door), label: 'door', group: 'vano', hint: 'landing door type: T2 = two-panel telescopic (side opening), C2 = two-panel centre opening' },
  { id: 'doorWidth', tipo: mm(S.doorWidth), label: 'doorWidth', group: 'vano', hint: 'clear width of the landing door opening' },
  { id: 'doorHeight', tipo: mm(S.doorHeight), label: 'doorHeight', group: 'vano', hint: 'clear height of the landing door opening' },
  { id: 'entrances', tipo: choice(S.entrances), label: 'entrances', group: 'vano', hint: 'car entrances: one; opposite (A and B on opposite walls); adjacent (B on a side wall, at 90 degrees)' },
  { id: 'side2', tipo: choice(S.side2), label: 'side2', group: 'vano', hint: 'only with adjacent entrances: the side wall of entrance B, left or right as seen from landing A looking into the shaft' },
  { id: 'cw', tipo: choice(S.cw), label: 'cw', group: 'vano', hint: 'only with one entrance: the wall the counterweight runs by, rear (opposite the door), left or right as seen from the landing' },
  { id: 'pit', tipo: mm(at(V, 'pit')), label: 'pit', group: 'vano', hint: 'pit depth, from the lowest landing floor level down to the pit floor' },
  { id: 'headroom', tipo: mm(at(V, 'headroom')), label: 'headroom', group: 'vano', hint: 'headroom, from the highest landing floor level up to the underside of the shaft ceiling (the slab)' },
  { id: 'floors', tipo: { kind: 'int', ...FLOORS }, label: 'floors', group: 'fermate', hint: 'number of stops (landings served), counted on the section or the list of floors' },
  { id: 'rise', indexed: { max: FLOORS.max - 2 }, tipo: mm(at(FLOOR, 'rise')), label: 'rise', group: 'fermate',
    hint: 'rise.N: floor-to-floor height from stop N to stop N+1, stops numbered from 0 at the lowest; there is no rise above the top stop' },
  { id: 'fdoor', indexed: { max: FLOORS.max - 1 }, tipo: choice(at(FLOOR, 'door')), label: 'fdoor', group: 'fermate',
    hint: 'fdoor.N: only with two entrances, which entrance(s) stop N has: A, B or AB (both)' },
  { id: 'main', tipo: { kind: 'int', ...intRange(at(V, 'main')) }, label: 'main', group: 'fermate', hint: 'index of the main (ground/access) stop, 0 = the lowest stop' },
  ...ROOM,
];

/** The machine room of a replacement: the survey's fields, the ridge, the governor and the existing support found. */
const LOCALE: readonly Campo[] = [
  ...ROOM,
  { id: 'shaft.W', tipo: mm(at(SHAFT, 'W')), label: 'shaft_W', group: 'calate', hint: `inner width of the shaft below the room, along the entrance-A wall (parallel to the room's front wall). ${SHAFT_FRAME}` },
  { id: 'shaft.D', tipo: mm(at(SHAFT, 'D')), label: 'shaft_D', group: 'calate', hint: 'inner depth of the shaft below the room, from its entrance-A wall to the opposite one' },
  { id: 'shaft.wall', tipo: mm(at(SHAFT, 'wall')), label: 'shaft_wall', group: 'calate', hint: 'thickness of the shaft walls' },
  ...(['car', 'cw'] as const).flatMap((w): Campo[] => {
    const who = w === 'car' ? 'the car side ropes' : 'the counterweight side ropes';
    return [
      { id: `${w}.x`, tipo: mm(at(DROP, 'x')), label: `${w}_x`, group: 'calate', hint: `x of the centre of ${who} where they pass through the slab, measured in the SHAFT frame: from the shaft's inner corner on the entrance-A side (left as seen from landing A), along the entrance-A wall` },
      { id: `${w}.y`, tipo: mm(at(DROP, 'y')), label: `${w}_y`, group: 'calate', hint: `y of the centre of ${who}: from the shaft's entrance-A inner face into the shaft` },
    ];
  }),
  { id: 'governor.x', tipo: mm(at(GOV, 'x')), label: 'governor_x', group: 'rilievi', hint: 'existing speed governor on the room floor: x of the middle of its footprint, from the room\'s left inner wall' },
  { id: 'governor.y', tipo: mm(at(GOV, 'y')), label: 'governor_y', group: 'rilievi', hint: 'existing speed governor: y of the middle of its footprint, from the room\'s front inner wall' },
  { id: 'governor.W', tipo: mm(at(GOV, 'W')), label: 'governor_W', group: 'rilievi', hint: 'existing speed governor: footprint size along x' },
  { id: 'governor.D', tipo: mm(at(GOV, 'D')), label: 'governor_D', group: 'rilievi', hint: 'existing speed governor: footprint size along y' },
  { id: 'governor.ropes', tipo: bool(at(GOV, 'ropes')), label: 'governor_ropes', group: 'rilievi', hint: 'true when the governor ropes go down through the slab under it' },
  { id: 'existingSupport.kind', tipo: choice(at(OLD, 'kind')), label: 'existingSupport_kind', group: 'rilievi',
    hint: 'what the existing machine stands on: shims (shims or anti-vibration pads on the slab), frame (a steel frame), beams (beams wall to wall), plinth (a concrete plinth), unknown' },
  { id: 'existingSupport.keep', tipo: bool(at(OLD, 'keep')), label: 'existingSupport_keep', group: 'rilievi', hint: 'true only when the sketch says the existing support stays and is reused' },
];

/** The catalog by target, in the forms' order. */
export const CAMPI: Readonly<Record<Target, readonly Campo[]>> = { vano: VANO, locale: LOCALE };

/** The field an id names on a target (`rise.3` names the indexed `rise`), with its index; null for none. */
export function campoDi(target: Target, id: string): { campo: Campo; index: number | null } | null {
  const m = /^([A-Za-z]+)\.(0|[1-9]\d{0,2})$/.exec(id);
  for (const campo of CAMPI[target]) {
    if (campo.indexed) {
      if (m && m[1] === campo.id && Number(m[2]) <= campo.indexed.max) return { campo, index: Number(m[2]) };
    } else if (campo.id === id) return { campo, index: null };
  }
  return null;
}

/** Whether a value has the field's type and lies in its range (never clamped: a value out of it is not read). */
export function valoreValido(tipo: TipoCampo, v: unknown): 'ok' | 'tipo' | 'fuoriIntervallo' {
  switch (tipo.kind) {
    case 'mm':
    case 'int':
      if (typeof v !== 'number' || !Number.isInteger(v)) return 'tipo';
      return v >= tipo.min && v <= tipo.max ? 'ok' : 'fuoriIntervallo';
    case 'enum':
      if (typeof v !== 'string') return 'tipo';
      return tipo.values.includes(v) ? 'ok' : 'fuoriIntervallo';
    case 'bool':
      return typeof v === 'boolean' ? 'ok' : 'tipo';
  }
}
