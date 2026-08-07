// Кои живи сайтове панелът не следи.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseServerNames, parseCaddyNames, canonical, coveredDomains, healthCheckFor, siteCoverage, readSource } from '../src/coverage.js';

// ── Разборът на nginx ────────────────────────────────────────────────────────
test('покритие: server_name дава всички имена на реда', () => {
  const names = parseServerNames('server_name example.com www.example.com;');
  assert.deepEqual(names, ['example.com', 'www.example.com']);
});

test('покритие: закоментираните vhost-ове НЕ са живи сайтове', () => {
  const names = parseServerNames(
    ['# server_name старото.com;', 'server_name живото.com;  # беше друго', 'server_name друго.bg;'].join('\n')
  );
  assert.deepEqual(names, ['живото.com', 'друго.bg'].filter((d) => /^[a-z0-9.*-]+\.[a-z]{2,}$/.test(d)));
});

test('покритие: „_", localhost и голи IP-та не са домейни', () => {
  assert.deepEqual(parseServerNames('server_name _;'), []);
  assert.deepEqual(parseServerNames('server_name localhost;'), []);
  assert.deepEqual(parseServerNames('server_name 192.168.1.10;'), []);
  assert.deepEqual(parseServerNames('server_name [::1];'), []);
});

test('покритие: няколко server блока в един файл', () => {
  const conf = [
    'server {', '  listen 80;', '  server_name a.example.com;', '}',
    'server {', '  listen 443 ssl;', '  server_name b.example.com www.b.example.com;', '}',
  ].join('\n');
  assert.deepEqual(parseServerNames(conf), ['a.example.com', 'b.example.com', 'www.b.example.com']);
});

test('покритие: празен/боклук конфиг не измисля домейни', () => {
  assert.deepEqual(parseServerNames(''), []);
  assert.deepEqual(parseServerNames('proxy_pass http://127.0.0.1:3000;'), []);
  assert.deepEqual(parseServerNames(null), []);
});

// ── Caddy ────────────────────────────────────────────────────────────────────
test('покритие: Caddy блокът носи домейна в началния ред', () => {
  const conf = ['example.it {', '  root * /srv', '}', 'a.bg, b.bg {', '  reverse_proxy :3000', '}'].join('\n');
  assert.deepEqual(parseCaddyNames(conf), ['example.it', 'a.bg', 'b.bg']);
});

// ── Нормализация ─────────────────────────────────────────────────────────────
test('покритие: www.X и X са ЕДИН сайт, не два', () => {
  assert.equal(canonical('www.example.com'), 'example.com');
  assert.equal(canonical('WWW.Example.COM'), 'example.com');
  assert.equal(canonical('*.example.com'), 'example.com');
});

// ── Кое се брои за покрито ───────────────────────────────────────────────────
test('покритие: health проверка по URL покрива домейна си', () => {
  const c = coveredDomains({ healthChecks: [{ name: 'medqr', url: 'https://medqr.example.eu/' }] });
  assert.ok(c.has('medqr.example.eu'));
});

test('покритие: проверка към 127.0.0.1 НЕ покрива домейн', () => {
  // Тя мери дали процесът е жив, не дали светът стига до него: изтекъл
  // сертификат, счупен server_name или ufw правило не се виждат оттам.
  const c = coveredDomains({ healthChecks: [{ name: 'medqr', url: 'http://127.0.0.1:3000/' }] });
  assert.equal(c.has('medqr'), false);
  assert.equal(c.size, 0, 'loopback не бива да обявява домейн за покрит');
});

test('покритие: следеният за изтичане домейн също се брои', () => {
  const c = coveredDomains({ watchDomains: ['example.bg', { domain: 'второ.eu' }] });
  assert.ok(c.has('example.bg'));
  assert.ok(c.has('второ.eu'));
});

test('покритие: невалиден URL в конфига не чупи проверката', () => {
  assert.doesNotThrow(() => coveredDomains({ healthChecks: [{ name: 'x', url: 'няма-протокол' }] }));
});

test('покритие: празен конфиг → нищо не е покрито (не „всичко")', () => {
  assert.equal(coveredDomains({}).size, 0);
  assert.equal(coveredDomains(null).size, 0);
});

// ── Предложената проверка ────────────────────────────────────────────────────
test('покритие: предложението е HTTPS към каноничния домейн', () => {
  assert.deepEqual(healthCheckFor('www.example.com'), {
    name: 'example.com',
    url: 'https://example.com/',
    expectStatus: 200,
  });
});

test('покритие: подхвърлен „домейн" не става URL', () => {
  for (const bad of ['x.com/../../etc', 'javascript:alert(1)', 'a b.com', '', 'localhost']) {
    assert.throws(() => healthCheckFor(bad), /Невалиден домейн/, `трябва да откаже: ${bad}`);
  }
});

// ── „Нула сайта" има три причини — само едната е „наред" ──────────────────────
test('покритие: без нито един четим източник казва „не знам", не „нула сайта"', () => {
  // Пътищата се ПОДАВАТ, не се четат от машината. Първата версия разчиташе, че
  // на тестовата машина няма nginx — вярно локално, НЕВЯРНО на `ubuntu-latest`
  // в GitHub Actions, който носи инсталиран nginx. Тестът минаваше тук и падаше
  // там, без нищо в кода да се е променило: той твърдеше нещо за МАШИНАТА, а не
  // за кода. (07.08.2026)
  const NOWHERE = { nginx: '/nonexistent-nginx-хх', caddy: '/nonexistent-caddy-хх' };
  const cov = siteCoverage({ healthChecks: [] }, NOWHERE);
  assert.equal(cov.unknown, true, 'липсващ източник е НЕЗНАНИЕ, не потвърдена нула');
  assert.equal(cov.sources.nginx, 'missing');
  assert.equal(cov.sources.caddy, 'missing');
  assert.deepEqual(cov.denied, [], 'липсващо ≠ отказано — второто е проблем за оправяне');
});

test('покритие: четим източник вече НЕ е „не знам" (обратната посока)', (t) => {
  // Без този тест поправката горе би минала и ако `unknown` беше закован на true.
  const dir = mkdtempSync(join(tmpdir(), 'cov-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // Многоредово нарочно: разборът чете `server_name` РЕДОВЕ (виж parseServerNames).
  // Едноредовият вариант дава нула сайта — първата версия на този тест го ползваше
  // и щеше да „мине" срещу счупен разбор.
  writeFileSync(join(dir, 'site.conf'), 'server {\n    server_name a.example.com;\n}\n');
  const cov = siteCoverage({ healthChecks: [] }, { nginx: dir, caddy: '/nonexistent-caddy-хх' });
  assert.equal(cov.sources.nginx, 'read');
  assert.equal(cov.unknown, false, 'един четим източник стига, за да знаем');
  assert.equal(cov.total, 1, 'и сайтът наистина се вижда');
});

test('покритие: отказаният достъп се различава от липсващата папка', () => {
  // Разликата е практическа: „няма такъв уеб сървър" е нормално, „не ме пускат
  // да чета" значи, че панелът върви с по-малко права, отколкото трябва.
  assert.equal(readSource('/etc/nginx/sites-enabled-няма-такова'), 'missing');
  assert.equal(readSource('/proc/1/mem'), 'missing', 'файл вместо папка = ENOTDIR, пак „няма"');
});
