// Round 45: no code reads or writes Project.kind (the module of an installation before the type of intervention became
// a fact of «Calcolo argano»). The column stays in the database — with its enum and index, marked deprecated in the
// schema — until a later migration drops it after the owner's explicit confirmation; until then the Prisma client
// leaves it out of every query (src/lib/db.ts) and the company export does not carry it (format 9). This test reads the
// source of the application and of its scripts and pins that nothing reaches for it again: the type, its schema, the
// rule that chose a form by it, the upgrade, a read of `.kind` on an installation, a raw query naming the column, a
// comparison or a write of its two values, a select of it or an omit turned off; and the client's type of a project row
// has no `kind` at all (a read through any variable does not compile).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { prisma } from '@/lib/db';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SELF = fileURLToPath(import.meta.url);
/** The test that sends an old form's `kind` on purpose and pins that the upgrade action is gone. */
const PINS_ABSENCE = join(ROOT, 'src/server/__tests__/project-actions.test.ts');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : files(p);
    return /\.(ts|tsx|mts|mjs)$/.test(name) && p !== SELF && p !== PINS_ABSENCE ? [p] : [];
  });
}

/** What a read or a write of Project.kind looks like in the code (the client's types leave it out too: src/lib/db.ts).
 *  Other things called `kind` (a rail's, a support's, a record's) are not it. */
const KIND = [
  /\bProjectKind\b/, /\bprojectKindSchema\b/, /\bformRightOf\b/, /\bupgradeProjectAction\b/, /\b(?:project|impianto)\??\.kind\b/,
  /\bkind\s*(?:===|!==|=|:)\s*'(?:REPLACEMENT|FULL)'/, /p\."kind"|"Project"\."kind"/, /\b(?:kind|module)_(?:REPLACEMENT|FULL)\b/,
];

/** The two ways a query would still return the column despite the global omit: selecting it, or omitting it «false».
 *  Only the omits that keep it out may name it (the client, the export, the export's test). */
const SELECT_KIND = /\bkind\s*:\s*(?:true|false)\b/;
const OMITS = ['src/lib/db.ts', 'src/server/company-export.ts', 'src/server/__tests__/company-export.test.ts'];

test('nessun codice legge o scrive Project.kind (src/ e scripts/)', () => {
  const hits = [...files(join(ROOT, 'src')), ...files(join(ROOT, 'scripts'))].flatMap((f) => {
    const allowed = OMITS.includes(relative(ROOT, f));
    return readFileSync(f, 'utf8').split('\n').flatMap((line, i) =>
      (KIND.some((re) => re.test(line)) || (!allowed && SELECT_KIND.test(line)) || (allowed && /\bkind\s*:\s*false\b/.test(line))
        ? [`${relative(ROOT, f)}:${i + 1}: ${line.trim()}`] : []));
  });
  assert.deepEqual(hits, []);
});

// at compile time (npm run typecheck): a project row of the client has no `kind`, whatever variable holds it — a read of
// `.kind` on one does not compile (the global omit of src/lib/db.ts)
type ProjectRow = NonNullable<Awaited<ReturnType<typeof prisma.project.findFirst<{ where: { id: string } }>>>>;
const kindInRow: 'kind' extends keyof ProjectRow ? true : false = false;
const nameInRow: 'name' extends keyof ProjectRow ? true : false = true;

test('il tipo delle righe di Project del client non ha kind', () => {
  assert.deepEqual([kindInRow, nameInRow], [false, true]);
});

test('la colonna resta, segnata deprecata; il client la lascia fuori; l’esportazione non la porta', () => {
  const schema = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8');
  assert.match(schema, /deprecated — dropped by a later migration after the owner's confirmation[^\n]*\n[^\n]*\n\s*kind\s+ProjectKind\s+@default\(FULL\)/);
  assert.match(readFileSync(join(ROOT, 'src/lib/db.ts'), 'utf8'), /omit: \{ project: \{ kind: true \} \}/);
  assert.match(readFileSync(join(ROOT, 'src/server/company-export.ts'), 'utf8'), /omit: \{ kind: true \}/);
  // the destructive migration is not written in this round: it waits for the owner's confirmation
  assert.ok(!readdirSync(join(ROOT, 'prisma/migrations')).some((m) => /drop_project_kind/.test(m)));
});
