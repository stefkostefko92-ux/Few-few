import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  backup,
  decrypt,
  logOf,
  restore,
  withBox,
  withBoxAsync,
  type Box,
} from '../backup-harness.js';
import { prisma, startApp, stopApp } from './harness.js';
import { customer } from './people.js';

/**
 * The daily backup and its restore for real: deploy/backup.sh dumps the test database with the
 * PostgreSQL client tools (in production the same commands run in the db container), age encrypts it
 * to a fresh key pair, and deploy/backup-restore.sh brings it back — into an empty database and over
 * the live one.
 */
before(startApp);
after(stopApp);

const TOOLS = ['pg_dump', 'pg_restore', 'psql', 'age', 'age-keygen'];
const missing = TOOLS.filter((tool) => spawnSync('sh', ['-c', `command -v ${tool}`]).status !== 0);
const skip = missing.length ? `needs ${missing.join(', ')}` : false;

const url = new URL(process.env.DATABASE_URL ?? '');
const DB = decodeURIComponent(url.pathname.slice(1));
const ENV = {
  DOCKER_EXEC: 'local',
  PGHOST: url.hostname,
  PGPORT: url.port || '5432',
  PGPASSWORD: decodeURIComponent(url.password),
  KORPORA_DB_USER: decodeURIComponent(url.username),
  KORPORA_DB_NAME: DB,
};

function psql(db: string, sql: string): string {
  const r = spawnSync('psql', ['-X', '-tA', '-v', 'ON_ERROR_STOP=1', '-d', db, '-c', sql], {
    encoding: 'utf8',
    env: { ...process.env, ...ENV, PGUSER: ENV.KORPORA_DB_USER },
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

const emails = (db: string) => psql(db, 'SELECT email FROM "User" ORDER BY email');
const migrations = (db: string) =>
  psql(db, 'SELECT migration_name FROM _prisma_migrations ORDER BY migration_name');

function newest(box: Box): string {
  const [name] = readdirSync(box.daily)
    .filter((n) => n.endsWith('.dump.age'))
    .sort()
    .reverse();
  assert.ok(name, 'a backup was written');
  return join(box.daily, name);
}

test(
  'a backup restores into an empty database: the same accounts and migrations',
  { skip },
  async () => {
    await customer('backup-one@example.test');
    await customer('backup-two@example.test');
    const accounts = await prisma.user.count();
    withBox((box) => {
      const made = backup(box, ENV);
      assert.equal(made.status, 0, made.stderr);
      const file = newest(box);
      assert.ok(statSync(file).size >= 8192, 'a migrated database is well above the minimum');
      const target = `korpora_restore_ci_${randomBytes(4).toString('hex')}`;
      const r = restore(box, ['--into', target, '--keep', '--identity', box.identity, file], ENV);
      try {
        assert.equal(r.status, 0, r.stderr);
        assert.match(r.stdout, new RegExp(`${accounts} акаунта`));
        assert.equal(emails(target), emails(DB));
        assert.equal(migrations(target), migrations(DB));
      } finally {
        psql('postgres', `DROP DATABASE IF EXISTS "${target}"`);
      }
      // without --keep the drill cleans up after itself
      const drill = restore(box, ['--into', target, '--identity', box.identity, file], ENV);
      assert.equal(drill.status, 0, drill.stderr);
      assert.equal(
        psql('postgres', `SELECT count(*) FROM pg_database WHERE datname = '${target}'`),
        '0',
      );
    });
  },
);

test(
  'a live restore brings back a deleted account, after an encrypted snapshot, and restarts the app',
  { skip },
  async () => {
    await customer('backup-kept@example.test');
    const wanted = emails(DB);
    await withBoxAsync(async (box) => {
      assert.equal(backup(box, ENV).status, 0);
      const plain = decrypt(box, newest(box));
      await prisma.user.delete({ where: { email: 'backup-kept@example.test' } });
      assert.notEqual(emails(DB), wanted);
      // the owner decrypts at home and streams the dump in: the private key never reaches the server
      const r = restore(box, ['--live', '--yes-i-know', '-'], ENV, plain);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(emails(DB), wanted);
      assert.match(logOf(box), /docker stop appid\n[\s\S]*docker start appid\n/);
      const [snapshot] = readdirSync(join(box.shared, 'backups')).filter((n) =>
        /^pre-restore-\d{8}-\d{6}\.dump\.age$/.test(n),
      );
      assert.ok(snapshot, 'the state before the restore is kept');
      const snap = join(box.shared, 'backups', snapshot);
      assert.equal((statSync(snap).mode & 0o777).toString(8), '600');
      assert.equal(decrypt(box, snap).subarray(0, 5).toString(), 'PGDMP');
    });
  },
);

test(
  'a damaged dump changes nothing: one transaction, and the app comes back',
  { skip },
  async () => {
    const wanted = emails(DB);
    await withBoxAsync(async (box) => {
      assert.equal(backup(box, ENV).status, 0);
      const plain = decrypt(box, newest(box));
      const cut = plain.subarray(0, Math.floor(plain.length * 0.8));
      const r = restore(box, ['--live', '--yes-i-know', '-'], ENV, cut);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /живата база е каквато беше/);
      assert.equal(emails(DB), wanted);
      assert.match(logOf(box), /docker start appid\n/);
    });
  },
);
