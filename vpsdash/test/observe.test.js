// Access log, проба за възстановяване, flapping, RDAP, заглавки за сигурност.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseLine, parseTs, normalizePath, isBot, AccessLogReader } from '../src/accesslog.js';
import { DrillStore, backupChecks } from '../src/drill.js';
import { detectFlapping, registrableDomain, pickEvent, evaluateHeaders } from '../src/health.js';
import { blameOf } from '../src/accesslog.js';
import { AlertEngine, worst } from '../src/alerts.js';
import { passesSeverity } from '../src/notify.js';
import { assertRestoreUnit } from '../src/backups.js';

// ── Access log ────────────────────────────────────────────────────────────────
const LINE =
  '203.0.113.7 - - [15/Mar/2026:12:30:45 +0200] "GET /order/8123?x=1 HTTP/1.1" 200 5120 "https://example.com/" "Mozilla/5.0" rt=1.234 ut=1.100';

test('парсване на комбинирания формат + времето за заявка', () => {
  const r = parseLine(LINE);
  assert.equal(r.ip, '203.0.113.7');
  assert.equal(r.method, 'GET');
  assert.equal(r.path, '/order/8123', 'query string се маха — иначе всеки адрес е уникален');
  assert.equal(r.query, true);
  assert.equal(r.status, 200);
  assert.equal(r.bytes, 5120);
  assert.equal(r.requestTime, 1.234);
  assert.equal(r.upstreamTime, 1.1);
  assert.equal(r.user, null, '„-" не е потребител');
  // Ред без време също минава — nginx по подразбиране не го пише.
  const bare = parseLine('1.2.3.4 - - [15/Mar/2026:12:30:45 +0200] "GET / HTTP/1.1" 200 100 "-" "curl/8"');
  assert.equal(bare.requestTime, null);
  assert.equal(bare.referer, null);
  assert.equal(parseLine('пълен боклук'), null);
  assert.equal(parseLine(''), null);
});

test('времевият печат зачита часовата зона', () => {
  // 12:30:45 +0200 = 10:30:45 UTC
  assert.equal(parseTs('15/Mar/2026:12:30:45 +0200'), Date.UTC(2026, 2, 15, 10, 30, 45));
  assert.equal(parseTs('15/Mar/2026:12:30:45 -0500'), Date.UTC(2026, 2, 15, 17, 30, 45));
  assert.equal(parseTs('невалидно'), null);
  assert.equal(parseTs('15/Мар/2026:12:30:45 +0200'), null, 'непознат месец не дава NaN дата');
});

test('нормализирането групира по ФОРМА, не по идентификатор', () => {
  assert.equal(normalizePath('/order/8123'), '/order/«id»');
  assert.equal(normalizePath('/order/8123'), normalizePath('/order/9044'));
  assert.equal(normalizePath('/u/550e8400-e29b-41d4-a716-446655440000/edit'), '/u/«uuid»/edit');
  assert.equal(normalizePath('/api/v2/users'), '/api/v2/users', 'версията не е идентификатор');
  assert.equal(normalizePath('/'), '/');
  assert.equal(normalizePath(''), '/');
  assert.match(normalizePath('/assets/app.a83bf12.js'), /«файл»\.js$/);
});

test('ботовете се разпознават, за да не изкривяват статистиката', () => {
  assert.ok(isBot('Mozilla/5.0 (compatible; Googlebot/2.1)'));
  assert.ok(isBot('curl/8.5.0'));
  assert.ok(isBot('ClaudeBot/1.0'));
  assert.ok(isBot('python-requests/2.31'));
  assert.equal(isBot('Mozilla/5.0 (Macintosh) Safari/605'), false);
  assert.equal(isBot(''), false);
});

