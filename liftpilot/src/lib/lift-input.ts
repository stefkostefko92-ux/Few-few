// Validation of the one form of an installation coming from the browser: the shaft (as a shaft design), the
// calculator's values (as a calculation) and the switches of the automatic values. The server derives everything
// again from these (src/lib/lift/derive.ts); nothing computed in the browser is taken.
import { z } from 'zod';
import { formValuesSchema } from './calc-input';
import { shaftInputsReadSchema, shaftInputsSchema } from './shaft-input';
import { BRANDS } from '@/lib/catalog/machines';
import { NORME_AGGIUNTIVE, NORME_COLLAUDO, PARTI } from '@/lib/lift/collaudo';
import { MARCATURE, isServiceDay } from '@/lib/lift/modifica';

const DAY = /^(19|20)\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** The acceptance test: its base standard, the standards added (absent: none), the parts replaced or changed, the
 *  renovation that keeps the existing sling, the answer about the CE marking with the day the lift was put in service,
 *  the documented loads (absent: none). */
const collaudoObject = (day: z.ZodType<string>, kg: z.ZodType<number>) => z.object({
  norma: z.enum(NORME_COLLAUDO),
  aggiuntive: z.array(z.enum(NORME_AGGIUNTIVE)).max(NORME_AGGIUNTIVE.length).refine((a) => new Set(a).size === a.length, 'each standard once').optional(),
  parti: z.array(z.enum(PARTI)).max(PARTI.length),
  rifacimento: z.literal(true).optional(),
  marcatura: z.enum(MARCATURE).optional(),
  servizio: day.optional(),
  documentato: z.object({ Q: kg, P: kg, Mcw: kg }).strict().optional(),
}).strict();

/** The test as a new record saves it: a day of the calendar not after today, loads of a report (from 1 kg). */
export const collaudoSchema = collaudoObject(z.string().regex(DAY).refine((s) => isServiceDay(s), 'a day of the calendar, not after today'),
  z.number().finite().min(1).max(100_000));
/** The test as stored: what an earlier rule saved is read back (the record says whether it still reproduces). */
export const collaudoReadSchema = collaudoObject(z.string().regex(DAY), z.number().finite().positive().max(100_000));

export const autoSchema = z.object({
  P: z.boolean(),
  machine: z.boolean(),
  L0: z.boolean(),
  dx: z.boolean(),
  Hv: z.boolean(),
}).strict();

const liftObject = <S extends z.ZodTypeAny, C extends z.ZodTypeAny>(shaft: S, collaudo: C) => z.object({
  shaft,
  calc: formValuesSchema,
  auto: autoSchema,
  bottom: z.enum(['head', 'room', 'under']).optional(),
  catalog: z.object({ brand: z.enum(BRANDS), model: z.string().min(1).max(40).optional() }).strict().optional(),
  collaudo: collaudo.optional(),
}).strict();

/** The one form as it is saved (today's rules). */
export const liftInputsSchema = liftObject(shaftInputsSchema, collaudoSchema);
/** A saved one form read back (the shaft and the test as stored: shaftInputsReadSchema, collaudoReadSchema). */
export const liftInputsReadSchema = liftObject(shaftInputsReadSchema, collaudoReadSchema);
