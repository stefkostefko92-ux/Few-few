// HTTP интеграционни тестове за админ сервиза — вдига се на 127.0.0.1:0
// (ефемерен порт) с изолиран временен site/ + .state/, без реална мрежа и без
// да пипа реалното рънтайм състояние. Затваря се в after().

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Тайни/режим за теста — задай ги ПРЕДИ creaApp() (initConfig ги чете тогава).
process.env.OSPEDALI_ADMIN_PASSWORD = 'test-password-123';
process.env.OSPEDALI_SESSION_SECRET = 'test-session-secret-0123456789abcdef';
process.env.OSPEDALI_INSECURE_COOKIES = '1'; // без Secure → тестваемо през http

const { creaApp } = await import('../server/server.js');

let server;
let base; // { host, port }
let tmpRoot;

before(async () => {
  // Изолиран временен сайт + състояние (никакво докосване на реалните).
  tmpRoot = await mkdtemp(join(tmpdir(), 'ospedali-http-'));
  const siteDir = join(tmpRoot, 'site');
  const stateDir = join(tmpRoot, 'state');
  await mkdir(siteDir, { recursive: true });
  await mkdir(stateDir, { recursive: true });
  await writeFile(join(siteDir, 'index.html'), '<html><head><title>Home</title></head><body>ok</body></html>');
  await writeFile(join(siteDir, 'nascosta.html'), '<html><head><title>Nascosta</title></head><body>segreto</body></html>');
  await writeFile(join(siteDir, '404.html'), '<html><head><title>404</title></head><body>Pagina non trovata</body></html>');
  // Предварително скрий една СЪЩЕСТВУВАЩА страница (доказва скриване, не липса).
  await writeFile(join(stateDir, 'visibility.json'), JSON.stringify({ hidden: ['nascosta.html'] }));

  const app = await creaApp({
    siteDir,
    analyticsFile: join(stateDir, 'analytics.json'),
    visibilityFile: join(stateDir, 'visibility.json'),
  });
  server = app.server;
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  base = { host: '127.0.0.1', port: server.address().port };
});

after(async () => {
  if (server) await new Promise((res) => server.close(res));
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
});

// Суров HTTP клиент — `path` се праща ДОСЛОВНО (не се нормализира от клиента),
// за да можем да тестваме и path traversal атаки.
function req(method, path, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const r = request({ ...base, method, path, headers: headers || {} }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    r.on('error', reject);
    if (body != null) r.write(body);
    r.end();
  });
}

test('/healthz → 200 {ok:true, …} (happy path, обратно съвместимо)', async () => {
  const res = await req('GET', '/healthz');
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true); // обратна съвместимост: ok:true при здраво състояние
});

test('несъществуващ път → 404', async () => {
  const res = await req('GET', '/questa-non-esiste-xyz.html');
  assert.equal(res.status, 404);
});

test('path traversal (../../etc/passwd) → 403/404, без изтичане на файл', async () => {
  const res = await req('GET', '/%2e%2e/%2e%2e/%2e%2e/etc/passwd');
  assert.ok(res.status === 403 || res.status === 404, `очаквах 403/404, а е ${res.status}`);
  assert.ok(!res.body.includes('root:'), 'не трябва да изтича съдържание на /etc/passwd');
});

test('/admin без сесия → login страница', async () => {
  const res = await req('GET', '/admin');
  assert.equal(res.status, 200);
  assert.match(res.body, /Area riservata/);
});

test('POST /admin/api/login с грешна парола → 401 + не изтича причина', async () => {
  const res = await req('POST', '/admin/api/login', {
    body: JSON.stringify({ password: 'sbagliata' }),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(res.status, 401);
});

test('login с вярна парола → 200 + HttpOnly cookie (без Secure при insecure)', async () => {
  const res = await req('POST', '/admin/api/login', {
    body: JSON.stringify({ password: 'test-password-123' }),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true });
  const sc = String(res.headers['set-cookie'] || '');
  assert.match(sc, /ost_admin=/);
  assert.match(sc, /HttpOnly/);
  assert.ok(!/Secure/.test(sc), 'при OSPEDALI_INSECURE_COOKIES=1 не трябва да има Secure');
});

test('POST /admin/api/login с грешна парола ×6 → 429 throttle', async () => {
  // 6 грешни опита (всеки 401), 7-мият е блокиран (429).
  for (let i = 0; i < 6; i += 1) {
    const r = await req('POST', '/admin/api/login', {
      body: JSON.stringify({ password: 'ancora-sbagliata' }),
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(r.status, 401);
  }
  const bloccato = await req('POST', '/admin/api/login', {
    body: JSON.stringify({ password: 'ancora-sbagliata' }),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(bloccato.status, 429);
});

test('скрита (но съществуваща) страница → 404; видимата → 200', async () => {
  const nascosta = await req('GET', '/nascosta.html');
  assert.equal(nascosta.status, 404);
  assert.ok(!nascosta.body.includes('segreto'), 'скритата страница не трябва да се сервира');
  const visibile = await req('GET', '/index.html');
  assert.equal(visibile.status, 200);
  assert.match(visibile.body, /ok/);
});
