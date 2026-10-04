import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { deploy, mode, sha, sharedEnv, withLayout } from './deploy-harness.js';

test('without a .env anywhere it stops with code 3 and builds nothing', () => {
  withLayout((L) => {
    const r = deploy(L);
    assert.equal(r.status, 3);
    assert.match(r.stderr, /тайни не се измислят/);
    assert.doesNotMatch(r.log, /compose build/);
  });
});

test('first deploy: secrets from the shared path, no backup without a volume, IndexNow once', () => {
  withLayout((L) => {
    sharedEnv(L);
    const r = deploy(L);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(
      readFileSync(join(L.app, '.env'), 'utf8'),
      readFileSync(join(L.shared, '.env'), 'utf8'),
    );
    assert.equal(mode(join(L.app, '.env')), '600');
    assert.equal(mode(L.shared), '700', 'the shared folder holds the backups too');
    assert.equal(mode(join(L.shared, 'data')), '700');
    assert.doesNotMatch(r.log, /pg_dump|--wait db/);
    assert.match(
      r.log,
      /docker compose build app\ndocker volume inspect rendetto_db-data\ndocker compose up -d --remove-orphans\n/,
    );
    // без сертификат nginx не се пипа, а командата за сертификата е казана
    assert.doesNotMatch(r.log, /nginx -t/);
    assert.match(r.stderr, /certbot certonly --nginx -d rendetto\.carbonstealth\.eu/);
    assert.match(
      r.log,
      /node \S+\/tools\/seo\/indexnow\.mjs https:\/\/rendetto\.carbonstealth\.eu\n/,
    );
    assert.equal(
      readFileSync(join(L.shared, 'indexnow-sitemap.sha256'), 'utf8'),
      `${sha('<urlset/>')}\n`,
    );
  });
});

test('a redeploy builds first, dumps right before the swap, keeps the five newest dumps and skips an unchanged sitemap', () => {
  withLayout((L) => {
    sharedEnv(L);
    const backups = join(L.shared, 'backups');
    mkdirSync(backups, { recursive: true });
    const old = (i: number) => `pre-deploy-19990101-00000${i}.sql.gz`;
    for (let i = 0; i < 6; i++) {
      writeFileSync(join(backups, old(i)), 'old');
      utimesSync(join(backups, old(i)), new Date(2026, 0, i + 1), new Date(2026, 0, i + 1));
    }
    writeFileSync(join(L.shared, 'indexnow-sitemap.sha256'), `${sha('<urlset/>')}\n`);
    const r = deploy(L, { VOLUME_RC: '0' });
    assert.equal(r.status, 0, r.stderr);
    // the dump comes after the build, so a restore does not lose the writes of the build minutes
    const order = [
      'compose build app',
      'volume inspect',
      'compose up -d --no-recreate --wait db',
      'pg_dump --clean --if-exists -U rendetto -d rendetto',
      'compose up -d --remove-orphans',
    ];
    const at = order.map((step) => r.log.indexOf(step));
    assert.ok(!at.includes(-1), r.log);
    assert.deepEqual(
      at,
      [...at].sort((a, b) => a - b),
      'build, then the dump, then the swap',
    );
    const kept = readdirSync(backups).sort();
    const fresh = kept.find((name) => !name.startsWith('pre-deploy-1999'));
    assert.ok(fresh, 'the new dump is among the five');
    // the rotation drops the two oldest by time, not any two
    assert.deepEqual(kept, [old(2), old(3), old(4), old(5), fresh].sort());
    assert.equal(gunzipSync(readFileSync(join(backups, fresh))).toString(), '-- dump\n');
    assert.equal(mode(join(backups, fresh)), '600');
    assert.doesNotMatch(r.log, /^node /m, 'the same sitemap is not submitted again');
  });
});

