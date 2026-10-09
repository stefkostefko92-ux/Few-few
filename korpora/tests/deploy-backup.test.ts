import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  HAS_AGE,
  backup,
  decrypt,
  logOf,
  restore,
  withBox,
  withBoxAsync,
} from './backup-harness.js';

const skip = HAS_AGE ? false : 'age is not installed (apt-get install -y age)';
const mode = (path: string) => (statSync(path).mode & 0o777).toString(8);
const backups = (dir: string) =>
  existsSync(dir) ? readdirSync(dir).filter((n) => /^korpora-\d{8}-\d{6}\.dump\.age$/.test(n)) : [];

test(
  'a backup is encrypted to the owner, complete, 600 in a 700 folder, with a checksum',
  { skip },
  () => {
    withBox((box) => {
      const r = backup(box);
      assert.equal(r.status, 0, r.stderr);
      const [name] = backups(box.daily);
      assert.ok(name, r.stdout);
      const file = join(box.daily, name);
      assert.deepEqual(
        [mode(box.daily), mode(file), mode(`${file}.sha256`)],
        ['700', '600', '600'],
      );
      const plain = decrypt(box, file);
      assert.equal(plain.length, 5 + 20000);
      assert.equal(plain.subarray(0, 5).toString(), 'PGDMP');
      assert.ok(!readFileSync(file).includes(Buffer.from('xxxxxxxx')), 'nothing readable at rest');
      const check = spawnSync('sha256sum', ['-c', `${name}.sha256`], { cwd: box.daily });
      assert.equal(check.status, 0, 'the checksum file verifies with sha256sum -c');
      // the same stream was read through by pg_restore while it was encrypted
      assert.match(logOf(box), /docker exec -i dbid pg_restore -f \/dev\/null\n/);
      assert.match(logOf(box), /docker exec dbid pg_dump -Fc -U korpora -d korpora\n/);
      assert.deepEqual(
        readdirSync(box.daily).filter((n) => n.startsWith('.work')),
        [],
        'no temporary files left',
      );
      assert.match(r.stdout, /готов: korpora-\d{8}-\d{6}\.dump\.age \(\d+ KiB/);
    });
  },
);

test(
  'no backup without a valid recipient: missing, a private key, writable by others, or garbage',
  { skip },
  () => {
    withBox((box) => {
      const pub = readFileSync(box.recipients, 'utf8');
      const cases: Array<[string | null, number, RegExp]> = [
        [null, 0o600, /няма получател/],
        [`${pub}${readFileSync(box.identity, 'utf8')}`, 0o600, /ЧАСТЕН ключ/],
        [pub, 0o620, /само той да пише/],
        ['password123\n', 0o600, /непознат ред/],
        ['# only a comment\n', 0o600, /няма нито един публичен ключ/],
      ];
      for (const [content, perm, reason] of cases) {
        if (content === null) writeFileSync(box.recipients, '');
        else writeFileSync(box.recipients, content);
        chmodSync(box.recipients, perm);
        const r = backup(box);
        assert.equal(r.status, 1, String(reason));
        assert.match(r.stderr, reason);
        assert.deepEqual(backups(box.daily), []);
        assert.doesNotMatch(logOf(box), /pg_dump/, 'the database is not even read');
      }
    });
  },
);

test('a failed or unreadable dump leaves no file and deletes nothing old', { skip }, () => {
  withBox((box) => {
    mkdirSync(box.daily, { recursive: true });
    const old = 'korpora-19990101-023000.dump.age';
    writeFileSync(join(box.daily, old), 'old');
    const cases: Array<[Record<string, string>, RegExp]> = [
      [{ DUMP_RC: '1' }, /pg_dump или age се провали/],
      // the check refuses the archive at once: the reason is the check, whatever pg_dump managed to write
      [{ VERIFY_RC: '1' }, /не се прочете докрай/],
      [{ TRUNCATED_RC: '1' }, /не се прочете докрай/],
      [{ DUMP_BYTES: '100' }, /бекъпът е само \d+ B/],
      [{ DB_RUNNING: '0' }, /няма работещ контейнер на базата/],
    ];
    for (const [env, reason] of cases) {
      const r = backup(box, env);
      assert.equal(r.status, 1, JSON.stringify(env));
      assert.match(r.stderr, reason);
      assert.deepEqual(backups(box.daily), [old], 'the old backup survives a failed run');
      assert.deepEqual(
        readdirSync(box.daily).filter((n) => n.startsWith('.work')),
        [],
        'no partial file left',
      );
    }
  });
});

test('a second run while one holds the lock stops at once', { skip }, async () => {
  await withBoxAsync(async (box) => {
    mkdirSync(box.daily, { recursive: true });
    const lock = join(box.daily, '.lock');
    const holder = spawn('flock', [lock, 'sleep', '30'], { stdio: 'ignore' });
    try {
      // wait until the holder really has it
      for (let i = 0; i < 100 && spawnSync('flock', ['-n', lock, 'true']).status === 0; i++)
        await new Promise((resolve) => setTimeout(resolve, 20));
      const r = backup(box);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /друг бекъп или възстановяване вече тече/);
      assert.doesNotMatch(logOf(box), /pg_dump/);
    } finally {
      holder.kill();
    }
  });
});

