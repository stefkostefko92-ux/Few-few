// Redis (eviction, персистентност) и бекъп на томове/качени файлове.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInfo, parseKeyspace, summarize, evictionChecks, saveSpec, assertName } from '../src/redis.js';
import { assertVolume, parseSize, volumeBackupSpec, backupAllVolumesSpec, archiveName } from '../src/volumes.js';
import { loadConfig } from '../src/config.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { desktopPort, actionSpec, status, forwardAuth, forwardCookies, PANEL_COOKIE, desktopUser, desktopImage, desktopMem } from '../src/desktop.js';

// Реален изход на `redis-cli INFO`, съкратен до нужното.
const INFO = `# Server
redis_version:7.2.4
uptime_in_seconds:864000

# Clients
connected_clients:12
blocked_clients:0

# Memory
used_memory:130023424
used_memory_human:124.00M
maxmemory:134217728
maxmemory_policy:allkeys-lru

# Persistence
aof_enabled:1
rdb_last_save_time:1774000000
rdb_changes_since_last_save:42
rdb_last_bgsave_status:ok

# Stats
expired_keys:9001
evicted_keys:1234
keyspace_hits:900
keyspace_misses:100
rejected_connections:0

# Keyspace
db0:keys=5000,expires=4000,avg_ttl=0
db1:keys=12,expires=0,avg_ttl=0
`;

test('INFO се разбира, коментарите се прескачат', () => {
  const info = parseInfo(INFO);
  assert.equal(info.redis_version, '7.2.4');
  assert.equal(info.evicted_keys, '1234');
  assert.equal(info['# Server'], undefined, 'заглавията на секциите не са ключове');
  assert.deepEqual(parseInfo(''), {});
  assert.deepEqual(parseInfo(null), {});
});

test('keyspace се подрежда по брой ключове', () => {
  const k = parseKeyspace(parseInfo(INFO));
  assert.deepEqual(k, [
    { db: 'db0', keys: 5000, expires: 4000 },
    { db: 'db1', keys: 12, expires: 0 },
  ]);
});

test('обобщението вади точно това, което решава', () => {
  const s = summarize(parseInfo(INFO));
  assert.equal(s.usedMemory, 130023424);
  assert.equal(s.maxMemory, 134217728);
  assert.equal(s.memoryPct, 96.9);
  assert.equal(s.policy, 'allkeys-lru');
  assert.equal(s.evicts, true, 'allkeys-lru + таван значи, че ТРИЕ');
  assert.equal(s.evictedKeys, 1234);
  assert.equal(s.totalKeys, 5012);
  assert.equal(s.hitRate, 90);
  assert.equal(s.persistence, 'AOF');
});

test('без таван процентът е null, не деление на нула', () => {
  const s = summarize(parseInfo('used_memory:1000\nmaxmemory:0\nmaxmemory_policy:noeviction\n'));
  assert.equal(s.memoryPct, null);
  assert.equal(s.evicts, false, 'noeviction без таван не трие нищо');
  assert.equal(s.persistence, 'НЯМА', 'нито AOF, нито RDB');
});

test('изхвърлянето се лови по РАЗЛИКА — общият брой расте вечно', () => {
  const prev = [{ name: 'r', ok: true, evictedKeys: 1234, rejectedConnections: 0, memoryPct: 50 }];
  const now = [{ name: 'r', ok: true, evictedKeys: 1300, rejectedConnections: 0, memoryPct: 50, policy: 'allkeys-lru', maxMemory: 134217728, evicts: true, persistence: 'AOF', totalKeys: 10 }];
  const f = evictionChecks(prev, now);
  const evict = f.find((x) => x.key === 'redis-evict:r');
  assert.ok(evict, 'ръст на изхвърлените трябва да гърми');
  assert.match(evict.body, /66 изхвърлени/);
  assert.match(evict.body, /тиха/, 'известието обяснява ЗАЩО не си го видял');
  // Същият брой → мълчание. Иначе гърми вечно заради стари изхвърляния.
  assert.equal(evictionChecks(now, now).find((x) => x.key === 'redis-evict:r'), undefined);
  // Първа проверка (без предишна снимка) също мълчи.
  assert.equal(evictionChecks(null, now).find((x) => x.key === 'redis-evict:r'), undefined);
});

