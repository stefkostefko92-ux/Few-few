// Деплой файловете — единствената част от продукта, която НИКОЙ тест не е
// гледал, а тя е и единствената, при която грешката се вижда чак на бойния
// сървър.
//
// Поводът за този файл е конкретен: сложих `StartLimitIntervalSec` в секция
// `[Service]`. `node --check` не вижда unit файлове, 199 теста минаха зелени, а
// systemd просто ГО ИГНОРИРА — мълчаливо, с ред в журнала, който никой не чете.
// Тоест защитата от рестарт-цикъл я нямаше, а файлът изглеждаше сякаш я има.
// `systemd-analyze verify` го хвана за секунда; тези тестове го правят
// невъзможно да се върне, включително на машина без systemd.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Разбива unit файл на секции → { '[Unit]': ['Key=…', …], … }
function sections(text) {
  const out = {};
  let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      cur = line;
      out[cur] = [];
    } else if (cur) {
      out[cur].push(line);
    }
  }
  return out;
}
const keysOf = (lines) => lines.map((l) => l.split('=')[0]);

// Ключове, които systemd приема САМО в [Unit]. Сложени в [Service] той ги
// пропуска мълчаливо — най-подлият вид „конфигурация, която не работи".
const UNIT_ONLY = ['StartLimitIntervalSec', 'StartLimitBurst', 'StartLimitAction', 'After', 'Before', 'Wants', 'Requires', 'Description', 'Documentation'];
// И обратното: тези нямат смисъл извън [Service].
const SERVICE_ONLY = ['ExecStart', 'Restart', 'RestartSec', 'KillMode', 'TimeoutStopSec', 'User', 'WorkingDirectory', 'Environment', 'ReadWritePaths', 'ProtectHome', 'BindPaths', 'LimitNOFILE', 'OOMScoreAdjust'];

test('systemd unit: всеки ключ е в СВОЯТА секция', () => {
  const s = sections(read('deploy/vps-dashboard.service'));
  const unit = keysOf(s['[Unit]'] || []);
  const service = keysOf(s['[Service]'] || []);

  for (const k of UNIT_ONLY) {
    assert.ok(!service.includes(k), `${k} е в [Service] — systemd го ИГНОРИРА мълчаливо; мястото му е [Unit]`);
  }
  for (const k of SERVICE_ONLY) {
    assert.ok(!unit.includes(k), `${k} е в [Unit] — мястото му е [Service]`);
  }
  assert.ok(unit.includes('StartLimitIntervalSec'), 'границата за рестарт-цикъл трябва да съществува');
});

test('systemd unit: пътищата, които може да ги няма, са с префикс „-"', () => {
  const s = sections(read('deploy/vps-dashboard.service'));
  const rwp = (s['[Service]'] || []).find((l) => l.startsWith('ReadWritePaths='));
  assert.ok(rwp, 'ReadWritePaths трябва да е зададен');
  for (const p of rwp.split('=')[1].trim().split(/\s+/)) {
    // Без „-" липсваща папка проваля СТАРТА с 226/NAMESPACE, а на девствен
    // сървър /opt/few-few още не съществува.
    assert.ok(p.startsWith('-'), `${p} трябва да е „-${p}" — иначе липсваща папка не пуска услугата`);
  }
});

test('systemd unit: /root е с ЗАПИС, а не заключен от ProtectHome', () => {
  const s = sections(read('deploy/vps-dashboard.service'));
  const svc = s['[Service]'] || [];
  const protectHome = svc.find((l) => l.startsWith('ProtectHome='))?.split('=')[1];
  // `read-only` + `ReadWritePaths=/root` НЕ работи: при еднакви пътища systemd
  // пази по-рестриктивния режим. Качването на архив тогава пада с EROFS, а
  // autodeploy (който само чете) си върви — провал, който изглежда частичен.
  if (protectHome === 'read-only' || protectHome === 'true' || protectHome === 'yes') {
    assert.fail(`ProtectHome=${protectHome} прави /root само за четене — качването на архив ще пада с EROFS`);
  }
  if (protectHome === 'tmpfs') {
    assert.ok(svc.some((l) => l.startsWith('BindPaths=') && l.includes('/root')), 'ProtectHome=tmpfs иска BindPaths=/root, иначе папката е празна');
  }
});

