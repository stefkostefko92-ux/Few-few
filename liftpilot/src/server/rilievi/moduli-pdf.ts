import 'server-only';
// The suppliers' blank official PDFs (assets/moduli/, copied byte for byte from rilievi) — checked by SHA-256 against
// the pin of their map (src/lib/rilievi/ordini/moduli.ts): another version of a module means other coordinates, and
// then no PDF is made (the route answers 500, the start check fails). Read once, then from memory.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MODULI, type Modulo } from '@/lib/rilievi/ordini/moduli';

/** The directory of the blank modules: assets/moduli under the application's root (the Docker image copies it). */
export const moduliDir = (): string => path.join(process.cwd(), 'assets', 'moduli');

const bytes = new Map<string, Uint8Array>();

/** The blank official PDF — checked by SHA-256 (at the first use, then from memory). */
export function moduloPdf(modulo: Modulo): Uint8Array {
  const cached = bytes.get(modulo.id);
  if (cached) return cached;
  const data = readFileSync(path.join(moduliDir(), modulo.file));
  const sha = createHash('sha256').update(data).digest('hex');
  if (sha !== modulo.sha256) throw new Error(`${modulo.file}: another version of the module (SHA-256 ${sha}) — the map does not fit`);
  const copy = new Uint8Array(data);
  bytes.set(modulo.id, copy);
  return copy;
}

/** The start check: every module (Pelazza, MoviLift, the argano sheet, 2SG, Mastech NG120 and QI Touch) is in place and
 *  exactly the version of its map. */
export function assertModuli(): void {
  for (const modulo of MODULI) moduloPdf(modulo);
}
