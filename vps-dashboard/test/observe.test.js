// Access log, проба за възстановяване, flapping, RDAP, заглавки за сигурност.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseLine, parseTs, normalizePath, isBot, AccessLogReader } from '../src/accesslog.js';
import { DrillStore, backupChecks } from '../src/drill.js';
import { detectFlapping, registrableDomain, pickEvent, evaluateHeaders } from '../src/health.js';

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
