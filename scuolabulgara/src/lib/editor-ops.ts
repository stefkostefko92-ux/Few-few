import { LOCALES, type Locale } from "./i18n";
import { isSharedKey } from "./cms";

// Pure editing operations for the content editor (unit-tested in
// __tests__/editor-ops.test.ts). The rules they enforce:
//  - TEXT belongs to one language;
//  - PICTURES, icons, numbers, links and contact details are shared by all three;
//  - STRUCTURE — how many photos/questions/cards there are and in what order —
//    is shared too, so the three languages can never drift out of step.

export type Doc = Record<string, unknown>;
export type Data = Record<Locale, Doc>;
export type Path = (string | number)[];

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function getAt(root: unknown, path: Path): unknown {
  let cur: unknown = root;
  for (const p of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[p];
  }
  return cur;
}

/** Value with every text emptied and every list cleared — the shape of a new item. */
export function blankClone(v: unknown): unknown {
  if (typeof v === "string") return "";
  if (Array.isArray(v)) return [];
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Doc).map(([k, x]) => [k, blankClone(x)]));
  }
  return v;
}

/** The field a path edits: for `photos[1].src` that is `src`; for `keywords[2]`
 *  (a string inside a list) it is the list, `keywords`. */
export function fieldOf(path: Path): string {
  const last = path[path.length - 1];
  return typeof last === "number" ? String(path[path.length - 2] ?? "") : String(last);
}

function setIn(doc: Doc, path: Path, value: unknown): Doc {
  const parent = getAt(doc, path.slice(0, -1));
  if (parent === null || typeof parent !== "object") return doc; // path missing in this language
  const last = path[path.length - 1];
  if (Array.isArray(parent) && (typeof last !== "number" || last >= parent.length)) return doc;
  const next = clone(doc);
  (getAt(next, path.slice(0, -1)) as Record<string | number, unknown>)[last] = value;
  return next;
}

/** Set a value. Shared fields are written to every language at once. */
export function setValue(data: Data, locale: Locale, path: Path, value: unknown): Data {
  const targets = isSharedKey(fieldOf(path)) ? LOCALES : [locale];
  const next = { ...data };
  for (const l of targets) next[l] = setIn(data[l], path, value);
  return next;
}

function mapArray(data: Data, path: Path, fn: (arr: unknown[], l: Locale) => void): Data {
  const next = { ...data };
  for (const l of LOCALES) {
    const doc = clone(data[l]);
    const arr = getAt(doc, path);
    if (Array.isArray(arr)) {
      fn(arr, l);
      next[l] = doc;
    }
  }
  return next;
}

/**
 * Append an item to a list in every language. Each language gets a blank copy
 * of its own last item; a list emptied everywhere falls back to `template`
 * (the shape from the bundled defaults), so it can always be refilled.
 */
export function addItem(data: Data, path: Path, template: unknown): Data {
  const sample = LOCALES.map((l) => getAt(data[l], path)).find(
    (a): a is unknown[] => Array.isArray(a) && a.length > 0,
  );
  const fallback = blankClone(sample ? sample[sample.length - 1] : template ?? "");
  return mapArray(data, path, (arr) => {
    arr.push(arr.length ? blankClone(arr[arr.length - 1]) : clone(fallback));
  });
}

export function removeItem(data: Data, path: Path, index: number): Data {
  return mapArray(data, path, (arr) => {
    if (index >= 0 && index < arr.length) arr.splice(index, 1);
  });
}

/** Move an item one step up (-1) or down (+1) in every language. */
export function moveItem(data: Data, path: Path, index: number, dir: -1 | 1): Data {
  return mapArray(data, path, (arr) => {
    const j = index + dir;
    if (index < 0 || index >= arr.length || j < 0 || j >= arr.length) return;
    [arr[index], arr[j]] = [arr[j], arr[index]];
  });
}

/** Path of the matching list in the defaults: every index becomes 0. */
export const templatePath = (path: Path): Path => path.map((p) => (typeof p === "number" ? 0 : p));

/** Write a different value per language in one step — e.g. the three
 *  descriptions of a newly chosen photo. A language the path doesn't exist in
 *  is left untouched. */
export function setPerLocale(data: Data, path: Path, values: Record<Locale, unknown>): Data {
  const next = { ...data };
  for (const l of LOCALES) next[l] = setIn(data[l], path, values[l]);
  return next;
}