test('пълна памет: тежестта зависи от политиката', () => {
  const base = { name: 'r', ok: true, evictedKeys: 0, rejectedConnections: 0, totalKeys: 5, persistence: 'AOF' };
  const lru = evictionChecks([], [{ ...base, memoryPct: 95, policy: 'allkeys-lru', evicts: true }]);
  assert.equal(lru.find((x) => x.key === 'redis-mem:r').severity, 'warning', 'трие, но продължава да работи');
  const noev = evictionChecks([], [{ ...base, memoryPct: 95, policy: 'noeviction', evicts: false }]);
  assert.equal(noev.find((x) => x.key === 'redis-mem:r').severity, 'critical', 'записите ще почнат да гърмят');
  assert.match(noev.find((x) => x.key === 'redis-mem:r').body, /ЗАПИСИТЕ/);
});

test('липсваща персистентност и провалена снимка са отделни находки', () => {
  const noPersist = evictionChecks([], [{ name: 'r', ok: true, evictedKeys: 0, rejectedConnections: 0, persistence: 'НЯМА', totalKeys: 5000, memoryPct: 10 }]);
  assert.match(noPersist.find((x) => x.key === 'redis-persist:r').body, /рестарт.*изтрива/);
  // Празен Redis без персистентност не е проблем — няма какво да се загуби.
  assert.equal(evictionChecks([], [{ name: 'r', ok: true, evictedKeys: 0, rejectedConnections: 0, persistence: 'НЯМА', totalKeys: 0 }]).length, 0);
  const badSave = evictionChecks([], [{ name: 'r', ok: true, evictedKeys: 0, rejectedConnections: 0, persistence: 'RDB', totalKeys: 5, rdbLastBgsaveStatus: 'err' }]);
  assert.equal(badSave.find((x) => x.key === 'redis-bgsave:r').severity, 'critical');
});

test('отказаните връзки също се мерят по разлика', () => {
  const prev = [{ name: 'r', ok: true, evictedKeys: 0, rejectedConnections: 5 }];
  const now = [{ name: 'r', ok: true, evictedKeys: 0, rejectedConnections: 9, persistence: 'AOF', totalKeys: 1 }];
  const f = evictionChecks(prev, now).find((x) => x.key === 'redis-rejected:r');
  assert.equal(f.severity, 'critical');
  assert.match(f.body, /4 отказани/);
});

test('имената на контейнери минават през allowlist', () => {
  assert.equal(assertName('supremebot_redis'), 'supremebot_redis');
  assert.throws(() => assertName('зле; rm -rf /'), /Невалидно име/);
  assert.throws(() => assertName(''), /Невалидно име/);
  const spec = saveSpec('supremebot_redis');
  assert.equal(spec.cmd, 'docker');
  assert.deepEqual(spec.args, ['exec', 'supremebot_redis', 'redis-cli', 'BGSAVE']);
});

// ── Томове ────────────────────────────────────────────────────────────────────
test('размерите от docker се превръщат в байтове', () => {
  assert.equal(parseSize('124MB'), 124e6);
  assert.equal(parseSize('1.5GB'), 1.5e9);
  assert.equal(parseSize('512B'), 512);
  assert.equal(parseSize('2GiB'), 2 * 1024 ** 3);
  assert.equal(parseSize('няма'), null);
  assert.equal(parseSize(''), null);
});

test('имената на томове минават през allowlist', () => {
  assert.equal(assertVolume('supremebot_redis_data'), 'supremebot_redis_data');
  assert.throws(() => assertVolume('зле; rm -rf /'), /Невалидно име/);
  assert.throws(() => assertVolume('a b'), /Невалидно име/);
});

test('архивът на том минава през контейнер, не по вътрешния път на docker', () => {
  const spec = volumeBackupSpec({ type: 'volume', name: 'uploads' });
  const script = spec.args[1];
  assert.match(script, /docker run --rm -v uploads:\/src:ro/, 'пътят на тома е вътрешна подробност на docker');
  assert.match(script, /tar czf \/out\/vol-uploads-/);
  assert.equal(spec.exclusive, 'backup', 'не бива да върви успоредно с друг бекъп');
});