test('четенето е инкрементално и преживява ротация', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-al-'));
  const log = path.join(dir, 'access.log');
  const reader = new AccessLogReader(dir);
  fs.writeFileSync(log, LINE + '\n' + LINE + '\n');

  const first = reader.readNew(log);
  assert.equal(first.lines.length, 2);
  assert.equal(first.rotated, false);
  // Второ четене без нови редове → нищо, не същите два пак.
  assert.equal(reader.readNew(log).lines.length, 0, 'без нови редове не се чете отново');

  fs.appendFileSync(log, LINE + '\n');
  assert.equal(reader.readNew(log).lines.length, 1, 'само новото');

  // copytruncate: същият inode, но по-малък файл → четем отначало.
  fs.writeFileSync(log, LINE + '\n');
  const truncated = reader.readNew(log);
  assert.equal(truncated.rotated, true, 'смаленият файл се разпознава като пресечен');
  assert.ok(truncated.lines.length >= 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('състоянието на access log-а НЕ пази лични данни', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-al2-'));
  const log = path.join(dir, 'access.log');
  fs.writeFileSync(log, LINE + '\n');
  const reader = new AccessLogReader(dir);
  reader.readNew(log);
  reader.save();
  const raw = fs.readFileSync(path.join(dir, 'accesslog.json'), 'utf8');
  assert.doesNotMatch(raw, /203\.0\.113\.7/, 'IP адресът не бива да лежи на диска');
  assert.doesNotMatch(raw, /order/, 'нито заявените адреси');
  assert.match(raw, /cursors/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('анализът подрежда бавното по p95, не по средно', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-al3-'));
  const log = path.join(dir, 'access.log');
  const mk = (p, rt, status = 200) =>
    `1.2.3.4 - - [15/Mar/2026:12:30:45 +0200] "GET ${p} HTTP/1.1" ${status} 100 "-" "Mozilla/5.0" rt=${rt}`;
  const lines = [];
  // Точната разлика между средно и опашка:
  //   /опашка — 90 бързи + 10 много бавни → средно 0.545, p95 = 5.0
  //   /равномерен — всички по 0.6 → средно 0.6 (ПО-ВИСОКО), p95 = 0.6 (по-ниско)
  // Подредба по средно би сложила „равномерен" пръв, а потребителят усеща опашката.
  for (let i = 0; i < 90; i++) lines.push(mk('/опашка', 0.05));
  for (let i = 0; i < 10; i++) lines.push(mk('/опашка', 5.0));
  for (let i = 0; i < 100; i++) lines.push(mk('/равномерен', 0.6));
  for (let i = 0; i < 10; i++) lines.push(mk('/чупи', 0.1, 500));
  fs.writeFileSync(log, lines.join('\n') + '\n');

  const r = new AccessLogReader(dir).analyze({ files: [log] });
  assert.equal(r.available, true);
  assert.equal(r.total, 210);
  assert.equal(r.hasTiming, true);
  assert.equal(r.byStatus['5xx'], 10);
  assert.equal(r.topBySlow[0].path, '/опашка', 'опашката е това, което потребителят усеща');
  assert.equal(r.topBySlow[0].p95, 5);
  assert.equal(r.topBySlow[0].p50, 0.05, 'медианата е спокойна — точно затова средното лъже');
  assert.equal(r.topBySlow[1].path, '/равномерен');
  assert.equal(r.topByErrors[0].path, '/чупи');
  assert.equal(r.topByErrors[0].errorPct, 100);
  assert.equal(r.serverErrors.length, 10);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('без $request_time анализът казва как се включва', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-al4-'));
  const log = path.join(dir, 'access.log');
  fs.writeFileSync(log, '1.2.3.4 - - [15/Mar/2026:12:30:45 +0200] "GET / HTTP/1.1" 200 1 "-" "x"\n');
  const r = new AccessLogReader(dir).analyze({ files: [log] });
  assert.equal(r.hasTiming, false);
  assert.match(r.timingHint, /log_format/, 'иначе половината полза липсва мълчаливо');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Бекъпи ────────────────────────────────────────────────────────────────────
test('липсващият бекъп е критична находка, не мълчание', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-dr-'));
  const store = new DrillStore(dir);
  const cfg = { backups: { maxAgeDays: 2 } };
  // В тази среда няма папка с дъмпове → „няма нито един бекъп".
  const found = backupChecks(cfg, store);
  const missing = found.find((f) => f.key === 'backup:missing');
  assert.ok(missing, 'липсата на бекъп трябва да гърми');
  assert.equal(missing.severity, 'critical');
  assert.equal(missing.sustain, false, 'няма смисъл да се „задържа" — фактът е стабилен');
  // Изключването е съзнателен избор.
  assert.deepEqual(backupChecks({ backups: { alertEnabled: false } }, store), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('провалена проба гърми; успешната се помни', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-dr2-'));
  const store = new DrillStore(dir);
  store.record({ ok: false, name: 'medqr-20260315.sqlite.gz', output: 'integrity_check: malformed', code: 1 });
  const bad = backupChecks({}, store).find((f) => f.key === 'backup:drill');
  assert.ok(bad);
  assert.match(bad.body, /malformed/, 'диагнозата стига до известието');

  store.record({ ok: true, name: 'medqr-20260315.sqlite.gz', output: 'ok', code: 0 });
  assert.equal(backupChecks({}, store).find((f) => f.key === 'backup:drill'), undefined);
  assert.ok(store.state.lastOkAt);
  // Състоянието преживява рестарт.
  const again = new DrillStore(dir);
  assert.equal(again.state.lastOkAt, store.state.lastOkAt);
  assert.equal(again.state.history.length, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('пробата се пуска по каданс, не при всяко вдигане', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-dr3-'));
  const store = new DrillStore(dir);
  assert.equal(store.due(30), true, 'никога непускана → веднага');
  store.record({ ok: true, name: 'x', output: '', code: 0 });
  assert.equal(store.due(30), false, 'току-що пусната → чака');
  assert.equal(store.due(0), true, 'нулев каданс → винаги');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('дълго непусканата проба вдига предупреждение, не тревога', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-dr4-'));
  const store = new DrillStore(dir);
  const long = Date.now() - 200 * 86400000;
  store.state.lastOkAt = new Date(long).toISOString();
  store.state.lastResult = { ok: true, ts: store.state.lastOkAt };
  const f = backupChecks({ backups: { drillIntervalDays: 30 } }, store).find((x) => x.key === 'backup:drill-old');
  assert.ok(f);
  assert.equal(f.severity, 'warning', 'стара проба не е авария — не буди човек нощем');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Рестарт-цикъл ─────────────────────────────────────────────────────────────
test('flapping се мери по РАЗЛИКАТА, не по общия брой', () => {
  const prev = [{ unit: 'a.service', restarts: 40 }, { unit: 'b.service', restarts: 0 }];
  const now = [{ unit: 'a.service', restarts: 45 }, { unit: 'b.service', restarts: 1 }, { unit: 'нов.service', restarts: 99 }];
  const f = detectFlapping(prev, now, { threshold: 3 });
  assert.equal(f.length, 1, 'само a.service е скочила с 5');
  assert.equal(f[0].unit, 'a.service');
  assert.equal(f[0].delta, 5);
  assert.equal(f[0].total, 45);
  // Услуга с 99 общо, но без предишна снимка, НЕ гърми — 99-те може да са от година.
  assert.equal(f.find((x) => x.unit === 'нов.service'), undefined);
  // Първа снимка изобщо → нищо.
  assert.deepEqual(detectFlapping(null, now, { threshold: 1 }), []);
  assert.deepEqual(detectFlapping([], now), []);
});

// ── Домейн ────────────────────────────────────────────────────────────────────
test('регистрируемият домейн се вади вярно, вкл. двусъставни зони', () => {
  assert.equal(registrableDomain('vps1.carbonstealth.eu'), 'carbonstealth.eu');
  assert.equal(registrableDomain('carbonstealth.eu'), 'carbonstealth.eu');
  assert.equal(registrableDomain('*.example.com'), 'example.com');
  assert.equal(registrableDomain('www.shop.co.uk'), 'shop.co.uk', 'иначе би питало за „uk"');
  assert.equal(registrableDomain('a.b.com.br'), 'b.com.br');
  assert.equal(registrableDomain('EXAMPLE.COM'), 'example.com');
});

test('RDAP събитието за изтичане се намира по действие', () => {
  const events = [
    { eventAction: 'registration', eventDate: '2010-01-01T00:00:00Z' },
    { eventAction: 'expiration', eventDate: '2027-01-01T00:00:00Z' },
  ];
  assert.equal(pickEvent(events, 'expiration'), '2027-01-01T00:00:00Z');
  assert.equal(pickEvent(events, 'registration'), '2010-01-01T00:00:00Z');
  assert.equal(pickEvent(events, 'няма'), null);
  assert.equal(pickEvent(null, 'expiration'), null);
});

// ── Заглавки за сигурност ─────────────────────────────────────────────────────
test('заглавките се оценяват по това, което браузърът РЕАЛНО получава', () => {
  const bare = evaluateHeaders({}, { https: true });
  const ids = bare.findings.map((f) => f.id);
  assert.ok(ids.includes('hsts') && ids.includes('nosniff') && ids.includes('frame') && ids.includes('referrer'));
  assert.ok(bare.score < 60);

  const good = evaluateHeaders({
    'Strict-Transport-Security': 'max-age=31536000',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "frame-ancestors 'self'",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    Server: 'nginx',
  }, { https: true });
  assert.deepEqual(good.findings, []);
  assert.equal(good.score, 100);
});

test('CSP без frame-ancestors не минава за защита от iframe', () => {
  const csp = evaluateHeaders({ 'content-security-policy': "default-src 'self'" }, { https: false });
  assert.ok(csp.findings.some((f) => f.id === 'frame'), 'CSP сам по себе си не спира вграждането');
  // X-Frame-Options също върши работа.
  const xfo = evaluateHeaders({ 'x-frame-options': 'DENY' }, { https: false });
  assert.equal(xfo.findings.some((f) => f.id === 'frame'), false);
  // HSTS не се иска по http — там е безсмислен.
  assert.equal(xfo.findings.some((f) => f.id === 'hsts'), false);
});

test('версията на сървъра е находка, липсата ѝ — не', () => {
  assert.ok(evaluateHeaders({ server: 'nginx/1.24.0' }, { https: false }).findings.some((f) => f.id === 'server-token'));
  assert.equal(evaluateHeaders({ server: 'nginx' }, { https: false }).findings.some((f) => f.id === 'server-token'), false);
});

// ── Фаза Ж: кой пази пазача ───────────────────────────────────────────────────
test('прагът по канал не бива да изяжда „Възстановено"', () => {
  // Канал „само критично": алармата минава.
  assert.equal(passesSeverity({ severity: 'critical' }, 'critical'), true);
  assert.equal(passesSeverity({ severity: 'warning' }, 'critical'), false);
  // ВДИГАНЕТО на същата аларма носи тежест „ok" (ранг 1). Наивен филтър го
  // отсява → каналът получава „сървърът падна", но никога „сървърът се върна".
  // Това е най-лошата комбинация: човек тича към машина, която вече работи.
  assert.equal(
    passesSeverity({ severity: 'ok', wasSeverity: 'critical' }, 'critical'),
    true,
    'краят на критична аларма трябва да мине по канал с праг „критично"'
  );
  assert.equal(passesSeverity({ severity: 'ok', wasSeverity: 'info' }, 'critical'), false);
  // Празен/непознат праг = без филтър (по-добре повече известия, отколкото тихо
  // отсяване заради печатна грешка в конфига).
  assert.equal(passesSeverity({ severity: 'info' }, ''), true);
  assert.equal(passesSeverity({ severity: 'info' }, 'глупост'), true);
});

test('сливането на праг и прогноза взема ПО-ТЕЖКОТО', () => {
  // Диск на 97% (critical по праг) с прогноза за 5 дни (warning) — слятото
  // условие НЕ бива да смъква тежестта до warning.
  assert.equal(worst('critical', 'warning'), 'critical');
  assert.equal(worst('info', 'warning'), 'warning');
  assert.equal(worst('info', 'info'), 'info');
  assert.equal(worst('warning', 'critical'), 'critical');
});

test('кой бави: приложението или nginx — и мълчание, когато е шум', () => {
  // 900 ms общо, 850 в приложението → кодът.
  assert.equal(blameOf(0.9, 0.85, 0.05), 'приложение');
  // 900 ms общо, 100 в приложението → чакане пред приложението.
  assert.equal(blameOf(0.9, 0.1, 0.8), 'nginx/мрежа');
  assert.equal(blameOf(0.9, 0.55, 0.35), 'смесено');
  // Под 200 ms разликата е измервателен шум — присъда там е измислица.
  assert.equal(blameOf(0.05, 0.03, 0.02), null);
  assert.equal(blameOf(0.9, null, null), null, 'без ut= няма как да се раздели');
});

test('името на услугата при възстановяване минава през allowlist', () => {
  assert.equal(assertRestoreUnit('medqr.service'), 'medqr.service');
  assert.equal(assertRestoreUnit(''), null);
  assert.equal(assertRestoreUnit(null), null);
  // Влиза в shell ред — точно затова не се доверяваме.
  for (const bad of ['medqr.service; reboot', 'a b.service', 'medqr', '$(id).service', '../x.service']) {
    assert.throws(() => assertRestoreUnit(bad), undefined, `„${bad}" трябваше да бъде отхвърлено`);
  }
});

test('заглушаването е срочно — изтеклото не заглушава', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-sil-'));
  const cfg = {
    paths: { stateDir: dir },
    alerts: {
      enabled: true,
      silences: [
        { key: 'disk:/', until: Date.now() + 60000 },
        { key: 'cert:example.com', until: Date.now() - 1000 }, // изтекло
      ],
    },
  };
  const eng = new AlertEngine({ cfg, metrics: { latest: null }, audit: null });
  assert.ok(eng.silencedBy('disk:/'), 'точният ключ се заглушава');
  // ТОЧНО съвпадение: заглушаването на кореновия дял НЕ бива да ослепява и
  // останалите. Мълчаливият префикс правеше едно натискане на бутона в панела
  // равно на „заглуши всички дискове" — а с ключ от една буква и целия регистър.
  assert.equal(eng.silencedBy('disk:/var'), null, 'съседният дял остава жив');
  assert.equal(eng.silencedBy('disk:/var/lib/docker'), null);
  assert.equal(eng.silencedBy('cert:example.com'), null, 'изтеклото заглушаване не важи');
  assert.equal(eng.silencedBy('service:nginx.service'), null);
  assert.equal(eng.silences().length, 1, 'изтеклите отпадат от списъка');
  // Цялото семейство се заглушава ИЗРИЧНО — със звездичка, за да е видимо.
  cfg.alerts.silences = [{ key: 'disk:*', until: Date.now() + 60000 }];
  assert.ok(eng.silencedBy('disk:/var'), 'звездичката заглушава семейството');
  assert.equal(eng.silencedBy('cert:x'), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('здравето на мониторинга различава „още не е проверявал" от „изостава"', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-hp-'));
  const cfg = { paths: { stateDir: dir }, alerts: { enabled: true, checkIntervalSec: 60 } };
  const eng = new AlertEngine({ cfg, metrics: { latest: null }, audit: null });
  assert.equal(eng.health().fresh, null, 'първо пускане не е провал');
  eng.lastEvalAt = Date.now();
  assert.equal(eng.health().fresh, true);
  // Три часа мълчание при каданс 60s: панелът показва „няма аларми", а истината
  // е „никой не гледа". Точно това разграничение е смисълът на картата.
  eng.lastEvalAt = Date.now() - 3 * 3600 * 1000;
  assert.equal(eng.health().fresh, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('диск: праг и прогноза се сливат в ЕДНА аларма с по-тежката тежест', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-disk-'));
  const cfg = {
    paths: { stateDir: dir },
    alerts: { enabled: true, thresholds: { diskPct: 85 } },
    peers: [],
    healthChecks: [],
    slo: { enabled: false },
    redis: { enabled: false },
    domainExpiryDays: 0,
    backups: { alertEnabled: false },
  };
  const snap = { disks: [{ mount: '/', usePercent: 97, availBytes: 1e9 }], kernel: null };
  const eng = new AlertEngine({ cfg, metrics: { latest: snap }, audit: null });
  eng.accessPrimed = true;
  eng.accesslog = null;
  // Прогнозата е „warning" (5 дни), прагът е „critical" (97%).
  eng.diskForecasts = () => [{ mount: '/', key: 'disk-eta:/', severity: 'warning', title: 'Дискът / ще се напълни', body: 'стига 100% след 5 дни.' }];
  const out = await eng.collect();
  const disk = out.filter((c) => c.key.startsWith('disk'));
  assert.equal(disk.length, 1, 'ЕДИН проблем = ЕДНА аларма, не праг + прогноза поотделно');
  assert.equal(disk[0].key, 'disk:/');
  assert.equal(disk[0].severity, 'critical', 'прогнозата обогатява, но НЕ смъква тежестта на прага');
  assert.match(disk[0].body, /97%/, 'състоянието остава в текста');
  assert.match(disk[0].body, /5 дни/, 'срокът също — това е действената част');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Поправки по одита на Наблюдателя ──────────────────────────────────────────
function engine(over = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-eng-'));
  const cfg = {
    paths: { stateDir: dir },
    alerts: { enabled: true, sustainSamples: 1, resolveSamples: 2, cooldownMin: 60, ...(over.alerts || {}) },
    peers: [], healthChecks: [], slo: { enabled: false }, redis: { enabled: false },
    domainExpiryDays: 0, backups: { alertEnabled: false }, ...over.cfg,
  };
  const eng = new AlertEngine({ cfg, metrics: { latest: null }, audit: null });
  eng.accessPrimed = true;
  eng.accesslog = null;
  eng.intervalMs = 60000;
  eng.dir = dir;
  return eng;
}

test('„Липсва телеметрия" наистина ПЛАМВА, а не само потиска резолва', async () => {
  const eng = engine();
  // Цикъл 1: услугата е паднала.
  eng.collect = async () => { eng.stale = new Map(); return [{ key: 'service:foo.service', severity: 'critical', title: 'Паднала услуга', body: 'foo', sustain: false }]; };
  await eng.evaluate();
  assert.deepEqual(eng.listActive().map((a) => a.key), ['service:foo.service']);

  // Цикъл 2: systemctl мълчи. Алармата за услугата трябва да ОСТАНЕ (не знаем),
  // и ОТГОРЕ да пламне „Липсва телеметрия" — иначе човекът гледа аларма, която
  // виси вечно, без нито един ред за причината.
  eng.collect = async () => { eng.stale = new Map([['service:', 'systemctl не отговори']]); return []; };
  const r = await eng.evaluate();
  const keys = eng.listActive().map((a) => a.key).sort();
  assert.deepEqual(keys, ['service:foo.service', 'stale:service:']);
  assert.ok(r.events.some((e) => e.key === 'stale:service:' && e.type === 'firing'), 'трябва да има събитие за мълчащия източник');
  assert.ok(!r.events.some((e) => e.type === 'resolved'), 'мълчащ източник НЕ значи възстановено');
  fs.rmSync(eng.dir, { recursive: true, force: true });
});

test('delta-събитията не пращат фалшиво „Възстановено"', async () => {
  const eng = engine();
  const oom = { key: 'oom', severity: 'critical', title: 'Ядрото уби процес заради памет (OOM)', body: '1 убит', sustain: false, transient: true };
  eng.collect = async () => { eng.stale = new Map(); return [oom]; };
  const r1 = await eng.evaluate();
  assert.ok(r1.events.some((e) => e.key === 'oom' && e.type === 'firing'));
  assert.equal(eng.listActive().length, 0, 'събитието НЕ се превръща в активно състояние');

  // Следващият цикъл: разликата е 0, ключът изчезва. По-рано това пращаше
  // „Възстановено: Ядрото уби процес заради памет" — известие, което лъже.
  eng.collect = async () => { eng.stale = new Map(); return []; };
  const r2 = await eng.evaluate();
  assert.equal(r2.events.length, 0, 'нищо не се е „възстановило" — просто не се е повторило');
  fs.rmSync(eng.dir, { recursive: true, force: true });
});

test('отпадането иска толкова чисти проверки, колкото и пламването', async () => {
  const eng = engine({ alerts: { sustainSamples: 1, resolveSamples: 2 } });
  const cond = { key: 'disk:/', severity: 'warning', title: 'Дискът се пълни', body: '90%' };
  eng.collect = async () => { eng.stale = new Map(); return [cond]; };
  await eng.evaluate();
  assert.equal(eng.listActive().length, 1);

  // Едно трепване под прага НЕ вдига алармата — иначе осцилиращо условие прави
  // безкрайни двойки „пламна/възстанови се", всяка от които е две известия.
  eng.collect = async () => { eng.stale = new Map(); return []; };
  const r1 = await eng.evaluate();
  assert.equal(r1.events.length, 0, 'първата чиста проверка само брои');
  assert.equal(eng.listActive().length, 1);

  const r2 = await eng.evaluate();
  assert.ok(r2.events.some((e) => e.type === 'resolved'), 'втората чиста проверка вдига');
  assert.equal(eng.listActive().length, 0);
  fs.rmSync(eng.dir, { recursive: true, force: true });
});

test('„info" стои в панела, но не буди човек', async () => {
  const eng = engine();
  const sent = [];
  eng.dispatchNotify = null;
  const entryInfo = await eng.dispatch({ type: 'firing', key: 'anomaly:cpu', severity: 'info', title: 'Нетипично', body: 'z=4' });
  assert.deepEqual(entryInfo.sent, [], 'аномалия не тръгва към телефона');
  assert.equal(entryInfo.infoOnly, true);
  assert.ok(eng.log.some((l) => l.key === 'anomaly:cpu'), 'но остава в дневника');
  assert.equal(sent.length, 0);
  fs.rmSync(eng.dir, { recursive: true, force: true });
});

test('повторното известие е съразмерно на времето за действие', async () => {
  const eng = engine({ alerts: { sustainSamples: 1, cooldownMin: 60 } });
  const cert = { key: 'cert:example.com', severity: 'warning', title: 'TLS сертификат изтича', body: '9 дни', sustain: false, repeatEvery: 24 * 3600000 };
  eng.collect = async () => { eng.stale = new Map(); return [cert]; };
  await eng.evaluate();
  // Два часа по-късно: при плоския cooldown от 60 мин това щеше да е второ
  // критично съобщение (и така 336 пъти за един изтичащ сертификат).
  eng.active.get('cert:example.com').lastNotified = Date.now() - 2 * 3600000;
  const r = await eng.evaluate();
  assert.equal(r.events.length, 0, 'аларма с хоризонт дни не се повтаря на час');
  eng.active.get('cert:example.com').lastNotified = Date.now() - 25 * 3600000;
  const r2 = await eng.evaluate();
  assert.ok(r2.events.some((e) => e.repeat), 'след 24 часа — напомня');
  fs.rmSync(eng.dir, { recursive: true, force: true });
});

test('трафикът, паднал до нула, се вижда — пробата отвътре не го вижда', () => {
  const eng = engine();
  const now = Date.now();
  const W = 10 * 60000;
  // 40 минути нормален трафик, после 10 минути пълна тишина.
  eng.accessWindow = [];
  for (let i = 50; i > 10; i--) eng.accessWindow.push({ ts: now - i * 60000, total: 12, server: 0 });
  for (let i = 10; i >= 0; i--) eng.accessWindow.push({ ts: now - i * 60000, total: 0, server: 0 });
  const hit = eng.trafficDrop(W, now);
  assert.equal(hit.length, 1);
  assert.equal(hit[0].key, 'traffic:zero');
  assert.equal(hit[0].severity, 'critical');

  // Тиха нощ на малък сайт: малко трафик преди, нула сега → МЪЛЧИ.
  eng.accessWindow = [];
  for (let i = 50; i > 10; i--) eng.accessWindow.push({ ts: now - i * 60000, total: 0, server: 0 });
  eng.accessWindow.push({ ts: now - 60000, total: 0, server: 0 }, { ts: now, total: 0, server: 0 });
  assert.equal(eng.trafficDrop(W, now).length, 0, 'нула преди и нула сега не е авария');

  // Пресен старт (няма достатъчно история) → МЪЛЧИ, вместо да гърми при рестарт.
  eng.accessWindow = [{ ts: now - 60000, total: 500, server: 0 }, { ts: now, total: 0, server: 0 }];
  assert.equal(eng.trafficDrop(W, now).length, 0, 'без история няма присъда');
  fs.rmSync(eng.dir, { recursive: true, force: true });
});
