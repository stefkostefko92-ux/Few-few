// The daily backup (deploy/backup.sh, SPEC 56): the database dump, a verified restore — the rows of
// "Document" and "AuditLog" in the restored database match the dump and the chains are whole — the newest
// 14, never older than 90 days (the processing agreement, item 11), the copy off the server when one is set
// (dumps only, never the secrets) and the "alive" signal. The real scripts run with a stand-in `docker`
// (the dump, the temporary database answering the checks) and the real gzip, rsync and curl. The SQL of
// the checks was run against a real PostgreSQL 16 when it was written; here only the script's logic.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const DEPLOY = join(import.meta.dirname, '..', 'deploy');
const hasRsync = spawnSync('rsync', ['--version']).status === 0;

// The temporary PostgreSQL: `exec -i` swallows the restore, `exec … -c SQL` answers from FAKE_*.
const DOCKER = `#!/usr/bin/env bash
echo "$*" >>"$FAKE_LOG"
case "$1" in
  compose)
    if [ "$2" = exec ]; then cat "$FAKE_DUMP"; exit "\${FAKE_DUMP_STATUS:-0}"; fi
    if [ "$2" = ps ]; then echo db-container; fi
    exit 0 ;;
  inspect) echo postgres:16-alpine; exit 0 ;;
  exec)
    shift
    if [ "$1" = -i ]; then cat >/dev/null; exit "\${FAKE_RESTORE_STATUS:-0}"; fi
    shift
    [ "$1" = pg_isready ] && exit 0
    sql="\${*: -1}"
    case "$sql" in
      *_prisma_migrations*) echo "\${FAKE_MIGRATIONS:-4}" ;;
      *row_number*) echo "\${FAKE_BROKEN_DOCS:-0}" ;;
      *'lag("hash")'*) echo "\${FAKE_BROKEN_AUDIT:-0}" ;;
      *'FROM "Document"'*) echo "\${FAKE_DOCS:-2}" ;;
      *'FROM "AuditLog"'*) echo "\${FAKE_AUDIT:-3}" ;;
    esac
    exit 0 ;;
esac
exit 0
`;

const ZERO = '0'.repeat(64);
// What pg_dump writes: one line per row between "COPY … FROM stdin;" and "\.", new lines in the data
// escaped. Two documents, three audit records.
const DUMP = [
  'DROP TABLE IF EXISTS public."Document";',
  'COPY public."Document" (id, "organizationId", "chainIndex", sha256, "prevHash", "ublXml") FROM stdin;',
  `d1\to1\t1\th1\t${ZERO}\t<a>\\n  ред</a>`,
  'd2\to1\t2\th2\th1\t\\N',
  '\\.',
  '',
  'COPY public."AuditLog" (id, action, "prevHash", hash) FROM stdin;',
  `1\ta\t${ZERO}\tx1`,
  '2\tb\tx1\tx2',
  '3\tc\tx2\tx3',
  '\\.',
  '',
].join('\n');

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'fakturist-backup-'));
  const shared = join(dir, 'shared');
  const release = join(dir, 'release');
  for (const d of [join(release, 'deploy'), join(dir, 'bin'), shared])
    mkdirSync(d, { recursive: true });
  for (const f of ['backup.sh', 'restore-test.sh', 'backup-alert.sh'])
    copyFileSync(join(DEPLOY, f), join(release, 'deploy', f));
  writeFileSync(join(release, 'docker-compose.yml'), 'services: {}\n');
  writeFileSync(join(shared, 'last-good'), `${release}\n`);
  // A stand-in for the secrets: it must never leave the server.
  writeFileSync(join(shared, '.env'), `LEDGER_SEAL_KEY=${'ab'.repeat(32)}\n`);
  writeFileSync(join(dir, 'dump.sql'), DUMP);
  writeFileSync(join(dir, 'bin', 'docker'), DOCKER);
  chmodSync(join(dir, 'bin', 'docker'), 0o755);
  return {
    dir,
    shared,
    release,
    daily: join(shared, 'backups', 'daily'),
    log: join(dir, 'docker.log'),
  };
}

