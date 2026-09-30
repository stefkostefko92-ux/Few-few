// Validation of the one form of an installation coming from the browser: the shaft (as a shaft design), the
// calculator's values (as a calculation) and the switches of the automatic values. The server derives everything
// again from these (src/lib/lift/derive.ts); nothing computed in the browser is taken.
import { z } from 'zod';
import { formValuesSchema } from './calc-input';
import { shaftInputsSchema } from './shaft-input';

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
}).strict();

export type LiftInputsParsed = z.infer<typeof liftInputsSchema>;
