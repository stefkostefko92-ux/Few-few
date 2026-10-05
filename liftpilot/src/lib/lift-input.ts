// Validation of the one form of an installation coming from the browser: the shaft (as a shaft design), the
// calculator's values (as a calculation) and the switches of the automatic values. The server derives everything
// again from these (src/lib/lift/derive.ts); nothing computed in the browser is taken.
import { z } from 'zod';
import { formValuesSchema } from './calc-input';
import { shaftInputsReadSchema, shaftInputsSchema } from './shaft-input';
import { BRANDS } from '@/lib/catalog/machines';
import { NORME_AGGIUNTIVE, NORME_COLLAUDO, PARTI } from '@/lib/lift/collaudo';

/** The acceptance test: its base standard, the standards added (absent: none), the parts replaced or changed and the
 *  renovation that keeps the existing sling (absent: none). */
export const collaudoSchema = z.object({
  norma: z.enum(NORME_COLLAUDO),
  aggiuntive: z.array(z.enum(NORME_AGGIUNTIVE)).max(NORME_AGGIUNTIVE.length).refine((a) => new Set(a).size === a.length, 'each standard once').optional(),
  parti: z.array(z.enum(PARTI)).max(PARTI.length),
  rifacimento: z.literal(true).optional(),
}).strict();

export const autoSchema = z.object({
  P: z.boolean(),
  machine: z.boolean(),
  L0: z.boolean(),
  dx: z.boolean(),
  Hv: z.boolean(),
}).strict();

const liftObject = <S extends z.ZodTypeAny>(shaft: S) => z.object({
  shaft,
  calc: formValuesSchema,
  auto: autoSchema,
  bottom: z.enum(['head', 'room', 'under']).optional(),
  catalog: z.object({ brand: z.enum(BRANDS), model: z.string().min(1).max(40).optional() }).strict().optional(),
  collaudo: collaudoSchema.optional(),
}).strict();

/** The one form as it is saved (today's rules). */
export const liftInputsSchema = liftObject(shaftInputsSchema);
/** A saved one form read back (the shaft as stored: shaftInputsReadSchema). */
export const liftInputsReadSchema = liftObject(shaftInputsReadSchema);