type Setup = ReturnType<typeof setup>;

function run(s: Setup, script: string, args: string[] = [], env: Record<string, string> = {}) {
  return spawnSync('bash', [join(s.release, 'deploy', script), ...args], {
    encoding: 'utf8',
    cwd: s.release,
    env: {
      ...process.env,
      PATH: `${join(s.dir, 'bin')}:${process.env.PATH ?? ''}`,
      FAKTURIST_SHARED: s.shared,
      FAKTURIST_RESTORE_SETTLE: '0',
      FAKE_LOG: s.log,
      FAKE_DUMP: join(s.dir, 'dump.sql'),
      ...env,
    },
  });
}

const DAY = 24 * 60 * 60 * 1000;
function oldDump(dir: string, name: string, daysAgo: number) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, 'old');
  const at = new Date(Date.now() - daysAgo * DAY);
  utimesSync(file, at, at);
  return file;
}
const dumpsIn = (dir: string) => readdirSync(dir).filter((f) => f.endsWith('.sql.gz'));

describe('the daily backup', () => {
  it('dumps the database, verifies the restore without a network and keeps the newest 14', () => {
    const s = setup();
    for (let n = 1; n <= 15; n += 1)
      oldDump(s.daily, `fakturist-202001${String(n).padStart(2, '0')}-034000.sql.gz`, n);
    const out = run(s, 'backup.sh');
    assert.equal(out.status, 0, out.stderr);
    const dumps = dumpsIn(s.daily);
    assert.equal(dumps.length, 14, 'the newest 14');
    const fresh = dumps.find((f) => !f.startsWith('fakturist-2020'));
    assert.ok(fresh, 'today is there');
    assert.equal(statSync(join(s.daily, fresh)).mode & 0o777, 0o600);
    assert.equal(statSync(s.daily).mode & 0o777, 0o700);
    const gz = spawnSync('gzip', ['-dc', join(s.daily, fresh)], { encoding: 'utf8' });
    assert.equal(gz.stdout, DUMP);
    assert.match(out.stdout, /ok — 4 миграции, 2 документа, 3 записа в одита, веригите са цели/);
    const docker = readFileSync(s.log, 'utf8');
    assert.match(docker, /^run -d --name fakturist-restore-test-\d+ --network none /m);
    // The temporary database goes with its volume: no restored personal data stays on the disk.
    assert.match(docker, /^rm -f -v fakturist-restore-test-\d+$/m);
    assert.match(out.stdout, /няма копие извън сървъра/);
    assert.ok(existsSync(join(s.shared, 'backups', 'LAST_OK')));
  });

  it('never keeps a copy older than 90 days, even among the newest 14', () => {
    const s = setup();
    const recent = oldDump(s.daily, 'fakturist-20200201-034000.sql.gz', 12);
    const tooOld = [95, 120, 200].map((d) =>
      oldDump(s.daily, `fakturist-2026070${d % 9}-034000.sql.gz`, d),
    );
    const out = run(s, 'backup.sh');
    assert.equal(out.status, 0, out.stderr);
    assert.equal(dumpsIn(s.daily).length, 2, 'today and the one from 12 days ago');
    assert.ok(existsSync(recent));
    for (const f of tooOld) assert.ok(!existsSync(f), `${f} is past the 90 days`);
  });

  it('refuses a longer keeping time than the processing agreement allows', () => {
    const s = setup();
    const out = run(s, 'backup.sh', [], { FAKTURIST_BACKUP_MAX_DAYS: '120' });
    assert.equal(out.status, 1);
    assert.match(out.stderr, /1…90 дни/);
    assert.ok(!existsSync(s.daily), 'nothing was dumped');
  });

  it('fails when the restored chain does not match the dump — and does not push out the good copies', () => {
    const s = setup();
    for (let n = 1; n <= 14; n += 1)
      oldDump(s.daily, `fakturist-202001${String(n).padStart(2, '0')}-034000.sql.gz`, n);
    const out = run(s, 'backup.sh', [], { FAKE_DOCS: '1' });
    assert.equal(out.status, 1);
    assert.match(out.stderr, /"Document": 1 реда във възстановената база, 2 в дъмпа/);
    assert.match(out.stderr, /дъмпът НЕ се възстановява/);
    assert.equal(dumpsIn(s.daily).length, 15, 'the 14 verified ones are all still there');
    assert.ok(!existsSync(join(s.shared, 'backups', 'LAST_OK')));
  });

  it('fails loudly when pg_dump fails and leaves no half-written copy', () => {
    const s = setup();
    const out = run(s, 'backup.sh', [], { FAKE_DUMP_STATUS: '1' });
    assert.equal(out.status, 1);
    assert.match(out.stderr, /pg_dump се провали/);
    assert.deepEqual(readdirSync(s.daily), []);
  });

  it('fails loudly without a release that answered', () => {
    const s = setup();
    rmSync(join(s.shared, 'last-good'));
    const out = run(s, 'backup.sh');
    assert.equal(out.status, 1);
    assert.match(out.stderr, /last-good/);
  });

  it(
    'copies only the dumps off the server — never the secrets — and says it is alive',
    { skip: !hasRsync && 'rsync is not installed here' },
    () => {
      const s = setup();
      // The folder over there is made once by the owner; rsync makes what is inside.
      const offsite = join(s.dir, 'offsite');
      // Deleted here by the age limit, gone there too (a mirror).
      const gone = oldDump(join(offsite, 'daily'), 'fakturist-20260101-034000.sql.gz', 300);
      const beat = join(s.dir, 'beat.txt');
      writeFileSync(beat, 'ok');
      writeFileSync(
        join(s.shared, 'backup.env'),
        `FAKTURIST_OFFSITE=${offsite}\nFAKTURIST_HEARTBEAT_URL=file://${beat}\n`,
      );
      const out = run(s, 'backup.sh');
      assert.equal(out.status, 0, out.stderr);
      assert.ok(!existsSync(gone));
      const there = readdirSync(join(offsite, 'daily'));
      assert.equal(there.length, 1);
      assert.match(there[0]!, /^fakturist-\d{8}-\d{6}\.sql\.gz$/);
      // The keys stay on the server: the owner copies them once, by hand (deploy/README.md).
      assert.deepEqual(readdirSync(offsite), ['daily']);
      assert.doesNotMatch(out.stdout + out.stderr, /LEDGER_SEAL_KEY=|abab/);
      assert.match(out.stdout, /копие извън сървъра:/);
    },
  );

  it('marks a failure for the alert (journal, LAST_ERROR)', () => {
    const s = setup();
    const out = run(s, 'backup-alert.sh');
    assert.equal(out.status, 0, out.stderr);
    assert.ok(existsSync(join(s.shared, 'backups', 'LAST_ERROR')));
  });
});

