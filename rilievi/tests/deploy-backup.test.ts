// The daily backup (deploy/backup.sh, audit of 4 November 2026): the database dump and the photos — a
// hard-link snapshot, so it costs no space and a deleted photo stays as long as the dumps — the newest 14
// of each, the copy off the server when one is set (dumps and photos, never the secrets), and the
// "alive" signal. The real script runs with a
// stand-in `docker` (the dump, the volume) and the real rsync and curl; the restore test needs a real
// Docker and is switched off here (deploy/restore-test.sh).
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

const toolsHere = ['rsync', 'curl'].every((tool) => spawnSync(tool, ['--version']).status === 0);

const DOCKER = `#!/usr/bin/env bash
if [ "$1" = volume ]; then echo "$MEDIA_MOUNT"; exit 0; fi
if [ "$1" = compose ] && [ "$2" = exec ]; then echo "SELECT 1; -- dump"; exit 0; fi
exit 0
`;

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'rilievi-backup-'));
  const shared = join(dir, 'shared');
  const release = join(dir, 'release');
  const mount = join(dir, 'volume');
  for (const d of [join(release, 'deploy'), join(dir, 'bin'), join(mount, 'schede', 'c1'), shared])
    mkdirSync(d, { recursive: true });
  for (const script of ['backup.sh', 'alert.sh'])
    copyFileSync(
      join(import.meta.dirname, '..', 'deploy', script),
      join(release, 'deploy', script),
    );
  writeFileSync(join(release, 'docker-compose.yml'), 'services: {}\n');
  writeFileSync(join(shared, 'last-good'), `${release}\n`);
  writeFileSync(join(shared, '.env'), 'INTERVENTI_SEAL_KEY=chiave\n');
  writeFileSync(join(mount, 'schede', 'c1', 'foto.jpg'), 'jpeg');
  writeFileSync(join(dir, 'bin', 'docker'), DOCKER);
  chmodSync(join(dir, 'bin', 'docker'), 0o755);
  return { dir, shared, release, mount };
}

function backup(s: ReturnType<typeof setup>, env: Record<string, string> = {}) {
  return spawnSync('bash', [join(s.release, 'deploy', 'backup.sh')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(s.dir, 'bin')}:${process.env.PATH ?? ''}`,
      RILIEVI_SHARED: s.shared,
      RILIEVI_BACKUP_VERIFY: '0',
      MEDIA_MOUNT: s.mount,
      RILIEVI_LOCK: join(s.dir, 'rilievi-deploy.lock'),
      ...env,
    },
  });
}

describe('the daily backup', { skip: !toolsHere && 'rsync or curl are not installed here' }, () => {
  it('dumps the database, keeps the newest 14 and snapshots the photos without copying them', () => {
    const s = setup();
    const daily = join(s.shared, 'backups', 'daily');
    mkdirSync(daily, { recursive: true });
    for (let n = 0; n < 15; n += 1) {
      const old = join(daily, `rilievi-202601${String(n + 10).padStart(2, '0')}-031000.sql.gz`);
      writeFileSync(old, 'old');
      utimesSync(old, new Date(2026, 0, n + 1), new Date(2026, 0, n + 1));
    }
    const run = backup(s);
    assert.equal(run.status, 0, run.stderr);
    const dumps = readdirSync(daily).filter((f) => f.endsWith('.sql.gz'));
    assert.equal(dumps.length, 14, 'the newest 14');
    const fresh = dumps.find((f) => !f.startsWith('rilievi-202601'))!;
    assert.ok(fresh, 'today is there');
    assert.equal(statSync(join(daily, fresh)).mode & 0o777, 0o600);
    const gz = spawnSync('gzip', ['-dc', join(daily, fresh)], { encoding: 'utf8' });
    assert.match(gz.stdout, /SELECT 1/);

    const snapshots = readdirSync(join(s.shared, 'backups', 'media'));
    assert.equal(snapshots.length, 1);
    const kept = join(s.shared, 'backups', 'media', snapshots[0]!, 'c1', 'foto.jpg');
    // A hard link: the same file, no second copy on the disk.
    assert.equal(statSync(kept).ino, statSync(join(s.mount, 'schede', 'c1', 'foto.jpg')).ino);
    // Deleted from the portal, it is still in the snapshot.
    rmSync(join(s.mount, 'schede', 'c1', 'foto.jpg'));
    assert.equal(readFileSync(kept, 'utf8'), 'jpeg');
    assert.match(run.stdout, /nessuna|няма копие извън сървъра/);
    assert.ok(existsSync(join(s.shared, 'backups', 'ULTIMO_OK')));
  });

  it('copies dumps and photos off the server — never the secrets — and says it is alive', () => {
    const s = setup();
    // The folder over there is made once by the owner (DEPLOY.md, 6); rsync makes what is inside.
    const offsite = join(s.dir, 'offsite');
    mkdirSync(offsite);
    const beat = join(s.dir, 'beat.txt');
    writeFileSync(beat, 'ok');
    writeFileSync(
      join(s.shared, 'backup.env'),
      `RILIEVI_OFFSITE=${offsite}\nRILIEVI_HEARTBEAT_URL=file://${beat}\n`,
    );
    const run = backup(s);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(readdirSync(join(offsite, 'daily')).length, 1);
    assert.equal(readFileSync(join(offsite, 'media', 'c1', 'foto.jpg'), 'utf8'), 'jpeg');
    // The keys stay on the server: the owner copies them once, by hand (DEPLOY.md, 6).
    assert.ok(!existsSync(join(offsite, 'env')));
    assert.deepEqual(readdirSync(offsite).sort(), ['daily', 'media']);
    assert.match(run.stdout, /копие извън сървъра:/);
  });

  it('waits for a running deploy and fails loudly instead of dumping half a schema', () => {
    const s = setup();
    const lock = join(s.dir, 'rilievi-deploy.lock');
    // The deploy holds the shared lock (flock on the same file) for the whole run of the backup.
    const run = spawnSync('flock', [lock, 'bash', join(s.release, 'deploy', 'backup.sh')], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${join(s.dir, 'bin')}:${process.env.PATH ?? ''}`,
        RILIEVI_SHARED: s.shared,
        RILIEVI_BACKUP_VERIFY: '0',
        MEDIA_MOUNT: s.mount,
        RILIEVI_LOCK: lock,
        RILIEVI_LOCK_WAIT: '1',
      },
    });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /деплоят държи/);
    assert.ok(!existsSync(join(s.shared, 'backups', 'daily')), 'no dump while the deploy runs');
    assert.ok(!existsSync(join(s.shared, 'backups', 'ULTIMO_OK')));
  });

  it('fails loudly without a release that answered', () => {
    const s = setup();
    rmSync(join(s.shared, 'last-good'));
    const run = backup(s);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /last-good/);
  });
});
