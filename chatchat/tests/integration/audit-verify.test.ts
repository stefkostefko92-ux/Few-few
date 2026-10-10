import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { after, beforeEach, describe, test } from 'node:test';
import { promisify } from 'node:util';
import { appendAudit, verifyAuditChain } from '../../src/audit.js';
import { pruneAudit } from '../../src/services/audit-retention.js';
import { db, resetDb } from './helpers.js';

/**
 * CLI `src/cli/audit-verify.ts` (npm run audit:verify) срещу тестовата база: изходът е договорът с
 * deploy/monitoring/audit-verify.sh (0 цяла · 2 счупена · 1 не завърши) — оттам идва метриката
 * chatchat_audit_chain_intact и страницата ChatchatAuditChainBroken.
 */

const run = promisify(execFile);

after(async () => {
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDb();
});

async function cli(databaseUrl = process.env.DATABASE_URL ?? '') {
  try {
    const { stdout, stderr } = await run(
      process.execPath,
      ['--import', 'tsx', 'src/cli/audit-verify.ts', '--confirm-delay-ms', '0'],
      { env: { PATH: process.env.PATH ?? '', DATABASE_URL: databaseUrl } },
    );
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: unknown; stdout?: string; stderr?: string };
    return {
      code: typeof e.code === 'number' ? e.code : -1,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
    };
  }
}

async function events(n: number, prefix = 'test.verify') {
  for (let i = 0; i < n; i += 1) {
    await appendAudit(db, {
      tenantId: null,
      actorId: null,
      action: `${prefix}.${i}`,
      detail: { i, secret: 'никога-в-изхода' },
    });
  }
}

describe('npm run audit:verify', () => {
  test('празна и цяла верига → 0; изходът е само броеве, без съдържание', async () => {
    const empty = await cli();
    assert.equal(empty.code, 0, empty.stderr);
    assert.match(empty.stdout, /цяла: 0 събития от GENESIS/);
    await events(4);
    const r = await cli();
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /цяла: 4 събития от GENESIS/);
    assert.doesNotMatch(r.stdout + r.stderr, /никога-в-изхода|test\.verify/);
  });

  test('подправен ред → 2 и id на звеното (потвърдено и от втората проверка)', async () => {
    await events(5);
    const victim = await db.auditEvent.findFirstOrThrow({ where: { action: 'test.verify.2' } });
    await db.$executeRaw`UPDATE "AuditEvent" SET detail = '{"i":99}'::jsonb WHERE id = ${victim.id}`;
    const r = await cli();
    assert.equal(r.code, 2);
    assert.match(r.stderr, new RegExp(`СЧУПЕНА при събитие #${victim.id}\\b`));
    assert.doesNotMatch(r.stdout + r.stderr, /никога-в-изхода|"i":99/);
  });

  test('изтрит ред по средата → 2', async () => {
    await events(5);
    const victim = await db.auditEvent.findFirstOrThrow({ where: { action: 'test.verify.1' } });
    await db.$executeRaw`DELETE FROM "AuditEvent" WHERE id = ${victim.id}`;
    assert.equal((await cli()).code, 2);
  });

  test('след ретенцията на одита (контролна точка) веригата е цяла от котвата → 0', async () => {
    await events(3, 'old');
    await new Promise((r) => setTimeout(r, 20));
    const cutoff = new Date();
    await events(2, 'new');
    const report = await pruneAudit(db, { cutoff, archiveDir: null });
    assert.equal(report.deleted, 3);
    const r = await cli();
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /от контролна точка до #3/);
  });

  test('на порции: подправка в по-късна порция и на границата се хваща; котвата важи през порциите', async () => {
    await events(7);
    for (const size of [1, 2, 3, 7, 100]) assert.equal(await verifyAuditChain(db, size), null);
    const rows = await db.auditEvent.findMany({ orderBy: { id: 'asc' } });
    // Шестият ред е първи в третата порция при размер 2 (граница), в последната при 5.
    const victim = rows[5];
    assert.ok(victim);
    await db.$executeRaw`UPDATE "AuditEvent" SET detail = '{"i":-1}'::jsonb WHERE id = ${victim.id}`;
    for (const size of [1, 2, 5, 100]) assert.equal(await verifyAuditChain(db, size), victim.id);
    await resetDb();
    await events(3, 'old');
    await new Promise((r) => setTimeout(r, 20));
    const cutoff = new Date();
    await events(4, 'new');
    await pruneAudit(db, { cutoff, archiveDir: null });
    for (const size of [1, 2, 100]) assert.equal(await verifyAuditChain(db, size), null);
  });

  test('базата не отговаря → 1 (не „цяла“, не „счупена“)', async () => {
    const r = await cli('postgresql://chatchat:wrong@127.0.0.1:1/chatchat_test_none');
    assert.equal(r.code, 1);
    assert.match(r.stderr, /не завърши/);
    assert.doesNotMatch(r.stderr, /wrong/);
  });
});
