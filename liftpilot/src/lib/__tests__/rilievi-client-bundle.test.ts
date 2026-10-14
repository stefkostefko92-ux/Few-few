// Rilievi — what the sheet's form sends to the browser: the client components import nothing that holds the suppliers'
// maps with their PDF coordinates (ordini/moduli.ts and the modules that import it), only plain data handed as props
// (moduloSpec, collegatiData). Followed through the real imports (type-only imports are erased; the server actions are
// references), from every 'use client' file of src/components/rilievi.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { SCHEDA_KEY } from '@/lib/rilievi/action-state';
import { AUTO_KEY as AUTO_LIGHT } from '@/lib/rilievi/ordini/auto-key';
import { AUTO_KEY } from '@/lib/rilievi/ordini/collegamenti';

const SRC = resolve(import.meta.dirname, '../..');
const MAPS = join(SRC, 'lib/rilievi/ordini/moduli.ts');

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) if (existsSync(candidate) && candidate.match(/\.tsx?$/)) return candidate;
  return null;
}

/** The files a module pulls in at run time (`import … from`, `export … from`), without `import type` / `export type`.
 *  A 'use server' module is not followed: the browser gets references to its actions, not its code. */
function runtimeImports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  if (/^'use server';/.test(text)) return [];
  const out: string[] = [];
  for (const m of text.matchAll(/^\s*(import|export)\s+(type\s+)?[^;]*?from\s+'([^']+)'/gm)) {
    if (m[2]) continue;
    const target = resolveImport(file, m[3] ?? '');
    if (target) out.push(target);
  }
  return out;
}

function reaches(start: string, target: string): string[] | null {
  const seen = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const file = queue.shift() as string;
    if (file === target) {
      const path = [file];
      for (let p = seen.get(file); p; p = seen.get(p)) path.unshift(p);
      return path;
    }
    for (const next of runtimeImports(file)) {
      if (seen.has(next)) continue;
      seen.set(next, file);
      queue.push(next);
    }
  }
  return null;
}

describe('rilievi: the browser gets no supplier maps', () => {
  const dir = join(SRC, 'components/rilievi');
  const clients = readdirSync(dir)
    .map((f) => join(dir, f))
    .filter((f) => /\.tsx?$/.test(f) && /^'use client';/.test(readFileSync(f, 'utf8')));

  it('finds the client components', () => {
    assert.ok(clients.some((f) => f.endsWith('SchedaForm.tsx')) && clients.some((f) => f.endsWith('use-scheda-form.ts')));
  });

  for (const file of clients) {
    it(`${file.slice(SRC.length + 1)} does not import ordini/moduli.ts`, () => {
      assert.equal(reaches(file, MAPS)?.map((f) => f.slice(SRC.length + 1)).join(' → ') ?? null, null);
    });
  }

  it('the names the form sends: collegati-auto (the same in both modules), the edited sheet not as `id`', () => {
    assert.equal(AUTO_LIGHT, AUTO_KEY);
    assert.notEqual(SCHEDA_KEY, 'id');
  });
});
