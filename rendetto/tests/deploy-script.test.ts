import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { ROOT } from '../src/paths.js';

/**
 * deploy/deploy.sh се пуска истински (bash), върху временна файлова система: docker, curl, nginx,
 * systemctl и node са заместени с функции, които пишат в дневник какво са извикани.
 */
const DOMAIN = 'rendetto.carbonstealth.eu';
const VHOST = join(ROOT, 'deploy', 'nginx', `${DOMAIN}.conf`);

interface Layout {
  base: string;
  app: string;
  shared: string;
  le: string;
  site: string;
  link: string;
  log: string;
}

function layout(): Layout {
  const base = mkdtempSync(join(tmpdir(), 'rendetto-deploy-'));
  const app = join(base, 'release', 'rendetto');
  mkdirSync(join(app, 'deploy', 'nginx'), { recursive: true });
  copyFileSync(join(ROOT, 'deploy', 'deploy.sh'), join(app, 'deploy', 'deploy.sh'));
  copyFileSync(VHOST, join(app, 'deploy', 'nginx', `${DOMAIN}.conf`));
  mkdirSync(join(base, 'release', 'tools', 'seo'), { recursive: true });
  writeFileSync(join(base, 'release', 'tools', 'seo', 'indexnow.mjs'), '');
  mkdirSync(join(base, 'nginx', 'sites-available'), { recursive: true });
  mkdirSync(join(base, 'nginx', 'sites-enabled'), { recursive: true });
  return {
    base,
    app,
    shared: join(base, 'shared'),
    le: join(base, 'le'),
    site: join(base, 'nginx', 'sites-available', 'rendetto'),
    link: join(base, 'nginx', 'sites-enabled', 'rendetto'),
    log: join(base, 'log.txt'),
  };
}

function sharedEnv(L: Layout, data = join(L.shared, 'data')): void {
  mkdirSync(L.shared, { recursive: true });
  writeFileSync(
    join(L.shared, '.env'),
    `PUBLIC_BASE_URL=https://${DOMAIN}\nPOSTGRES_PASSWORD=pw\nRENDETTO_DATA=${data}\n`,
  );
}

const STUBS = `
id() { echo 0; }
sleep() { :; }
install() {
  local a=()
  while [ $# -gt 0 ]; do case "$1" in -o|-g) shift 2 ;; *) a+=("$1"); shift ;; esac; done
  command install "\${a[@]}"
}
docker() {
  echo "docker $*" >> "$LOG"
  case "$*" in
    "volume inspect rendetto_db-data") return "$VOLUME_RC" ;;
    "compose exec -T db pg_dump"*) [ "$DUMP_RC" = 0 ] && echo "-- dump"; return "$DUMP_RC" ;;
    "compose exec -T db psql"*) echo 1 ;;
    "compose build app") return "$BUILD_RC" ;;
  esac
  return 0
}
curl() {
  local url="\${*: -1}"
  echo "curl $url" >> "$LOG"
  case "$url" in
    */health) printf '%s' "$HEALTH_BODY" ;;
    */sitemap.xml) printf '%s' "$SITEMAP" ;;
  esac
}
nginx() { echo "nginx $*" >> "$LOG"; if [ "$1" = -t ]; then return "$NGINX_T_RC"; fi; }
systemctl() { echo "systemctl $*" >> "$LOG"; }
node() { echo "node $*" >> "$LOG"; }
`;

function deploy(L: Layout, env: Record<string, string> = {}) {
  const res = spawnSync('bash', ['-c', `source "$SCRIPT"\n${STUBS}\nmain`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SCRIPT: join(L.app, 'deploy', 'deploy.sh'),
      LOG: L.log,
      RENDETTO_SHARED: L.shared,
      RENDETTO_LE_DIR: L.le,
      RENDETTO_NGINX_SITE: L.site,
      RENDETTO_NGINX_LINK: L.link,
      RENDETTO_HEALTH_WAIT: '0',
      VOLUME_RC: '1',
      DUMP_RC: '0',
      BUILD_RC: '0',
      NGINX_T_RC: '0',
      HEALTH_BODY: '{"status":"ok","app":"rendetto"}',
      SITEMAP: '<urlset/>',
      ...env,
    },
  });
  const log = existsSync(L.log) ? readFileSync(L.log, 'utf8') : '';
  writeFileSync(L.log, '');
  return { status: res.status, stderr: res.stderr, log };
}

const mode = (path: string) => (statSync(path).mode & 0o777).toString(8);
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