describe('the restore test', () => {
  const restore = (s: Setup, env: Record<string, string> = {}, dump?: string) => {
    const file = dump ?? join(s.dir, 'dump.sql.gz');
    if (!dump) spawnSync('bash', ['-c', `gzip -c "${join(s.dir, 'dump.sql')}" >"${file}"`]);
    return run(s, 'restore-test.sh', [file], env);
  };

  it('passes a whole dump', () => {
    const s = setup();
    const out = restore(s);
    assert.equal(out.status, 0, out.stderr);
  });

  it('catches a broken document chain and a broken audit chain', () => {
    const s = setup();
    const docs = restore(s, { FAKE_BROKEN_DOCS: '1' });
    assert.equal(docs.status, 1);
    assert.match(docs.stderr, /веригата на документите е скъсана/);
    const audit = restore(s, { FAKE_BROKEN_AUDIT: '2' });
    assert.equal(audit.status, 1);
    assert.match(audit.stderr, /веригата на одита е скъсана: 2/);
    const rows = restore(s, { FAKE_AUDIT: '2' });
    assert.equal(rows.status, 1);
    assert.match(rows.stderr, /"AuditLog": 2 реда/);
  });

  it('refuses a dump without the tables, without migrations or that does not restore', () => {
    const s = setup();
    writeFileSync(join(s.dir, 'dump.sql'), DUMP.replace(/COPY public."AuditLog"[\s\S]*$/, ''));
    const noAudit = restore(s);
    assert.equal(noAudit.status, 1);
    assert.match(noAudit.stderr, /няма таблица "AuditLog"/);
    writeFileSync(join(s.dir, 'dump.sql'), DUMP);
    const noMigrations = restore(s, { FAKE_MIGRATIONS: '0' });
    assert.equal(noMigrations.status, 1);
    assert.match(noMigrations.stderr, /няма приложени миграции/);
    const psqlFails = restore(s, { FAKE_RESTORE_STATUS: '3' });
    assert.equal(psqlFails.status, 1);
    assert.match(psqlFails.stderr, /не се възстановява/);
    const corrupt = join(s.dir, 'corrupt.sql.gz');
    writeFileSync(corrupt, 'not gzip');
    const bad = restore(s, {}, corrupt);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /повреден/);
  });
});

