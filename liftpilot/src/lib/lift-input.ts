// Validation of the one form of an installation coming from the browser: the shaft (as a shaft design), the
// calculator's values (as a calculation) and the switches of the automatic values. The server derives everything
// again from these (src/lib/lift/derive.ts); nothing computed in the browser is taken.
import { z } from 'zod';
import { formValuesSchema } from './calc-input';
import { shaftInputsSchema } from './shaft-input';
import { BRANDS } from '@/lib/catalog/machines';
import { NORME_AGGIUNTIVE, NORME_COLLAUDO, PARTI } from '@/lib/lift/collaudo';

/** The acceptance test: its base standard, the standards added (absent: none) and the parts replaced or changed. */
export const collaudoSchema = z.object({
  norma: z.enum(NORME_COLLAUDO),
  aggiuntive: z.array(z.enum(NORME_AGGIUNTIVE)).max(NORME_AGGIUNTIVE.length).optional(),
  parti: z.array(z.enum(PARTI)).max(PARTI.length),
}).strict();

export const autoSchema = z.object({
  P: z.boolean(),
  machine: z.boolean(),
  L0: z.boolean(),
  dx: z.boolean(),
  Hv: z.boolean(),
}).strict();

export const liftInputsSchema = z.object({
  shaft: shaftInputsSchema,
  calc: formValuesSchema,
  auto: autoSchema,
  bottom: z.enum(['head', 'room', 'under']).optional(),
  catalog: z.object({ brand: z.enum(BRANDS), model: z.string().min(1).max(40).optional() }).strict().optional(),
  collaudo: collaudoSchema.optional(),
}).strict();

export type LiftInputsParsed = z.infer<typeof liftInputsSchema>;
