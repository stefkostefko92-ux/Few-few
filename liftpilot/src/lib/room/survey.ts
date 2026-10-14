// The machine room of a machine replacement as surveyed on site (src/lib/room): the room over the shaft (its size,
// height, slab, door, control panel and what the new machine stands on: room.ts), the shaft under it (inner size and
// walls) and where the existing ropes come up through the slab — the car's drop and the counterweight's, measured from
// the shaft's inner corner on the side of entrance A (x along that wall, y into the shaft); and, when found, the existing
// governor, the slab's existing openings and the existing machine's support. Millimetres as whole numbers; the
// browser's values are validated here as the save validates them.
import { z } from 'zod';
import { roomSchema, supportAtLeastProfile } from '@/lib/shaft-input';
import { DEFAULT_ROOM } from '@/shaft/room';

const mm = (min: number, max: number) => z.number().int().min(min).max(max);
const point = z.object({ x: mm(0, 10000), y: mm(0, 10000) }).strict();

/** What else the survey finds in the room (round 36, all optional): the existing governor on the floor — the middle of
 *  its footprint from the room's inner corner (x from the left wall, y from the front wall), its size along x and y,
 *  whether its ropes go down through the slab under it —; the slab's existing openings (their middles from the same
 *  corner and their sizes); what the existing machine stands on and whether it stays. */
const governorSchema = z.object({ x: mm(0, 10000), y: mm(0, 10000), W: mm(100, 2000), D: mm(100, 2000), ropes: z.boolean() }).strict();
const openingSchema = z.object({ x: mm(0, 10000), y: mm(0, 10000), W: mm(20, 3000), D: mm(20, 3000) }).strict();
export const EXISTING_SUPPORTS = ['shims', 'frame', 'beams', 'plinth', 'unknown'] as const;
const existingSupportSchema = z.object({ kind: z.enum(EXISTING_SUPPORTS), keep: z.boolean() }).strict();

export const surveySchema = z.object({
  room: roomSchema,
  shaft: z.object({ W: mm(500, 10000), D: mm(500, 10000), wall: mm(50, 1000) }).strict(),
  car: point,
  cw: point,
  governor: governorSchema.optional(),
  openings: z.array(openingSchema).max(12).optional(),
  existingSupport: existingSupportSchema.optional(),
}).strict();

export type SurveyGovernor = z.infer<typeof governorSchema>;
export type SurveyOpening = z.infer<typeof openingSchema>;

export type Survey = z.infer<typeof surveySchema>;

/** A survey as a new record must be (the save and the edits on the drawings): the stored shape and its rules. */
export const surveySaveSchema = surveySchema.superRefine((S, ctx) => supportAtLeastProfile(S.room.support, ctx));

/** The survey a new machine room starts from: the room and the shaft of the software's example (to be replaced with the
 *  measures), the car's drop in the middle of the shaft and the counterweight's behind it at the calculation's spacing
 *  `calata` [mm] (its direct pull: the existing sheave; else the new one). */
export function startSurvey(calata: number): Survey {
  const W = 1600, D = 1750, carY = Math.round(Math.max(300, (D - calata) / 2));
  return {
    room: DEFAULT_ROOM, shaft: { W, D, wall: 200 },
    car: { x: W / 2, y: carY }, cw: { x: W / 2, y: Math.min(D - 100, Math.round(carY + calata)) },
  };
}

/** The measures of a survey, in the form's order: the room's (its ridge stays optional: none is a flat roof), the
 *  shaft's, the drops'. A new survey starts with each of them to enter. */
export const SURVEY_FIELDS = ['room.W', 'room.D', 'room.shaftX', 'room.shaftY', 'room.H', 'room.slab', 'room.doorWall', 'room.doorAt', 'room.doorW', 'room.doorH',
  'room.panelWall', 'room.panelAt', 'room.panelW', 'room.panelD', 'room.panelH', 'shaft.W', 'shaft.D', 'shaft.wall', 'car.x', 'car.y', 'cw.x', 'cw.y'] as const;
export type SurveyField = (typeof SURVEY_FIELDS)[number];
export const isSurveyField = (s: string): s is SurveyField => (SURVEY_FIELDS as readonly string[]).includes(s);

/** A survey as it is being filled in: the values and the measures still to enter (their placeholders never shown). */
export interface SurveyDraft {
  survey: Survey;
  blank: readonly SurveyField[];
}

/** A brand new survey: every measure to enter; the calculation's spacing `calata` [mm] only places the placeholders. */
export function blankSurvey(calata: number): SurveyDraft {
  return { survey: { ...startSurvey(calata), room: { ...DEFAULT_ROOM, ridge: 0 } }, blank: [...SURVEY_FIELDS] };
}
