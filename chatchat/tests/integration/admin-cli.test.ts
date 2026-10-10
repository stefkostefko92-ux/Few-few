import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { after, beforeEach, describe, test } from 'node:test';
import { promisify } from 'node:util';
import { verifyPassword } from '../../src/auth/password.js';
import { hashToken } from '../../src/crypto.js';
import { db, MFA_KEY, PASSWORD, PEPPER, resetDb, TOTP_SECRET } from './helpers.js';
import { encryptSecret } from '../../src/crypto.js';

/**
 * CLI `src/cli/tenant.ts` срещу тестовата база: без USER_PASSWORD печата еднократен линк (паролата
 * не минава през средата); с USER_PASSWORD — старият път; `reset` дава нов линк и по желание нулира MFA.
 */

const run = promisify(execFile);

after(async () => {
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDb();
});

function cli(command: string, env: Record<string, string>) {
  return run(process.execPath, ['--import', 'tsx', 'src/cli/tenant.ts', command], {
    env: {
      PATH: process.env.PATH ?? '',
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      PUBLIC_BASE_URL: 'https://chatchat.test',
      SESSION_PEPPER: PEPPER,
      ...env,
    },
  });
}

const USER = {
  TENANT_SLUG: 'cli-spa',
  TENANT_NAME: 'Cli Spa',
  USER_EMAIL: 'admin@cli.test',
  USER_NAME: 'Amministratore',
  USER_ROLE: 'TENANT_ADMIN',
};

describe('CLI: клиент и потребител', () => {
  test('без USER_PASSWORD → еднократен линк; в базата само HMAC; паролата е неизвестна', async () => {
    const { stdout } = await cli('tenant', USER);
    const url = /https:\/\/chatchat\.test\/reset#([A-Za-z0-9_-]{43})/.exec(stdout);
    assert.ok(url, stdout);
    const token = url[1] ?? '';
    const user = await db.user.findUniqueOrThrow({ where: { email: 'admin@cli.test' } });
    const reset = await db.passwordReset.findFirstOrThrow({ where: { userId: user.id } });
    assert.equal(reset.tokenHash, hashToken(token, PEPPER));
    assert.equal(reset.createdById, '@cli');
    const hours = (reset.expiresAt.getTime() - Date.now()) / 3600_000;
    assert.ok(hours > 71 && hours <= 72, `${hours}`);
    assert.equal(await verifyPassword(PASSWORD, user.passwordHash), false);
    const audit = JSON.stringify(await db.auditEvent.findMany());
    assert.ok(audit.includes('user.create.cli'));
    assert.equal(audit.includes(token), false);
  });

  test('с USER_PASSWORD — както досега, без линк', async () => {
    const { stdout } = await cli('tenant', { ...USER, USER_PASSWORD: PASSWORD });
    assert.equal(stdout.includes('/reset#'), false);
    const user = await db.user.findUniqueOrThrow({ where: { email: 'admin@cli.test' } });
    assert.equal(await verifyPassword(PASSWORD, user.passwordHash), true);
    assert.equal(await db.passwordReset.count(), 0);
  });

  test('без PUBLIC_BASE_URL и без парола → отказ, нищо не е създадено', async () => {
    await assert.rejects(cli('tenant', { ...USER, PUBLIC_BASE_URL: '' }));
    assert.equal(await db.tenant.count(), 0);
  });

  test('reset: нов линк; RESET_MFA=1 изтрива TOTP и отнема сесиите', async () => {
    await cli('tenant', { ...USER, USER_PASSWORD: PASSWORD });
    const user = await db.user.update({
      where: { email: 'admin@cli.test' },
      data: { totpSecretEnc: encryptSecret(TOTP_SECRET, MFA_KEY), totpEnabledAt: new Date() },
    });
    await db.session.create({
      data: {
        userId: user.id,
        tokenHash: 'h'.repeat(64),
        csrfToken: 'c',
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const { stdout } = await cli('reset', { USER_EMAIL: 'admin@cli.test', RESET_MFA: '1' });
    assert.match(stdout, /MFA/);
    assert.match(stdout, /https:\/\/chatchat\.test\/reset#[A-Za-z0-9_-]{43}/);
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.deepEqual([after.totpSecretEnc, after.totpEnabledAt], [null, null]);
    assert.equal(await db.session.count({ where: { userId: user.id, revokedAt: null } }), 0);
    const hours =
      ((
        await db.passwordReset.findFirstOrThrow({ where: { userId: user.id } })
      ).expiresAt.getTime() -
        Date.now()) /
      3600_000;
    assert.ok(hours > 23 && hours <= 24, `${hours}`);
  });
});