test('bind папка се архивира с ЦИТИРАН път и отказва опасния', () => {
  const spec = volumeBackupSpec({ type: 'bind', source: '/opt/app/src/public/uploads' });
  assert.match(spec.args[1], /tar czf .*dir-opt_app_src_public_uploads-[0-9a-f]{6}-/);
  assert.match(spec.args[1], /-C "\/opt\/app\/src\/public\/uploads"/, 'пътят е цитиран');
  assert.throws(() => volumeBackupSpec({ type: 'bind', source: '/tmp/x; rm -rf /' }), /Невалиден път/);
  assert.throws(() => volumeBackupSpec({ type: 'bind', source: 'относителен/път' }), /Невалиден път/);
  assert.throws(() => volumeBackupSpec({ type: 'bind', source: '/tmp/$(whoami)' }), /Невалиден път/);
});

test('различни пътища НЕ дават еднакво име на архив', () => {
  // Нормализирането е загубено: и двата пътя стават „opt_app_uploads". Без къс
  // хеш от пълния път вторият архив тихо презаписва първия в един и същи запуск.
  const a = archiveName('/opt/app/uploads');
  const b = archiveName('/opt/app_uploads');
  assert.notEqual(a, b, 'сблъсъкът би изтрил единия архив');
  assert.equal(archiveName('/opt/app/uploads'), a, 'името е стабилно между пусканията');
  assert.match(a, /^opt_app_uploads-[0-9a-f]{6}$/);
});

test('груповият архив ПРОПУСКА базите и го казва', () => {
  const items = [
    { type: 'volume', name: 'uploads', skip: null },
    { type: 'volume', name: 'redis_data', skip: null },
    { type: 'volume', name: 'pgdata', skip: 'база (има логически дъмп — суров tar би бил непоследователен)' },
    { type: 'bind', source: '/opt/app/uploads', skip: null },
  ];
  const spec = backupAllVolumesSpec(items);
  const script = spec.args[1];
  assert.match(script, /vol-uploads-/);
  assert.match(script, /vol-redis_data-/);
  assert.doesNotMatch(script, /tar czf \/out\/vol-pgdata/, 'суров tar на жива база е непоследователен');
  assert.match(script, /Пропуснати.*pgdata/, 'пропускането е ВИДИМО, не мълчаливо');
  assert.match(spec.title, /3 тома/);
  // Само бази → няма какво да се направи, и това се казва.
  assert.throws(() => backupAllVolumesSpec([{ type: 'volume', name: 'pgdata', skip: 'база' }]), /Няма томове/);
  assert.throws(() => backupAllVolumesSpec([]), /Няма томове/);
});

// ── Продуктови проверки ───────────────────────────────────────────────────────
test('всички деплойвани продукти имат health проверка', () => {
  const cfg = loadConfig({ configPath: '/несъществуващ', allowDev: true });
  const names = cfg.healthChecks.map((c) => c.name);
  // Точно списъкът от deploy/autodeploy.sh, без самия панел.
  for (const p of ['zabobovdol', 'medqr', 'vizitka', 'ospedali', 'nexus', 'mastilko', 'supreme', 'eternaltouch', 'adblock']) {
    assert.ok(names.includes(p), `${p} се деплойва, но не се следи`);
  }
  // Статичният сайт зад Caddy се разпознава по домейн, не по порт: без Host
  // заявката попада в сайта по подразбиране и „проверката" мери чужд сайт.
  const adblock = cfg.healthChecks.find((c) => c.name === 'adblock');
  assert.ok(adblock.host, 'статичният сайт иска Host заглавка');
  assert.match(adblock.host, /adblock\./);
});


// ── Десктоп (незадължителен) ──────────────────────────────────────────────────
test('десктоп: портът се валидира, а не се вярва на конфига', () => {
  assert.equal(desktopPort({}), 3010, 'подразбиране');
  assert.equal(desktopPort({ desktop: { port: 4000 } }), 4000);
  for (const bad of [0, -1, 70000, 'осем', null, 1.5]) {
    assert.equal(desktopPort({ desktop: { port: bad } }), 3010, `${bad} трябваше да падне към подразбирането`);
  }
});

