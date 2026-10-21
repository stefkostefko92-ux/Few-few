// The relazione tecnica di modifica's inputs as the workspace edits them: one object (src/lib/rt/input.ts RtInputs),
// read and written by a dotted path («componenti.quadro.tensioneComando»); writing undefined removes the key, and a
// group left empty goes with it, so the draft keeps only what was typed. Plus the draft schema's problems by path.
// Pure (client and server).
import { rtDraftSchema, type RtInputs } from '@/lib/rt/input';

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);

export function getAt(o: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((x, k) => (isObj(x) ? x[k] : undefined), o);
}

/** The object without the key. */
const senza = (o: Obj, k: string): Obj => Object.fromEntries(Object.entries(o).filter(([x]) => x !== k));

function setIn(o: Obj, keys: readonly string[], value: unknown): Obj {
  const [k, ...rest] = keys;
  if (k === undefined) return o;
  if (!rest.length) return value === undefined ? senza(o, k) : { ...o, [k]: value };
  const child = setIn(isObj(o[k]) ? (o[k] as Obj) : {}, rest, value);
  return Object.keys(child).length ? { ...o, [k]: child } : senza(o, k);
}

/** Any object with the value at `path` (undefined: removed, with the groups it leaves empty). */
export const setPath = (o: Obj, path: string, value: unknown): Obj => setIn(o, path.split('.'), value);

/** The inputs with the value at `path` (undefined: removed, with the groups it leaves empty). */
export const setAt = (o: RtInputs, path: string, value: unknown): RtInputs => setPath(o as Obj, path, value) as RtInputs;

/** The draft schema's problems, by the path of the field (the first per field). */
export function problemi(inputs: RtInputs): Map<string, string> {
  const r = rtDraftSchema.safeParse(inputs), out = new Map<string, string>();
  if (!r.success) for (const i of r.error.issues) { const p = i.path.join('.'); if (!out.has(p)) out.set(p, i.code); }
  return out;
}

/** A number typed in a field: «12,5» and «12.5» alike; empty or not a number: none. */
export function numero(s: string): number | undefined {
  const t = s.trim().replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}
