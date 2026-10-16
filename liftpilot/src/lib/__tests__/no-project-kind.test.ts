// Round 45: no code reads or writes Project.kind (the module of an installation before the type of intervention became
// a fact of «Calcolo argano»). Round 47 (the owner's confirmation, decision D3): the release before the drop made the
// field @ignore — the client named the column in no query at all (the global omit of rounds 45–46 kept it out of reads
// but still wrote its default on every INSERT) —, then migration 22_drop_project_kind drops the column, its index and
// the enum ProjectKind, in its own release. This test reads the source of the application and of its scripts and pins
// that nothing reaches for it again: the type, its schema, the rule that chose a form by it, the upgrade, a read of
// `.kind` on an installation, a raw query naming the column, a comparison or a write of its two values, a select or an
// omit of it; the client's type of a project row and its scalar fields have no `kind` at all (a read through any
// variable does not compile); the schema has neither the field nor the enum, and migration 22 says how to go back
// (round 47 review: never pinned as the last migration).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Prisma } from '@prisma/client';
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

/** What a read or a write of Project.kind looks like in the code (the client's types have no such field).
 *  Other things called `kind` (a rail's, a support's, a record's) are not it. */
const KIND = [
  /\bProjectKind\b/, /\bprojectKindSchema\b/, /\bformRightOf\b/, /\bupgradeProjectAction\b/, /\b(?:project|impianto)\??\.kind\b/,
  /\bkind\s*(?:===|!==|=|:)\s*'(?:REPLACEMENT|FULL)'/, /p\."kind"|"Project"\."kind"/, /\b(?:kind|module)_(?:REPLACEMENT|FULL)\b/,
];

/** A select or an omit of the column (round 47: the column is gone, no query may name it). */
const SELECT_KIND = /\bkind\s*:\s*(?:true|false)\b/;

test('nessun codice legge o scrive Project.kind (src/ e scripts/)', () => {
  const hits = [...files(join(ROOT, 'src')), ...files(join(ROOT, 'scripts'))].flatMap((f) =>
    readFileSync(f, 'utf8').split('\n').flatMap((line, i) =>
      (KIND.some((re) => re.test(line)) || SELECT_KIND.test(line) ? [`${relative(ROOT, f)}:${i + 1}: ${line.trim()}`] : [])));
  assert.deepEqual(hits, []);
});

// at compile time (npm run typecheck): a project row of the client has no `kind`, whatever variable holds it — a read of
// `.kind` on one does not compile (round 47: @ignore, then migration 22)
type ProjectRow = NonNullable<Awaited<ReturnType<typeof prisma.project.findFirst<{ where: { id: string } }>>>>;
const kindInRow: 'kind' extends keyof ProjectRow ? true : false = false;
const nameInRow: 'name' extends keyof ProjectRow ? true : false = true;

test('il tipo delle righe di Project del client non ha kind, né i suoi campi', () => {
  assert.deepEqual([kindInRow, nameInRow], [false, true]);
  assert.ok(!Object.keys(Prisma.ProjectScalarFieldEnum).includes('kind'));
  assert.ok(Object.keys(Prisma.ProjectScalarFieldEnum).includes('name'));
});

test('la migrazione 22 toglie colonna, indice ed enum, con il ritorno indietro; lo schema non li ha; nessun omit', () => {
  const schema = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8');
  assert.doesNotMatch(schema, /\bProjectKind\b/);
  const model = schema.slice(schema.indexOf('model Project {'), schema.indexOf('\n}', schema.indexOf('model Project {')));
  assert.ok(model.includes('name '), 'the Project model found');
  assert.doesNotMatch(model, /^\s*kind\s/m, 'Project has no field called kind');
  assert.doesNotMatch(model, /@@index\(\[companyId, kind\]\)/);
  assert.doesNotMatch(readFileSync(join(ROOT, 'src/lib/db.ts'), 'utf8'), /omit:/);
  assert.doesNotMatch(readFileSync(join(ROOT, 'src/server/company-export.ts'), 'utf8'), /omit: \{ kind/);
  // its own migration: there (never required to be the last — the next schema change comes after it), its statements,
  // and in its header the way back (the column, its values from the lasting ids file, the index)
  assert.ok(readdirSync(join(ROOT, 'prisma/migrations')).includes('22_drop_project_kind'));
  const sql = readFileSync(join(ROOT, 'prisma/migrations/22_drop_project_kind/migration.sql'), 'utf8');
  const statements = sql.split('\n').filter((l) => l.trim() && !l.startsWith('--'));
  assert.deepEqual(statements, ['DROP INDEX "Project_companyId_kind_idx";', 'ALTER TABLE "Project" DROP COLUMN "kind";', 'DROP TYPE "ProjectKind";']);
  for (const back of [
    `CREATE TYPE "ProjectKind" AS ENUM ('REPLACEMENT', 'FULL');`, `ADD COLUMN "kind" "ProjectKind" NOT NULL DEFAULT 'FULL';`,
    `SET "kind" = 'REPLACEMENT'`, 'CREATE INDEX "Project_companyId_kind_idx"', `DELETE FROM "_prisma_migrations" WHERE "migration_name" = '22_drop_project_kind';`,
    'pre-22-replacement-ids.txt', 'last 5 dumps',
  ]) assert.ok(sql.includes(back), back);
});
