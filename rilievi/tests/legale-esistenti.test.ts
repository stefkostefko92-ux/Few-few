// The companies and people already in the portal when the terms arrived are the owner's test data (the
// owner, 10 November 2026: "Per le società già presenti oggi nel software fai risultare come se avessero
// firmato … tutte le società create al momento le ho create io"): the migration counts them as having
// accepted the first version, so they go in without the acceptance page — but writes nothing into the
// register of acceptances, which is evidence: no signature with a code took place and none is made up.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = join(import.meta.dirname, '..');
const sql = readFileSync(
  join(ROOT, 'prisma', 'migrations', '20261110230000_condizioni_esistenti', 'migration.sql'),
  'utf8',
)
  .split('\n')
  .filter((line) => !line.startsWith('--'))
  .join('\n');

describe('the companies and people present before the terms', () => {
  it('count as having accepted the first version, only where nothing is set yet', () => {
    assert.match(
      sql,
      /UPDATE "Azienda" SET "condizioniVersione" = '2026-11-10' WHERE "condizioniVersione" IS NULL;/,
    );
    assert.match(
      sql,
      /UPDATE "User" SET "regoleVersione" = '2026-11-10' WHERE "regoleVersione" IS NULL AND "master" = false;/,
    );
    for (const tipo of ['condizioni', 'regole'])
      assert.ok(existsSync(join(ROOT, 'legale', `${tipo}-2026-11-10.json`)), tipo);
  });

  it('get no record in the registers: no signature is made up', () => {
    assert.doesNotMatch(sql, /Accettazione|TestoLegale|FirmaCondizioni|EmissioneCalcolo/);
    assert.doesNotMatch(sql, /\b(INSERT|DELETE)\b/i);
  });
});
