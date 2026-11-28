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
    desktop: await import('../src/desktop.js'),
  };
});
after(() => fs.rmSync(DIR, { recursive: true, force: true }));

// Скриптът от спецификацията и КОЙ shell го чете. Досега се познаваха само
// `shell` и `cmd: 'bash'` — `cmd: 'sh'` и `docker exec <к> sh -c …` минаваха като
// „няма shell" и гейтът беше сляп точно за тях (поука на Кодаджията и
// VPS-аджията): BGSAVE на Redis не беше проверяван нито веднъж.
const SHELLS = new Set(['bash', 'sh', 'dash', 'ash', '/bin/bash', '/bin/sh', '/usr/bin/bash']);
const C_FLAG = /^-[a-z]*c$/; // -c, -lc, -ec, -euc…
export function scriptOf(spec) {
  if (spec.shell) return { shell: 'bash', script: spec.shell }; // jobs.js: bash -lc
  const argv = [spec.cmd, ...(spec.args || [])];
  for (let i = 0; i < argv.length - 1; i++) {
    if (SHELLS.has(argv[i]) && C_FLAG.test(argv[i + 1]) && typeof argv[i + 2] === 'string') {
      return { shell: argv[i].replace(/^.*\//, ''), script: argv[i + 2] };
    }
  }
  return null;
}

// bash скриптът минава през `bash -n`; POSIX sh (в alpine контейнерите е busybox
// ash) — през `dash -n`, защото bash -n приема и bash-изми, които там гърмят.
function shellOk(label, shell, script) {
  const checker = shell === 'bash' ? 'bash' : 'dash';
  try {
    execFileSync(checker, ['-n', '-c', script], { stdio: 'pipe' });
  } catch (e) {
    assert.fail(`${label}: ${checker} -n отказва скрипта:\n${String(e.stderr)}`);
  }
}

function bashOk(label, spec) {
  const found = scriptOf(spec);
  if (found === null) return; // execFile с масив — няма shell, няма какво да се чупи
  shellOk(label, found.shell, found.script);
}

// Спецификация, която ТРЯБВА да носи shell: ако разпознаването я изпусне,
// проверката е празна, а тестът — зелен. Затова тук „не намерих" е провал.
function mustShell(label, spec) {
  assert.ok(scriptOf(spec), `${label}: очаквах shell скрипт, а разпознаването не го намери`);
  bashOk(label, spec);
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
  mustShell('redis BGSAVE (контейнер, docker exec sh -c)', m.redis.saveSpec('shop-cache-1'));
  mustShell('redis BGSAVE (системен, sh -c)', m.redis.saveSpec('host:6379'));
  shellOk('redis INFO (docker exec sh -c)', 'sh', m.redis.INFO_SH);
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

test('разпознаването вижда всеки вид shell — и не измисля такъв', () => {
  assert.deepEqual(scriptOf({ shell: 'echo 1' }), { shell: 'bash', script: 'echo 1' });
  assert.deepEqual(scriptOf({ cmd: 'sh', args: ['-c', 'echo 2', 'sh', '6379'] }), { shell: 'sh', script: 'echo 2' });
  assert.deepEqual(scriptOf({ cmd: 'docker', args: ['exec', 'r', 'sh', '-c', 'echo 3'] }), { shell: 'sh', script: 'echo 3' });
  assert.deepEqual(scriptOf({ cmd: 'bash', args: ['-lc', 'echo 4'] }), { shell: 'bash', script: 'echo 4' });
  assert.equal(scriptOf({ cmd: 'tar', args: ['-czf', 'a.tgz', '-c', 'x'] }), null, 'tar не е shell');
  assert.equal(scriptOf({ cmd: 'bash', args: ['/opt/x/autodeploy.sh'] }), null, 'файл, не низ');
});

// Храпов механизъм: всеки модул, който сглобява shell, е изброен тук — със
// спецификациите си в тази или в посочената тестова папка. Нов модул с shell, който
// никой не проверява, пада ТУК, вместо да чака лабораторията.
const SHELL_COVERAGE = {
  'backups.js': 'shellspec + backupscripts.test.js',
  'databases.js': 'shellspec',
  'deploy.js': 'bash <файл> — скрипт от диска, не низ (autodeploy.sh минава през собствения си гейт)',
  'desktop.js': 'shellspec (actionSpec)',
  'fileops.js': 'fileops.test.js (TAR_SAFE_SH: bash -n + истински tar със setuid и FIFO)',
  'diskusage.js': 'shellspec + diskusage.test.js',
  'machine.js': 'machine.test.js (swap)',
  'portchange.js': 'ports.test.js',
  'reclaim.js': 'reclaim.test.js',
  'redis.js': 'shellspec (BGSAVE и INFO, двата вида)',
  'routes.js': 'терминалът — командата е на човека, не наша',
  'selfcheck.js': '`command -v` с име от затворен списък',
  'volumes.js': 'volrestore.test.js',
  'panelbackup.js': 'panelbackup.test.js',
  'apthealth.js': 'shellspec',
  'system.js': 'shellspec',
  'webserver.js': 'shellspec',
  'domains.js': 'shellspec',
  'drill.js': 'shellspec',
  'compose.js': 'shellspec',
};
test('всеки модул, който сглобява shell, е покрит от гейта', () => {
  const src = path.resolve(import.meta.dirname, '..', 'src');
  const RX = /\bshell:\s*[`'"]|cmd:\s*'(?:ba)?sh'|'(?:ba)?sh',\s*'-[a-z]*c'/;
  const missing = fs.readdirSync(src).filter((f) => f.endsWith('.js') && RX.test(fs.readFileSync(path.join(src, f), 'utf8')) && !SHELL_COVERAGE[f]);
  assert.deepEqual(missing, [], 'модули с shell без проверка — добави спецификациите им в гейта и ред в SHELL_COVERAGE');
});

test('десктопът е валиден bash', () => {
  for (const a of ['start', 'stop', 'pull']) {
    let spec;
    try {
      spec = m.desktop.actionSpec({ desktop: {} }, a);
    } catch {
      continue; // действие, което тази версия не познава
    }
    bashOk(`десктоп ${a}`, spec);
  }
});
