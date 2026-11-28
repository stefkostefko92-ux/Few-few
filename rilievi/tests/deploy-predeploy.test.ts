// The copies made before every migration (deploy/deploy.sh, backup_db): the processing agreement (Allegato A,
// A.11), the measures (M.1) and the register (T5) promise 14 days for every backup copy. The deploy kept the last
// five whatever their age (the legal review, 28 November 2026 — part B, H1): now it keeps at most five and none
// older than 14 days, and the newest one, just written, always stays.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const DEPLOY = join(import.meta.dirname, '..', 'deploy');
const DAY = 86_400_000;

/** A stand-in `docker` that answers every call with success and no output. */
const DOCKER = `#!/usr/bin/env bash
exit 0
`;

function withBackups(ages: readonly number[]) {
  const dir = mkdtempSync(join(tmpdir(), 'rilievi-predeploy-'));
  mkdirSync(join(dir, 'deploy'));
  mkdirSync(join(dir, 'bin'));
  const backups = join(dir, 'shared', 'backups');
  mkdirSync(backups, { recursive: true });
  copyFileSync(join(DEPLOY, 'deploy.sh'), join(dir, 'deploy', 'deploy.sh'));
  writeFileSync(join(dir, 'bin', 'docker'), DOCKER);
  chmodSync(join(dir, 'bin', 'docker'), 0o755);
  const now = Date.now();
  ages.forEach((days, i) => {
    const file = join(backups, `pre-deploy-2026010${i}-000000.sql.gz`);
    writeFileSync(file, 'x');
    const at = new Date(now - days * DAY);
    utimesSync(file, at, at);
  });
  const result = spawnSync(
    'bash',
    ['-c', `cd "${dir}" && source deploy/deploy.sh && BACKUP_PLAN=dump && backup_db`],
    {
      env: { PATH: `${join(dir, 'bin')}:${process.env.PATH}`, RILIEVI_SHARED: join(dir, 'shared') },
      encoding: 'utf8',
    },
  );
  const left = readdirSync(backups).filter((f) => f.startsWith('pre-deploy-'));
  return { result, left };
}

describe('the copies before a migration', () => {
  it('drop the ones older than 14 days and keep the new one', () => {
    const { result, left } = withBackups([20, 15, 13, 1]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(left.length, 3, left.join(', '));
    assert.ok(!left.includes('pre-deploy-20260100-000000.sql.gz'), '20 days old');
    assert.ok(!left.includes('pre-deploy-20260101-000000.sql.gz'), '15 days old');
    assert.ok(left.includes('pre-deploy-20260102-000000.sql.gz'), '13 days old');
  });

  it('keep at most five, the newest ones', () => {
    const { result, left } = withBackups([6, 5, 4, 3, 2, 1]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(left.length, 5, left.join(', '));
    assert.ok(!left.includes('pre-deploy-20260100-000000.sql.gz'), 'the oldest goes');
  });

  it('keep the copy just made even if every other one is old', () => {
    const { result, left } = withBackups([30, 40]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(left.length, 1, left.join(', '));
    assert.ok(!left.some((f) => f.startsWith('pre-deploy-2026010')), 'only the new copy');
  });
});