test('nginx примерът позволява качването, което панелът рекламира', () => {
  const conf = read('deploy/nginx.conf.example');
  // Подразбирането на Nginx е 1 MB. Панелът приема 3 GB и праща файла с един
  // POST → без този ред всяко качване получава 413, преди да стигне до панела.
  assert.match(conf, /client_max_body_size\s+3g/, 'без client_max_body_size качването е невъзможно');
  assert.match(conf, /proxy_request_buffering\s+off/, 'иначе Nginx буферира 3 GB на диска');
  // WebSocket — само заради десктопа; панелът сам ползва SSE.
  assert.match(conf, /proxy_set_header\s+Upgrade\s+\$http_upgrade/);
  assert.match(conf, /map\s+\$http_upgrade\s+\$connection_upgrade/, '$connection_upgrade иска map в http контекста');
  // SSE изисква буферирането да е ИЗКЛЮЧЕНО, иначе живите потоци замръзват.
  assert.match(conf, /proxy_buffering\s+off/);
});

test('десктопът слуша САМО на loopback и не се вдига сам', () => {
  // Коментарите се махат ПРЕДИ проверката: този файл нарочно ОПИСВА какво няма
  // („няма privileged, няма network_mode: host") и наивният grep съвпада със
  // самото обяснение. Проверявай кода, не документацията му. (Хванато от този
  // тест при първото му пускане.)
  const yml = read('deploy/desktop/docker-compose.yml')
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n');
  // Целият модел „единственият път навътре е през панела" зависи от този префикс.
  assert.match(yml, /'127\.0\.0\.1:\d+:\d+'/, 'портът трябва да е вързан за 127.0.0.1');
  assert.ok(!/^\s*-\s*'?\d+:\d+'?\s*$/m.test(yml), 'няма публикуван порт без адрес');
  assert.match(yml, /restart:\s*'no'/, 'десктопът не бива да стартира с машината');
  // Достъп до Docker сокета би направил десктопа root на целия хост.
  assert.ok(!yml.includes('docker.sock'), 'десктопът няма работа с Docker сокета');
  assert.ok(!/privileged:\s*true/.test(yml), 'без privileged');
  assert.ok(!/network_mode:\s*host/.test(yml), 'без host мрежа');
  // Хостът се монтира само за четене.
  for (const m of yml.match(/- \/[^\n]*:\/host[^\n]*/g) || []) {
    assert.match(m, /:ro\s*$/, `${m.trim()} трябва да е :ro`);
  }
});

test('паролата на десктопа не може да влезе в репото', () => {
  const ignore = read('.gitignore');
  assert.match(ignore, /deploy\/desktop\/desktop\.env/);
  assert.match(ignore, /config\.json/);
  assert.match(ignore, /restic\.env/);
  assert.ok(!fs.existsSync(path.join(ROOT, 'deploy/desktop/desktop.env')), 'desktop.env не бива да съществува в репото');
});

test('install.sh не може да изтрие системна папка', () => {
  const sh = read('deploy/install.sh');
  // `rsync --delete` с APP_DIR=/opt (една сгрешена буква) трие /opt/medqr,
  // /opt/vizitka, /opt/nexus…
  assert.match(sh, /Опасен APP_DIR/, 'липсва предпазителят за APP_DIR');
  assert.match(sh, /NODE_MAJOR/, 'версията на Node трябва да се проверява, не да се предполага');
  // Локалните пътища минават през drop-in, защото autodeploy преинсталира unit-а.
  assert.match(sh, /\.service\.d/, 'локалните пътища трябва да са drop-in, не sed върху unit-а');
  assert.ok(!/sed -e "s#\^ExecStart=/.test(sh), 'sed върху unit файла се заличава при първия деплой');
});
