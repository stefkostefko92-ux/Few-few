import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../src/paths.js';

/**
 * deploy/deploy.sh се пуска истински (bash), върху временна файлова система: docker, curl, nginx,
 * systemctl и node са заместени с функции, които пишат в дневник какво са извикани. Unit-ите на бекъпа
 * и korpora-backup отиват във временни папки (systemd, sbin), не в /etc и /usr/local.
 */
export const DOMAIN = 'korpora.carbonstealth.eu';
export const VHOST = join(ROOT, 'deploy', 'nginx', `${DOMAIN}.conf`);

export interface Layout {
  base: string;
  app: string;
  shared: string;
  le: string;
  site: string;
  link: string;
  log: string;
  systemd: string;
  sbin: string;
}

/** The deploy/ files the release carries for the daily backup (installed by backup-install.sh). */
export const BACKUP_FILES = [
  'backup.sh',
  'backup-restore.sh',
  'backup-install.sh',
  'systemd/korpora-backup.service',
  'systemd/korpora-backup.timer',
];

function layout(): Layout {
  const base = mkdtempSync(join(tmpdir(), 'korpora-deploy-'));
  const app = join(base, 'release', 'korpora');
  mkdirSync(join(app, 'deploy', 'nginx'), { recursive: true });
  copyFileSync(join(ROOT, 'deploy', 'deploy.sh'), join(app, 'deploy', 'deploy.sh'));
  copyFileSync(VHOST, join(app, 'deploy', 'nginx', `${DOMAIN}.conf`));
  mkdirSync(join(app, 'deploy', 'systemd'), { recursive: true });
  for (const file of BACKUP_FILES)
    copyFileSync(join(ROOT, 'deploy', file), join(app, 'deploy', file));
  mkdirSync(join(base, 'systemd'), { recursive: true });
  mkdirSync(join(base, 'sbin'), { recursive: true });
  mkdirSync(join(base, 'release', 'tools', 'seo'), { recursive: true });
  writeFileSync(join(base, 'release', 'tools', 'seo', 'indexnow.mjs'), '');
  mkdirSync(join(base, 'nginx', 'sites-available'), { recursive: true });
  mkdirSync(join(base, 'nginx', 'sites-enabled'), { recursive: true });
  return {
    base,
    app,
    shared: join(base, 'shared'),
    le: join(base, 'le'),
    site: join(base, 'nginx', 'sites-available', 'korpora'),
    link: join(base, 'nginx', 'sites-enabled', 'korpora'),
    log: join(base, 'log.txt'),
    systemd: join(base, 'systemd'),
    sbin: join(base, 'sbin'),
  };
}

export function sharedEnv(L: Layout, data = join(L.shared, 'data'), extra = ''): void {
  mkdirSync(L.shared, { recursive: true });
  writeFileSync(
    join(L.shared, '.env'),
    `PUBLIC_BASE_URL=https://${DOMAIN}\nPOSTGRES_PASSWORD=pw\nKORPORA_DATA=${data}\n${extra}`,
  );
}

/** Сертификат (и renewal без кука за reload) — с него деплоят слага vhost-а. */
export function certificate(L: Layout): void {
  mkdirSync(join(L.le, 'live', DOMAIN), { recursive: true });
  writeFileSync(join(L.le, 'live', DOMAIN, 'fullchain.pem'), '');
  mkdirSync(join(L.le, 'renewal'), { recursive: true });
  writeFileSync(
    join(L.le, 'renewal', `${DOMAIN}.conf`),
    '[renewalparams]\nauthenticator = nginx\n',
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
    "volume inspect korpora_db-data") return "$VOLUME_RC" ;;
    "compose exec -T db pg_dump"*) [ "$DUMP_RC" = 0 ] && echo "-- dump"; return "$DUMP_RC" ;;
    "compose exec -T db psql"*) echo 1 ;;
    "compose build app") return "$BUILD_RC" ;;
    "compose run --rm --no-deps --entrypoint node app dist/scripts/catalog-check.js") return "$CATALOG_RC" ;;
    "compose up -d --no-recreate --wait db") return "$DB_UP_RC" ;;
    "compose up -d --remove-orphans") return "$UP_RC" ;;
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
systemctl() { echo "systemctl $*" >> "$LOG"; return "$SYSTEMCTL_RC"; }
node() { echo "node $*" >> "$LOG"; }
`;

export function deploy(L: Layout, env: Record<string, string> = {}) {
  const res = spawnSync('bash', ['-c', `source "$SCRIPT"\n${STUBS}\nmain`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SCRIPT: join(L.app, 'deploy', 'deploy.sh'),
      LOG: L.log,
      KORPORA_SHARED: L.shared,
      KORPORA_LE_DIR: L.le,
      KORPORA_NGINX_SITE: L.site,
      KORPORA_NGINX_LINK: L.link,
      KORPORA_HEALTH_WAIT: '0',
      KORPORA_SYSTEMD_DIR: L.systemd,
      KORPORA_SBIN: L.sbin,
      // any existing command stands for age: the deploy only asks whether it is installed
      KORPORA_AGE: 'true',
      VOLUME_RC: '1',
      DUMP_RC: '0',
      BUILD_RC: '0',
      CATALOG_RC: '0',
      DB_UP_RC: '0',
      UP_RC: '0',
      NGINX_T_RC: '0',
      SYSTEMCTL_RC: '0',
      HEALTH_BODY: '{"status":"ok","app":"korpora"}',
      SITEMAP: '<urlset/>',
      ...env,
    },
  });
  const log = existsSync(L.log) ? readFileSync(L.log, 'utf8') : '';
  writeFileSync(L.log, '');
  return { status: res.status, stdout: res.stdout, stderr: res.stderr, log };
}

export const mode = (path: string) => (statSync(path).mode & 0o777).toString(8);
export const sha = (text: string) => createHash('sha256').update(text).digest('hex');

export function withLayout(run: (L: Layout) => void): void {
  const L = layout();
  try {
    run(L);
  } finally {
    rmSync(L.base, { recursive: true, force: true });
  }
}
