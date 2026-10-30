// A form's draft as the browser sends it and the server keeps it (src/server/drafts.ts): the Progetto (round 45: the
// drawing's geometry, the «Calcolo argano» it is drawn on and the values still to enter — a draft of the one form before
// it no longer reads, and is overwritten by the next one), «Calcolo argano» (its values as typed, the type of intervention, the parts
// answered and the standards of its test), a calculation's machine room survey (its measures and those still to
// enter), the relazione tecnica di modifica of an installation (round 49: its inputs as typed, and the issued RT a
// revision is being prepared of). The inputs are kept in the ranges a record accepts: a value being typed out of range is
// not kept until it is back in range.
import { z } from 'zod';
import { formValuesSchema } from './calc-input';
import { collaudoSchema, progettoInputsReadSchema } from './lift-input';
import { isBlankKey, type BlankKey } from './lift/blank';
import { PARTI } from './lift/collaudo';
import { TIPI_INTERVENTO } from './lift/intervento';
import { isSurveyField, surveySchema, type SurveyField } from './room/survey';
import { rtDraftSchema } from './rt/input';
import { rt2DraftSchema } from './rt2/input';

/** "lift" (the Progetto's drawing), "calc" («Calcolo argano»), "room:<calculation>" (its machine room's survey), "rt"
 *  (the installation's relazione tecnica di modifica, round 49), "rt2" (the same after the owner's model, round 52). */
export const draftScopeSchema = z.union([z.literal('lift'), z.literal('calc'), z.literal('rt'), z.literal('rt2'), z.string().regex(/^room:[a-z0-9]{1,40}$/i)]);
export type DraftScope = z.infer<typeof draftScopeSchema>;

/** The fields of the form still marked «dal rilievo» (round 44): the start reads them again only where the value is
 *  still the linked survey's (src/server/collega/forms.ts), so that the marks come back with the draft. */
const rilievoSchema = z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,23}$/)).max(60).optional();
/** The form started from the survey (its notice said so): only then do the fields it kept marked say it again — a value
 *  put in by «usa» on a saved record continued is marked, but is no start from the survey. */
const parteSchema = z.literal(true).optional();

export const liftDraftSchema = z.object({
  progetto: progettoInputsReadSchema,
  /** the «Calcolo argano» the drawing was being made on */
  base: z.string().regex(/^[a-z0-9]{1,40}$/i).optional(),
  blank: z.array(z.custom<BlankKey>((s) => typeof s === 'string' && isBlankKey(s))).max(400),
  rilievo: rilievoSchema,
  parte: parteSchema,
}).strict();

/** The calculator's draft: its values and test as typed (with the logbook's speed and travel and the existing
 *  controller's regulation, round 46: as a record saves them), the type of intervention chosen and the parts answered
 *  (round 45; absent in the drafts before it: the type read by their shape, or left to choose on a blank start). */
export const calcDraftSchema = z.object({
  values: formValuesSchema, collaudo: collaudoSchema.nullable(), intervento: z.enum(TIPI_INTERVENTO).optional(),
  risposte: z.array(z.enum(PARTI)).max(PARTI.length).optional(), rilievo: rilievoSchema, parte: parteSchema,
}).strict();

export const surveyDraftSchema = z.object({
  survey: surveySchema,
  blank: z.array(z.custom<SurveyField>((s) => typeof s === 'string' && isSurveyField(s))).max(40),
}).strict();

/** The relazione tecnica di modifica's draft (round 49): its inputs as typed (src/lib/rt/input.ts rtDraftSchema) and,
 *  while a revision is prepared, the issued RT it revises. */
export const rtDraftDataSchema = z.object({ inputs: rtDraftSchema, revisionOf: z.string().regex(/^[a-z0-9]{1,40}$/i).optional() }).strict();
export type RtDraftData = z.infer<typeof rtDraftDataSchema>;

export const rt2DraftDataSchema = z.object({ inputs: rt2DraftSchema, revisionOf: z.string().regex(/^[a-z0-9]{1,40}$/i).optional() }).strict();
export type Rt2DraftData = z.infer<typeof rt2DraftDataSchema>;

/** The schema of a scope's draft. */
export const draftSchemaOf = (scope: DraftScope) => (scope === 'lift' ? liftDraftSchema : scope === 'calc' ? calcDraftSchema : scope === 'rt' ? rtDraftDataSchema
  : scope === 'rt2' ? rt2DraftDataSchema : surveyDraftSchema);

/** The largest draft kept [characters of its JSON]. */
export const DRAFT_MAX = 200_000;