describe('deploy.sh puts the backup in place', () => {
  const deployFn = (fn: string, env: Record<string, string>) =>
    spawnSync('bash', ['-c', `source "$1"; ${fn}`, '_', join(DEPLOY, 'deploy.sh')], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });

  it('installs the timer and its units, again and again without change', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fakturist-timer-'));
    const units = join(dir, 'systemd');
    const bin = join(dir, 'bin');
    mkdirSync(units);
    mkdirSync(bin);
    writeFileSync(
      join(bin, 'systemctl'),
      `#!/usr/bin/env bash\necho "$*" >>"${join(dir, 'systemctl.log')}"\n`,
    );
    chmodSync(join(bin, 'systemctl'), 0o755);
    const env = { PATH: `${bin}:${process.env.PATH ?? ''}`, FAKTURIST_SYSTEMD_DIR: units };
    for (let n = 0; n < 2; n += 1) {
      const out = deployFn('install_backup_timer', env);
      assert.equal(out.status, 0, out.stderr);
    }
    assert.deepEqual(readdirSync(units).sort(), [
      'fakturist-backup-alert.service',
      'fakturist-backup.service',
      'fakturist-backup.timer',
    ]);
    assert.equal(statSync(join(units, 'fakturist-backup.timer')).mode & 0o777, 0o644);
    const service = readFileSync(join(units, 'fakturist-backup.service'), 'utf8');
    assert.match(service, /OnFailure=fakturist-backup-alert\.service/);
    assert.match(service, /\/opt\/few-few\/shared\/fakturist\/last-good\)\/deploy\/backup\.sh/);
    assert.equal(
      readFileSync(join(dir, 'systemctl.log'), 'utf8'),
      'daemon-reload\nenable --now fakturist-backup.timer\n'.repeat(2),
    );
  });

  it('the daily cron job removes both kinds of copies past 90 days', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fakturist-cron-'));
    const shared = join(dir, 'shared');
    const cron = join(dir, 'cron.daily');
    mkdirSync(cron);
    const backups = join(shared, 'backups');
    const daily = join(backups, 'daily');
    const keep = [
      oldDump(backups, 'pre-deploy-20261101-120000.sql.gz', 10),
      oldDump(daily, 'fakturist-20261101-034000.sql.gz', 87),
    ];
    const drop = [
      oldDump(backups, 'pre-deploy-20260701-120000.sql.gz', 100),
      // 89 full days: cron runs once a day, so it deletes before day 90 (literally "at most 90").
      oldDump(daily, 'fakturist-20260701-034000.sql.gz', 89),
    ];
    const out = deployFn('install_backup_prune', {
      FAKTURIST_SHARED: shared,
      FAKTURIST_CRON_DAILY: cron,
    });
    assert.equal(out.status, 0, out.stderr);
    const job = join(cron, 'fakturist-backups');
    assert.equal(statSync(job).mode & 0o777, 0o755);
    const ran = spawnSync('sh', [job], { encoding: 'utf8' });
    assert.equal(ran.status, 0, ran.stderr);
    for (const f of keep) assert.ok(existsSync(f), `${f} stays`);
    for (const f of drop) assert.ok(!existsSync(f), `${f} is past the 90 days`);
  });
});