/** UTC YYYYMMDD of `days` ago. */
const day = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10).replaceAll('-', '');

/** ISO year-week of a YYYYMMDD day: the week of its Thursday, counted in that Thursday's year. */
function isoWeek(ymd: string): string {
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)));
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const ordinal = (d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000 + 1;
  return `${d.getUTCFullYear()}-W${Math.floor((ordinal - 1) / 7) + 1}`;
}

test(
  'rotation keeps the newest of each of 14 days and of each of 8 weeks, and only its own files',
  { skip },
  () => {
    withBox((box) => {
      mkdirSync(box.daily, { recursive: true });
      const names: string[] = [];
      for (let ago = 1; ago <= 90; ago++) {
        names.push(`korpora-${day(ago)}-023000.dump.age`);
        if (ago === 3) names.push(`korpora-${day(ago)}-010000.dump.age`); // an earlier manual run that day
      }
      for (const name of names) {
        writeFileSync(join(box.daily, name), 'old');
        writeFileSync(join(box.daily, `${name}.sha256`), 'sum');
      }
      const foreign = ['notes.txt', 'korpora-latest.dump.age'];
      for (const name of foreign) writeFileSync(join(box.daily, name), 'keep');
      writeFileSync(join(box.daily, 'korpora-19990101-000000.dump.age.sha256'), 'orphan');
      writeFileSync(join(box.shared, 'backups', 'pre-deploy-19990101-000000.sql.gz'), 'pre');
      const r = backup(box);
      assert.equal(r.status, 0, r.stderr);

      // the expected set, computed independently: newest first, first of each day/week wins
      const all = [...backups(box.daily).filter((n) => !names.includes(n)), ...names]
        .sort()
        .reverse();
      const days = new Set<string>();
      const weeks = new Set<string>();
      const expected: string[] = [];
      for (const name of all) {
        const d = name.slice(8, 16);
        let keep = false;
        if (!days.has(d)) {
          days.add(d);
          if (days.size <= 14) keep = true;
        }
        if (!weeks.has(isoWeek(d))) {
          weeks.add(isoWeek(d));
          if (weeks.size <= 8) keep = true;
        }
        if (keep) expected.push(name);
      }
      assert.deepEqual(backups(box.daily).sort(), expected.sort());
      // 14 daily ones span 2–3 weeks, so the weekly ones add 5–6 more and reach about two months back
      assert.ok(expected.length >= 14 + 5 && expected.length <= 14 + 6, `${expected.length} kept`);
      const oldest = expected.map((n) => n.slice(8, 16)).sort()[0] ?? '';
      assert.ok(oldest <= day(42) && oldest >= day(63), `the oldest kept is from ${oldest}`);
      assert.ok(!expected.includes(`korpora-${day(3)}-010000.dump.age`), 'one per day');
      for (const name of expected.filter((n) => names.includes(n)))
        assert.ok(existsSync(join(box.daily, `${name}.sha256`)), `${name} keeps its checksum`);
      for (const name of foreign) assert.ok(existsSync(join(box.daily, name)), name);
      assert.ok(
        !existsSync(join(box.daily, 'korpora-19990101-000000.dump.age.sha256')),
        'orphan sum gone',
      );
      assert.ok(existsSync(join(box.shared, 'backups', 'pre-deploy-19990101-000000.sql.gz')));
      assert.match(r.stdout, /ротация: пазя \d+ \(до 14 дневни \+ 8 седмични\), изтрих \d+/);
    });
  },
);

test('the dumps before a deploy go after 30 days and the snapshots before a restore after 8 weeks less a day, even when no backup can run', () => {
  withBox((box) => {
    const dir = join(box.shared, 'backups');
    const put = (name: string, days: number) => {
      const file = join(dir, name);
      writeFileSync(file, 'old');
      const at = new Date(Date.now() - days * 86_400_000);
      utimesSync(file, at, at);
    };
    // the timer runs once a day: past 30 days (the unencrypted dumps) or 8 weeks (the snapshots) less a day,
    // nothing outlives the periods of the policy
    put('pre-deploy-19990101-000001.sql.gz', 29.1);
    put('pre-restore-19990101-000001.dump.age', 55.1);
    put('pre-restore-19990101-000001.dump.age.sha256', 55.1);
    put('pre-deploy-19990101-000002.sql.gz', 28.9);
    put('pre-restore-19990101-000002.dump.age', 54.9);
    put('notes.txt', 100);
    // no recipient: no backup is made, but the old dumps still go
    rmSync(box.recipients, { force: true });
    const r = backup(box);
    assert.notEqual(r.status, 0);
    assert.deepEqual(readdirSync(dir).sort(), [
      'notes.txt',
      'pre-deploy-19990101-000002.sql.gz',
      'pre-restore-19990101-000002.dump.age',
    ]);
    assert.match(r.stdout, /изтрих 3 стари снимки отпреди деплой или възстановяване/);
  });
});