function withLayout(run: (L: Layout) => void): void {
  const L = layout();
  try {
    run(L);
  } finally {
    rmSync(L.base, { recursive: true, force: true });
  }
}

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
    assert.doesNotMatch(r.log, /pg_dump/);
    assert.match(r.log, /docker compose build app\ndocker compose up -d --remove-orphans\n/);
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

test('a redeploy dumps the database before the build, keeps five dumps and skips an unchanged sitemap', () => {
  withLayout((L) => {
    sharedEnv(L);
    const backups = join(L.shared, 'backups');
    mkdirSync(backups, { recursive: true });
    for (let i = 0; i < 6; i++) {
      const old = join(backups, `pre-deploy-19990101-00000${i}.sql.gz`);
      writeFileSync(old, 'old');
      utimesSync(old, new Date(2026, 0, i + 1), new Date(2026, 0, i + 1));
    }
    writeFileSync(join(L.shared, 'indexnow-sitemap.sha256'), `${sha('<urlset/>')}\n`);
    const r = deploy(L, { VOLUME_RC: '0' });
    assert.equal(r.status, 0, r.stderr);
    const order = ['volume inspect', 'compose up -d --wait db', 'pg_dump', 'compose build app'];
    const at = order.map((step) => r.log.indexOf(step));
    assert.deepEqual(
      at,
      [...at].sort((a, b) => a - b),
      'backup first, then the build',
    );
    assert.ok(!at.includes(-1), r.log);
    const kept = readdirSync(backups);
    assert.equal(kept.length, 5);
    const fresh = kept.find((name) => !name.startsWith('pre-deploy-1999'));
    assert.ok(fresh, 'the new dump is among the five');
    assert.equal(gunzipSync(readFileSync(join(backups, fresh))).toString(), '-- dump\n');
    assert.equal(mode(join(backups, fresh)), '600');
    assert.doesNotMatch(r.log, /^node /m, 'the same sitemap is not submitted again');
  });
});

test('a failed dump stops before the build and leaves no partial file', () => {
  withLayout((L) => {
    sharedEnv(L);
    const r = deploy(L, { VOLUME_RC: '0', DUMP_RC: '1' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /не мигрирам без бекъп/);
    assert.doesNotMatch(r.log, /compose build/);
    assert.deepEqual(readdirSync(join(L.shared, 'backups')), []);
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

test('with a certificate the vhost from the repo is installed and reloaded; a refused one is rolled back', () => {
  withLayout((L) => {
    sharedEnv(L);
    mkdirSync(join(L.le, 'live', DOMAIN), { recursive: true });
    writeFileSync(join(L.le, 'live', DOMAIN, 'fullchain.pem'), '');
    mkdirSync(join(L.le, 'renewal'), { recursive: true });
    writeFileSync(
      join(L.le, 'renewal', `${DOMAIN}.conf`),
      '[renewalparams]\nauthenticator = nginx\n',
    );

    const first = deploy(L);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(readFileSync(L.site, 'utf8'), readFileSync(VHOST, 'utf8'));
    assert.equal(readlinkSync(L.link), L.site);
    assert.match(first.log, /nginx -t\nsystemctl reload nginx\n/);
    assert.match(first.stderr, /certbot не презарежда nginx след подновяване/);

    writeFileSync(
      join(L.le, 'renewal', `${DOMAIN}.conf`),
      '[renewalparams]\nauthenticator = nginx\nrenew_hook = systemctl reload nginx\n',
    );
    const same = deploy(L);
    assert.doesNotMatch(same.log, /nginx -t|systemctl reload/, 'in sync: nothing to reload');
    assert.doesNotMatch(same.stderr, /certbot не презарежда/);

    const changed = join(L.app, 'deploy', 'nginx', `${DOMAIN}.conf`);
    writeFileSync(changed, `${readFileSync(VHOST, 'utf8')}# промяна\n`);
    const refused = deploy(L, { NGINX_T_RC: '1' });
    assert.equal(refused.status, 0, 'the app is live; only nginx kept the old vhost');
    assert.equal(
      readFileSync(L.site, 'utf8'),
      readFileSync(VHOST, 'utf8'),
      'the old vhost is back',
    );
    assert.doesNotMatch(refused.log, /systemctl reload/);
    assert.match(refused.stderr, /nginx -t отказа новия vhost/);
    assert.deepEqual(
      readdirSync(join(L.base, 'nginx', 'sites-available')),
      ['rendetto'],
      'no backup copy left behind',
    );
  });
});
