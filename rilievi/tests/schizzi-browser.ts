// The browser's geometry and rules (public/js/schizzo-forme.js, schizzo-regole.js, schizzo-aggancio.js),
// run in node:vm as the page runs them — for the parity tests (schizzi-forme.test.ts, schizzi-regole.test.ts).
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import type { ElementoDisegno, Primitivo } from '../src/schizzi/forme.js';
import { VISTA_SCHIZZO } from '../src/schizzi/model.js';

export interface Browser {
  primitivesOf: (el: ElementoDisegno) => Primitivo[];
  valido: (el: unknown) => boolean;
  normalizza: (el: unknown) => Record<string, unknown> | null;
  pesoDi: (el: unknown) => number;
  moved: (el: unknown, dx: number, dy: number) => Record<string, unknown>;
  limitMove: (els: unknown[], dx: number, dy: number) => [number, number];
  snap: (p: unknown, options: unknown) => { p: { x: number; y: number }; kind: string | null };
}

/** The three files in one context, the sizes through JSON (as the page gets `schizzi-vista`). */
export function browser(): Browser {
  const window: Record<string, unknown> = {};
  const context = { window };
  for (const file of ['schizzo-forme', 'schizzo-regole', 'schizzo-aggancio']) {
    runInNewContext(readFileSync(`public/js/${file}.js`, 'utf8'), context);
  }
  const view: unknown = JSON.parse(JSON.stringify(VISTA_SCHIZZO));
  const forme = (window.rilieviForme as (v: unknown) => Browser)(view);
  const regole = (window.rilieviRegole as (v: unknown, f: unknown) => Browser)(view, forme);
  const aggancio = (window.rilieviSchizzoAggancio as (v: unknown, r: unknown) => Browser)(
    view,
    regole,
  );
  return { ...forme, ...regole, snap: aggancio.snap };
}

/** Values that cross a JSON boundary, compared as plain data. */
export const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
