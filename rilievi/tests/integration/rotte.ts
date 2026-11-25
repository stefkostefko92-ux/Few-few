// The POST routes of the portal, read from the router itself (the audit of 12 November 2026: about 120 routes
// keep their guards "by hand" — nothing checked that a new one does). Used by rotte.test.ts.
import type { Express } from 'express';

interface Layer {
  route?: { path: string | string[]; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
}

const ID = 'cm000000000000000000000x';
const TOKEN = 'a'.repeat(64);

/** A path of the router with its parameters filled with values of the right shape that exist nowhere. */
export const concreto = (path: string): string =>
  path
    .replace(/:token\b/g, TOKEN)
    .replace(/:fornitore\b/g, 'microsoft')
    .replace(/:sezione\b/g, 'quadro')
    .replace(/:modello\b/g, 'classico')
    .replace(/:n\b/g, '1')
    .replace(/:[A-Za-z]+\b/g, ID);

/** Every POST route mounted on the application, in the order of the router, without duplicates. */
export function rottePost(app: Express): string[] {
  const out: string[] = [];
  const walk = (stack: Layer[]): void => {
    for (const layer of stack) {
      if (layer.route?.methods.post) {
        for (const p of [layer.route.path].flat()) if (!out.includes(p)) out.push(p);
      } else if (layer.handle?.stack) walk(layer.handle.stack);
    }
  };
  walk((app as unknown as { router: { stack: Layer[] } }).router.stack);
  return out;
}
