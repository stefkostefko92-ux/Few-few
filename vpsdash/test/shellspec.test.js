// Всеки shell скрипт, който панелът сглобява, минава през `bash -n` (синтаксис,
// без изпълнение) с реалистичен вход.
//
// Защо: прегледът на снимка (restorePreviewSpec) завършваше с
// `echo "… натисни „Приложи"."` — затварящата кавичка беше ASCII, затваряше
// echo низа по-рано и bash падаше с „unexpected EOF while looking for matching".
// ВСЕКИ преглед — и с него автоматичната проба за възстановяване (drill.js) —
// излизаше с код 2. Unit тестовете проверяваха съдържанието на низа, никой не
// питаше bash дали изобщо е скрипт. Открито в лабораторията, не в кода.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-shellspec-'));
process.env.CSD_DUMP_DIR = DIR;
let m;

before(async () => {
  fs.writeFileSync(path.join(DIR, 'shop-20261023-211002.sql.gz'), 'x');
  fs.writeFileSync(path.join(DIR, 'demo-app.db-20261023-211002.sqlite.gz'), 'x');
  m = {
    backups: await import('../src/backups.js'),
    databases: await import('../src/databases.js'),
    drill: await import('../src/drill.js'),
    compose: await import('../src/compose.js'),
    redis: await import('../src/redis.js'),
    system: await import('../src/system.js'),
    apthealth: await import('../src/apthealth.js'),
    diskusage: await import('../src/diskusage.js'),
    webserver: await import('../src/webserver.js'),
    domains: await import('../src/domains.js'),
  };
});
after(() => fs.rmSync(DIR, { recursive: true, force: true }));

// Скриптът от спецификацията: `shell`, или `bash -c <скрипт>` в args.
function scriptOf(spec) {
  if (spec.shell) return spec.shell;
  if (spec.cmd === 'bash') {
    const i = (spec.args || []).findIndex((a) => a === '-c' || a === '-lc');
    if (i >= 0) return spec.args[i + 1];
  }
  return null;
}

function bashOk(label, spec) {
  const script = scriptOf(spec);
  if (script === null) return; // execFile с масив — няма shell, няма какво да се чупи
  try {
    execFileSync('bash', ['-n', '-c', script], { stdio: 'pipe' });
  } catch (e) {
    assert.fail(`${label}: bash -n отказва скрипта:\n${String(e.stderr)}`);
  }
}

test('прегледът на снимка е валиден bash — SQLite и Postgres (и пробата за възстановяване)', () => {
  bashOk('преглед Postgres', m.backups.restorePreviewSpec('shop-20261023-211002.sql.gz'));
  bashOk('преглед SQLite', m.backups.restorePreviewSpec('demo-app.db-20261023-211002.sqlite.gz'));
  bashOk('проба за възстановяване', m.drill.drillSpec());
});

test('възстановяването е валиден bash', () => {
  bashOk('прилагане SQLite', m.backups.restoreApplySpec('demo-app.db-20261023-211002.sqlite.gz', { path: '/opt/demo/data/app.db', unit: 'demo-app.service' }));
  bashOk('прилагане Postgres', m.backups.restoreApplySpec('shop-20261023-211002.sql.gz', { container: 'shop-db-1', database: 'shop' }));
});

test('снимките и бекъпът на всичко са валиден bash', () => {
  bashOk('снимка на всички бази', m.backups.backupAllSpec({ backups: {} }));
  bashOk('pg_dump', m.databases.postgresDumpSpec({ container: 'shop-db-1', database: 'shop' }));
  const db = path.join(DIR, 'app.db');
  fs.writeFileSync(db, '');
  bashOk('SQLite снимка', m.databases.sqliteDumpSpec(db));
});

test('системните действия са валиден bash', () => {
  const compose = path.join(DIR, 'docker-compose.yml');
  fs.writeFileSync(compose, 'services: {}\n');
  bashOk('compose restart', m.compose.composeActionSpec({ project: 'shop', configFile: compose, action: 'restart' }));
  bashOk('redis BGSAVE', m.redis.saveSpec('shop-cache-1'));
  bashOk('apt update', m.system.aptRefreshSpec());
  bashOk('apt upgrade', m.system.aptUpgradeSpec(false));
  bashOk('security upgrade', m.system.aptUpgradeSpec(true));
  bashOk('dpkg repair', m.apthealth.dpkgRepairSpec());
  bashOk('чистене на ядра', m.apthealth.kernelCleanSpec(['linux-image-6.8.0-40-generic']));
  bashOk('журнал vacuum', m.diskusage.vacuumJournalSpec(200));
  bashOk('builder prune', m.diskusage.pruneBuildCacheSpec());
  bashOk('сканиране на диска', m.diskusage.scanSpec({ paths: { stateDir: DIR } }, { root: '/', depth: 2, minMB: 50 }));
  bashOk('подновяване на сертификати', m.webserver.certRenewSpec({ dry: true }));
  bashOk('издаване на сертификат', m.domains.issueSpec(['demo.example.eu'], { email: 'a@b.eu' }));
});