test('десктоп: действията са затворен списък и искат парола преди пускане', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-desk-'));
  const file = path.join(dir, 'docker-compose.yml');
  fs.writeFileSync(file, 'services: {}\n');
  const cfg = { desktop: { composeFile: file }, paths: {} };

  for (const bad of ['rm', 'exec', 'up; rm -rf x', '', null]) {
    assert.throws(() => actionSpec(cfg, bad), undefined, `„${bad}" трябваше да бъде отхвърлено`);
  }
  // Пускане БЕЗ desktop.env: паролата на десктопа никога не е празна по
  // подразбиране — иначе графична сесия тръгва без нито един втори слой.
  assert.throws(() => actionSpec(cfg, 'up'), /desktop\.env/);
  // Спирането обаче трябва да работи ВИНАГИ: да не можеш да спреш нещо, защото
  // липсва конфиг файл, е най-лошият възможен момент да си блокиран.
  assert.ok(actionSpec(cfg, 'down').shell.includes('down'));

  fs.writeFileSync(path.join(dir, 'desktop.env'), 'DESKTOP_PASSWORD=x\n');
  const up = actionSpec(cfg, 'up');
  assert.match(up.shell, /docker compose/);
  assert.match(up.shell, /--env-file desktop\.env/);
  assert.equal(up.exclusive, 'desktop', 'две едновременни пускания нямат смисъл');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('десктоп: портът от конфига стига И до compose, не само до проксито', () => {
  // Вързана НАПОЛОВИНА настройка е по-лоша от липсваща: панелът проксира към
  // новия порт, контейнерът публикува на стария и рамката остава празна БЕЗ
  // никаква грешка. Открито на живо, когато 3010 се оказа зает от друг процес
  // и compose падна с „port is already allocated" — а панелът нямаше как да
  // предложи изход, защото портът беше закован във файла.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-desk-port-'));
  const file = path.join(dir, 'docker-compose.yml');
  fs.writeFileSync(file, 'services: {}\n');
  fs.writeFileSync(path.join(dir, 'desktop.env'), 'DESKTOP_PASSWORD=x\n');

  for (const port of [3010, 3999]) {
    const spec = actionSpec({ desktop: { composeFile: file, port }, paths: {} }, 'up');
    assert.equal(spec.env?.DESKTOP_PORT, String(port), `портът ${port} трябва да стигне до compose`);
  }
  // И шипваният compose файл трябва наистина да ЧЕТЕ променливата — иначе
  // подаването ѝ е театър.
  const shipped = fs.readFileSync(
    path.join(import.meta.dirname, '..', 'deploy', 'desktop', 'docker-compose.yml'),
    'utf8'
  );
  assert.match(shipped, /127\.0\.0\.1:\$\{DESKTOP_PORT:-3010\}:3000/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('десктоп: липсващият Docker е „спрян", не „грешка"', async () => {
  // Compose файлът се намира спрямо самия модул → работи при всяко APP_DIR и в
  // dev режим (по-рано беше зашит към /opt/vps-dashboard и мълчеше навсякъде
  // другаде).
  const s = await status({ paths: { currentLink: '/няма/такъв/път' }, desktop: {} });
  assert.equal(s.available, true, 'файлът, който ШИПВАМЕ, трябва да се намира');
  assert.match(s.composeFile, /deploy\/desktop\/docker-compose\.yml$/);
  // Тук няма Docker. Това НЕ е грешка — десктопът просто не върви. Разликата е
  // същата като при алармите: „няма проблем" ≠ „не знам".
  assert.equal(s.running, false);
  assert.equal(s.state, null);
  // Без desktop.env панелът показва как да я създадеш, вместо да пусне сесия
  // без втори слой.
  assert.equal(s.envConfigured, false);
});

test('десктоп: compose файлът не сочи извън продукта', async () => {
  const s = await status({ paths: {}, desktop: {} });
  assert.ok(s.composeFile.endsWith('/deploy/desktop/docker-compose.yml'));
  assert.ok(!s.composeFile.includes('..'), 'пътят е нормализиран');
});

test('десктоп: паролата стига до контейнера, сесията на панела — не', () => {
  // Хванато на живо: проксито триеше `authorization` безусловно, значи
  // контейнерът НИКОГА не получаваше вход. Браузърът пита, човекът въвежда,
  // проксито изхвърля, контейнерът пак пита — безкраен цикъл, при който
  // изглежда, че „паролата е грешна". Нито едно име не можеше да проработи.
  assert.equal(forwardAuth('Basic Y3NkOnRham5h'), 'Basic Y3NkOnRham5h', 'вторият слой трябва да минава');
  assert.equal(forwardAuth('basic abc'), 'basic abc', 'схемата е нечувствителна към регистър');
  // Жетонът на ПАНЕЛА няма работа в чужд контейнер.
  for (const bad of ['Bearer таен-жетон', 'Digest x', '', null, undefined, 'Basicabc']) {
    assert.equal(forwardAuth(bad), undefined, `„${bad}" не бива да се препраща`);
  }

  // Бисквитките: контейнерът си пази СВОЯТА сесия, нашата не напуска панела.
  assert.equal(forwardCookies('kasm_session=abc'), 'kasm_session=abc');
  assert.equal(forwardCookies(`${PANEL_COOKIE}=таен`), undefined, 'сесията на панела не излиза');
  const mixed = forwardCookies(`${PANEL_COOKIE}=таен; kasm=1; other=2`);
  assert.ok(!mixed.includes('таен'), 'нищо от сесията на панела');
  assert.match(mixed, /kasm=1/);
  assert.match(mixed, /other=2/);
  assert.equal(forwardCookies(''), undefined);
  assert.equal(forwardCookies(undefined), undefined);
});

test('десктоп: образът и таванът минават през ЗАТВОРЕНА проверка', () => {
  // Стойността от конфига стига до команден ред на docker. Без проверка полето е
  // „изпълни каквото ти кажа" през приятен интерфейс — същата заплаха като
  // редактора на `.env` с произволен път.
  assert.equal(desktopImage({}), 'lscr.io/linuxserver/webtop:ubuntu-mate', 'подразбиране: Ubuntu-подобен, не гол XFCE');
  assert.equal(desktopImage({ desktop: { image: 'lscr.io/linuxserver/webtop:ubuntu-kde' } }), 'lscr.io/linuxserver/webtop:ubuntu-kde');
  assert.equal(desktopImage({ desktop: { image: 'localhost:5000/my/webtop:v2' } }), 'localhost:5000/my/webtop:v2');
  const INJECTION = ['ubuntu; poweroff', 'a b', '$(whoami)', '`id`', 'x && y', '--privileged', '', null, 42];
  for (const bad of INJECTION) {
    assert.equal(
      desktopImage({ desktop: { image: bad } }),
      'lscr.io/linuxserver/webtop:ubuntu-mate',
      `„${bad}" трябваше да падне към подразбирането`
    );
  }

  assert.equal(desktopMem({}), '1500m');
  assert.equal(desktopMem({ desktop: { memLimit: '2g' } }), '2g');
  for (const bad of ['2 g', '2gb', 'много', '$(x)', '-1g', '', null]) {
    assert.equal(desktopMem({ desktop: { memLimit: bad } }), '1500m', `„${bad}" трябваше да падне към подразбирането`);
  }

  // И трите стойности трябва наистина да стигнат до compose, не само да се смятат.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-desk-img-'));
  const file = path.join(dir, 'docker-compose.yml');
  fs.writeFileSync(file, 'services: {}\n');
  fs.writeFileSync(path.join(dir, 'desktop.env'), 'DESKTOP_PASSWORD=x\n');
  const spec = actionSpec(
    { desktop: { composeFile: file, port: 3011, image: 'lscr.io/linuxserver/webtop:ubuntu-kde', memLimit: '2g' }, paths: {} },
    'up'
  );
  assert.deepEqual(spec.env, {
    DESKTOP_PORT: '3011',
    DESKTOP_IMAGE: 'lscr.io/linuxserver/webtop:ubuntu-kde',
    DESKTOP_MEM: '2g',
  });
  // И шипваният compose трябва да ги ЧЕТЕ — иначе подаването е театър.
  const shipped = fs.readFileSync(path.join(import.meta.dirname, '..', 'deploy', 'desktop', 'docker-compose.yml'), 'utf8');
  assert.match(shipped, /image:\s*\$\{DESKTOP_IMAGE:-/);
  assert.match(shipped, /mem_limit:\s*\$\{DESKTOP_MEM:-/, 'без таван OOM убиецът избира базата, не десктопа');
  fs.rmSync(dir, { recursive: true, force: true });
});
