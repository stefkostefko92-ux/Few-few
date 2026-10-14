// Form values accepted by the server: only the ids of the form, short strings, finite numbers or booleans.
import { z } from 'zod';
import type { FormValues } from '@/calc/types';
import { FIELD_IDS, shown } from '@/components/calc/fields';

const value = z.union([z.string().max(32), z.number().finite(), z.boolean()]);
export const formValuesSchema = z.object(Object.fromEntries(FIELD_IDS.map((id) => [id, value.optional()]))).strict();

/** Flagged fields the user can see (the prototype flags only visible rows; old-machine rows count when compared). */
export function visibleBad(bad: readonly string[], V: FormValues): string[] {
  return [...new Set(bad)].filter((id) => shown(id, V) && (!id.startsWith('o_') || !!V.compare));
}