test(
  'between two deploys the daily backup drops dumps past the age cap, the newest one too',
  { skip },
  () => {
    withBox((box) => {
      const top = join(box.shared, 'backups');
      const aged = (name: string, days: number) => {
        writeFileSync(join(top, name), 'old');
        const at = new Date(Date.now() - days * 86_400_000);
        utimesSync(join(top, name), at, at);
      };
      // the only pre-deploy dump, 31 days old: deploy.sh would have spared it as the newest
      aged('pre-deploy-20260101-000000.sql.gz', 31);
      aged('pre-deploy-20260301-000000.sql.gz', 20);
      aged('pre-restore-20260101-000000.dump.age', 56);
      aged('pre-restore-20260101-000000.dump.age.sha256', 56);
      aged('pre-restore-20260301-000000.dump.age', 54);
      aged('pre-restore-20260301-000000.dump.age.sha256', 54);
      aged('notes.txt', 90);

      // the age cap does not wait for a good backup: a failed one already drops them, the daily ones stay
      const failed = backup(box, { DUMP_RC: '1' });
      assert.equal(failed.status, 1);
      assert.ok(!existsSync(join(top, 'pre-deploy-20260101-000000.sql.gz')));

      const r = backup(box);
      assert.equal(r.status, 0, r.stderr);
      const left = readdirSync(top).filter((n) => n !== 'daily');
      assert.deepEqual(
        left.sort(),
        [
          'notes.txt',
          'pre-deploy-20260301-000000.sql.gz',
          'pre-restore-20260301-000000.dump.age',
          'pre-restore-20260301-000000.dump.age.sha256',
        ].sort(),
      );
      assert.equal(backups(box.daily).length, 1, 'the new backup itself is there');
    });
  },
);

test(
  'restore refuses before touching anything: no mode, a live restore without --yes-i-know, a bad name',
  { skip },
  () => {
    withBox((box) => {
      const cases: Array<[string[], RegExp]> = [
        [['-'], /употреба/],
        [['--live', '-'], /потвърди с --yes-i-know/],
        [['--into', 'korpora', '-'], /korpora_restore_/],
        [['--into', 'korpora_restore_x"; DROP', '-'], /korpora_restore_/],
        [['--into', 'korpora_restore_x', '/nope.dump.age'], /--identity/],
      ];
      for (const [args, reason] of cases) {
        const r = restore(box, args, {}, 'PGDMP');
        assert.equal(r.status, 1, args.join(' '));
        assert.match(r.stderr, reason);
        assert.doesNotMatch(logOf(box), /docker (exec|stop)/, 'nothing touched');
      }
    });
  },
);

test('restore from a file checks its checksum first', { skip }, () => {
  withBox((box) => {
    assert.equal(backup(box).status, 0);
    const [name = ''] = backups(box.daily);
    assert.ok(name);
    const file = join(box.daily, name);
    writeFileSync(`${file}.sha256`, `${'0'.repeat(64)}  ${name}\n`);
    const r = restore(box, ['--into', 'korpora_restore_t', '--identity', box.identity, file]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /контролната сума .* не съвпада/);
    assert.doesNotMatch(logOf(box), /psql/, 'no database is created for a damaged file');
  });
});

test(
  'a dump streamed on stdin reaches pg_restore whole: no docker exec before it eats the input',
  { skip },
  () => {
    // DEPLOY.md, т. 10: the owner decrypts at home and pipes the dump in over ssh. `docker exec -i`
    // copies stdin into the container even when the command never reads it, so a psql -c or pg_dump
    // with -i before the restore would swallow the start of the dump.
    const dump = Buffer.concat([Buffer.from('PGDMP'), Buffer.alloc(20000, 'x')]);
    withBox((box) => {
      const drill = restore(box, ['--into', 'korpora_restore_t', '-'], {}, dump);
      assert.equal(drill.status, 0, drill.stderr);
      assert.match(drill.stdout, /възстановено в korpora_restore_t: 12 таблици/);
      assert.match(drill.stdout, /репетицията мина/);
      const live = restore(box, ['--live', '--yes-i-know', '-'], {}, dump);
      assert.equal(live.status, 0, live.stderr);
      assert.match(live.stdout, /възстановено в korpora: 12 таблици/);
      assert.match(logOf(box), /docker stop appid\n[\s\S]*docker start appid\n/);
      // stdin goes only to the restore itself (pg_restore and the psql that reads its SQL)
      for (const line of logOf(box)
        .split('\n')
        .filter((l) => l.startsWith('docker exec -i ')))
        assert.match(line, /^docker exec -i dbid (pg_restore -f |psql .* -f -$)/, line);
    });
  },
);
