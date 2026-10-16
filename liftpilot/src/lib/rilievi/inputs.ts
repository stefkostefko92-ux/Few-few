// Every external input of the survey sheets besides the sheet's fields (validation.ts): the form as rilievi's server read
// it, a sheet's id, the version the form was opened on, the list's search and page. Pure (the UI uses the same schemas).
import { z } from 'zod';
import { searchQuery } from '../search-query';
import { MAX_QUERY_LENGTH } from './search';

/** At most this many fields in one form: rilievi's `parameterLimit` (300 stops × 6 cells + the modules + the sheet). */
export const MAX_FORM_FIELDS = 2500;

/** The form read as `express.urlencoded({ extended: false })` read it in rilievi: a null-prototype record, one string per
 *  key, an array of strings for a repeated key (the ticks); a file where text belongs is kept as null, so its field fails
 *  as forged (`invalid`). null when the form has more fields than MAX_FORM_FIELDS (rilievi answered 413). */
export function bodyOf(fd: FormData): Record<string, string | null | (string | null)[]> | null {
  if (!(fd instanceof FormData)) return Object.create(null) as Record<string, never>;
  const out = Object.create(null) as Record<string, string | null | (string | null)[]>;
  let count = 0;
  for (const [key, value] of fd.entries()) {
    count += 1;
    if (count > MAX_FORM_FIELDS) return null;
    const v = typeof value === 'string' ? value : null;
    const before = out[key];
    out[key] = before === undefined ? v : Array.isArray(before) ? [...before, v] : [before, v];
  }
  return out;
}

/** A sheet's id (a cuid): anything else is "not found" before any query. */
export const schedaIdSchema = z.string().regex(/^[a-z0-9]{20,40}$/);

/** A form's write key (action-state.ts WRITE_KEY): a UUID as the browser makes it, lower case; anything else is no key. */
export const writeKeySchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

/** The version of the sheet the edit form was opened on (`updatedAt` as ISO 8601); a wrong one reads as a conflict. */
export const baseSchema = z.string().max(64);

/** The list's search words, as typed without control characters (search-query.ts; cut to 100 characters; the words are
 *  found by search.ts queryTokens). */
export const querySchema = z.preprocess((v) => searchQuery(v).slice(0, MAX_QUERY_LENGTH), z.string());

/** The list's page: a whole number 1..10000, anything else is page 1. */
export const pageSchema = z.preprocess((v) => {
  const n = typeof v === 'string' ? Number.parseInt(v, 10) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}, z.number().int().min(1).max(10_000));

/** The list's address: `?q=` and `?p=` (the trash has the same). */
export const listParamsSchema = z.object({ q: querySchema, p: pageSchema });
export type ListParams = z.output<typeof listParamsSchema>;
