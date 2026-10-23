import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../src/paths.js';

/**
 * The editor is untyped browser JS: a static import from a .test.ts would need declarations, so its
 * modules are loaded by path and checked to export what the test calls. Only pure parts are tested
 * this way; the stand-ins below are the few browser globals those modules touch, not a DOM.
 */
export async function editorModule<T extends object>(
  file: string,
  names: readonly string[],
): Promise<T> {
  return browserModule<T>(`editor/${file}`, names);
}

/** The same for the landing page's browser code (`landing/…`), or any other untyped module by path. */
export async function browserModule<T extends object>(
  path: string,
  names: readonly string[],
): Promise<T> {
  const mod: unknown = await import(pathToFileURL(join(ROOT, path)).href);
  if (!exports<T>(mod, names)) throw new Error(`${path} no longer exports ${names.join(', ')}`);
  return mod;
}

function exports<T>(mod: unknown, names: readonly string[]): mod is T {
  return typeof mod === 'object' && mod !== null && names.every((name) => name in mod);
}

/** dom.js reads matchMedia when it loads; anything else a test needs is passed in. */
export function browserGlobals(globals: Record<string, unknown> = {}): void {
  Object.assign(globalThis, {
    window: { matchMedia: () => ({ matches: false }), setTimeout, clearTimeout },
    ...globals,
  });
}