test('a failed build stops with code 1: no dump, no swap, nothing remembered', () => {
  withLayout((L) => {
    sharedEnv(L);
    const r = deploy(L, { VOLUME_RC: '0', BUILD_RC: '1' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /build се провали — работещите контейнери не са пипани/);
    assert.doesNotMatch(r.log, /volume inspect|pg_dump|compose up/);
    assert.equal(existsSync(join(L.shared, 'backups')), false);
    assert.equal(existsSync(join(L.shared, 'last-good')), false);
  });
});

test('a failed dump after the build stops before the swap and leaves no partial file', () => {
  withLayout((L) => {
    sharedEnv(L);
    const r = deploy(L, { VOLUME_RC: '0', DUMP_RC: '1' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /бекъпът преди миграция се провали — не мигрирам без бекъп/);
    assert.match(r.log, /docker compose build app\n/);
    assert.doesNotMatch(r.log, /--remove-orphans/);
    assert.deepEqual(readdirSync(join(L.shared, 'backups')), []);
  });
});

test('a database that does not start for the dump stops before the swap: code 1', () => {
  withLayout((L) => {
    sharedEnv(L);
    const r = deploy(L, { VOLUME_RC: '0', DB_UP_RC: '1' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /базата не тръгна за бекъпа/);
    assert.doesNotMatch(r.log, /pg_dump|--remove-orphans/);
  });
});

test('a failed `compose up` after the dump is code 4: the containers may already be changed', () => {
  withLayout((L) => {
    sharedEnv(L);
    const r = deploy(L, { VOLUME_RC: '0', UP_RC: '1' });
    assert.equal(r.status, 4);
    assert.match(r.stderr, /docker compose up се провали/);
    assert.equal(readdirSync(join(L.shared, 'backups')).length, 1, 'the dump was taken first');
    assert.doesNotMatch(r.log, /\/health/);
    assert.equal(existsSync(join(L.shared, 'last-good')), false);
  });
});

test('RENDETTO_DATA inside the release is refused before anything runs', () => {
  withLayout((L) => {
    sharedEnv(L, './data');
    const r = deploy(L);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /RENDETTO_DATA/);
    assert.doesNotMatch(r.log, /compose (build|up)|volume/);
  });
});

test('a 200 without the Rendetto marker is another app on the port: code 4', () => {
  withLayout((L) => {
    sharedEnv(L);
    const r = deploy(L, { HEALTH_BODY: '{"status":"ok"}' });
    assert.equal(r.status, 4);
    assert.match(r.stderr, /не отговаря Rendetto/);
  });
});

test('Rendetto answering without its database (status other than ok) is unhealthy too: code 4', () => {
  withLayout((L) => {
    sharedEnv(L);
    const r = deploy(L, { HEALTH_BODY: '{"status":"degraded","app":"rendetto"}' });
    assert.equal(r.status, 4);
    assert.match(r.stderr, /не отговаря Rendetto/);
    assert.equal(existsSync(join(L.shared, 'last-good')), false);
    assert.doesNotMatch(r.log, /nginx -t|^node /m, 'nothing after the probe runs');
  });
});

test('a rollback (RENDETTO_SKIP_BACKUP=1) makes no new dump and rotates nothing', () => {
  withLayout((L) => {
    sharedEnv(L);
    const backups = join(L.shared, 'backups');
    mkdirSync(backups, { recursive: true });
    writeFileSync(join(backups, 'pre-deploy-19990101-000000.sql.gz'), 'before the migration');
    const r = deploy(L, { VOLUME_RC: '0', RENDETTO_SKIP_BACKUP: '1' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /RENDETTO_SKIP_BACKUP=1/);
    assert.doesNotMatch(r.log, /pg_dump|--wait db|volume inspect/);
    assert.match(r.log, /docker compose build app\ndocker compose up -d --remove-orphans\n/);
    assert.deepEqual(readdirSync(backups), ['pre-deploy-19990101-000000.sql.gz']);
  });
});

test('a database password that breaks DATABASE_URL is refused before anything runs', () => {
  withLayout((L) => {
    sharedEnv(L);
    const env = readFileSync(join(L.shared, '.env'), 'utf8');
    writeFileSync(
      join(L.shared, '.env'),
      env.replace('POSTGRES_PASSWORD=pw', 'POSTGRES_PASSWORD=ab/cd'),
    );
    const r = deploy(L, { VOLUME_RC: '0' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /POSTGRES_PASSWORD.*openssl rand -hex 32/);
    assert.doesNotMatch(r.log, /pg_dump|compose (build|up)/);
  });
});

test('a live release is remembered as last-good by its real path; a failed one is not', () => {
  withLayout((L) => {
    sharedEnv(L);
    const failed = deploy(L, { HEALTH_BODY: '' });
    assert.equal(failed.status, 4);
    assert.equal(existsSync(join(L.shared, 'last-good')), false);
    const live = deploy(L);
    assert.equal(live.status, 0, live.stderr);
    assert.equal(readFileSync(join(L.shared, 'last-good'), 'utf8'), `${realpathSync(L.app)}\n`);
  });
});
