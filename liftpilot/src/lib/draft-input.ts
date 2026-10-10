// A form's draft as the browser sends it and the server keeps it (src/server/drafts.ts): the installation's one form
// (its inputs and the values still to enter), a replacement's calculator (its values as typed and the standards of its
// test), a calculation's machine room survey (its measures and those still to enter). The inputs are kept in the ranges
// a record accepts: a value being typed out of range is not kept until it is back in range.
import { z } from 'zod';
import { formValuesSchema } from './calc-input';
import { collaudoSchema, liftInputsReadSchema } from './lift-input';
import { isBlankKey, type BlankKey } from './lift/blank';
import { isSurveyField, surveySchema, type SurveyField } from './room/survey';

/** "lift" (the one form of a whole project), "calc" (a replacement's calculator), "room:<calculation>" (its survey). */
export const draftScopeSchema = z.union([z.literal('lift'), z.literal('calc'), z.string().regex(/^room:[a-z0-9]{1,40}$/i)]);
export type DraftScope = z.infer<typeof draftScopeSchema>;

export const liftDraftSchema = z.object({
  inputs: liftInputsReadSchema,
  blank: z.array(z.custom<BlankKey>((s) => typeof s === 'string' && isBlankKey(s))).max(400),
}).strict();

export const calcDraftSchema = z.object({ values: formValuesSchema, collaudo: collaudoSchema.nullable() }).strict();

export const surveyDraftSchema = z.object({
  survey: surveySchema,
  blank: z.array(z.custom<SurveyField>((s) => typeof s === 'string' && isSurveyField(s))).max(40),
}).strict();

/** The schema of a scope's draft. */
export const draftSchemaOf = (scope: DraftScope) => (scope === 'lift' ? liftDraftSchema : scope === 'calc' ? calcDraftSchema : surveyDraftSchema);

/** The largest draft kept [characters of its JSON]. */
export const DRAFT_MAX = 200_000;
