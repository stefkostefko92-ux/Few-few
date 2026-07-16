// Тестове за M5 доизкусуряването: одит дневник (GDPR-safe), по-дълбок /healthz,
// prod-guard за конфигурацията. Всичко върху изолирано временно състояние.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { formatEntry, appendAudit } from '../server/lib/audit.js';

// ── audit.js: чист формат + GDPR (без суров IP/UA/парола) ─────────────────────
test('formatEntry: валиден JSON с ts/azione/esito, без лични данни', () => {
  const riga = formatEntry({ azione: 'login', esito: 'ok' }, Date.parse('2026-07-14T10:00:00Z'));
  const o = JSON.parse(riga);
  assert.equal(o.azione, 'login');
  assert.equal(o.esito, 'ok');
  assert.equal(o.ts, '2026-07-14T10:00:00.000Z');
});

test('formatEntry: „esito" се нормализира до ok|fail', () => {
  assert.equal(JSON.parse(formatEntry({ azione: 'x', esito: 'ok' })).esito, 'ok');
  // всичко различно от „ok" → „fail"
  assert.equal(JSON.parse(formatEntry({ azione: 'x', esito: /** @type {any} */ ('boh') })).esito, 'fail');
});

test('formatEntry: GDPR — отрязва ip/user-agent/password/token/email от dettagli', () => {
  const riga = formatEntry({
    azione: 'login',
    esito: 'ok',
    dettagli: /** @type {any} */ ({
      ip: '1.2.3.4', userAgent: 'Mozilla', password: 'segreto',
      token: 'abc', email: 'a@b.c', nascoste: 3, motivo: 'throttled',
    }),
  });
  assert.ok(!riga.includes('1.2.3.4'), 'суров IP не бива да влиза в дневника');
  assert.ok(!riga.includes('Mozilla'));
  assert.ok(!riga.includes('segreto'));
  assert.ok(!riga.includes('a@b.c'));
  const o = JSON.parse(riga);
  // безопасните неидентифициращи детайли се пазят
  assert.equal(o.dettagli.nascoste, 3);
  assert.equal(o.dettagli.motivo, 'throttled');
  assert.equal(o.dettagli.ip, undefined);
  assert.equal(o.dettagli.password, undefined);
});

test('formatEntry: не-примитивни dettagli се пропускат (без вложени обекти)', () => {
  const o = JSON.parse(formatEntry({
    azione: 'x', esito: 'ok',
    dettagli: /** @type {any} */ ({ nested: { a: 1 }, arr: [1, 2], ok: true }),
  }));
  assert.equal(o.dettagli.nested, undefined);
  assert.equal(o.dettagli.arr, undefined);
  assert.equal(o.dettagli.ok, true);
});

test('appendAudit: append-only — добавя редове, създава директорията', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ospedali-audit-'));
  try {
    const file = join(dir, 'sub', 'audit.log'); // под-директория, за да проверим mkdir
    assert.equal(await appendAudit(file, { azione: 'login', esito: 'fail' }), true);
    assert.equal(await appendAudit(file, { azione: 'visibility', esito: 'ok', dettagli: { nascoste: 2 } }), true);
    const righe = (await readFile(file, 'utf8')).trim().split('\n');
    assert.equal(righe.length, 2, 'дневникът е append-only → два реда');
    assert.equal(JSON.parse(righe[0]).azione, 'login');
    assert.equal(JSON.parse(righe[1]).dettagli.nascoste, 2);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

test('appendAudit: best-effort — при невъзможен път връща false, без хвърляне', async () => {
  // Път през съществуващ ФАЙЛ (не директория) → mkdir/append се провалят.
  const dir = await mkdtemp(join(tmpdir(), 'ospedali-audit-'));
  try {
    const fileComeCartella = join(dir, 'file.txt');
    await writeFile(fileComeCartella, 'x');
    const ko = await appendAudit(join(fileComeCartella, 'audit.log'), { azione: 'login', esito: 'ok' });
    assert.equal(ko, false, 'грешката се поглъща → false (не спира заявката)');
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

// ── /healthz: 503 при недостъпно състояние ───────────────────────────────────
// Изолиран режим (insecure cookies + фиксирана парола) ПРЕДИ import на server.js.
process.env.OSPEDALI_ADMIN_PASSWORD = 'test-password-123';
process.env.OSPEDALI_SESSION_SECRET = 'test-session-secret-0123456789abcdef';
process.env.OSPEDALI_INSECURE_COOKIES = '1';

const { creaApp } = await import('../server/server.js');
const { eProduzione, initConfig } = await import('../server/lib/config.js');

let server;
let base;
let tmpRoot;

before(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'ospedali-audit-http-'));
  const siteDir = join(tmpRoot, 'site');
  await mkdir(siteDir, { recursive: true });
  await writeFile(join(siteDir, 'index.html'), '<html><head><title>Home</title></head><body>ok</body></html>');

  const app = await creaApp({
    siteDir,
    // state директорията сочи към НЕСЪЩЕСТВУВАЩ път → access(W_OK) се проваля → 503.
    stateDir: join(tmpRoot, 'stato-mancante'),
    analyticsFile: join(tmpRoot, 'analytics.json'),
    visibilityFile: join(tmpRoot, 'visibility.json'),
    auditFile: join(tmpRoot, 'audit.log'),
  });
  server = app.server;
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  base = { host: '127.0.0.1', port: server.address().port };
});

after(async () => {
  if (server) await new Promise((res) => server.close(res));
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
});

/** @param {string} method @param {string} path */
function req(method, path) {
  return new Promise((resolve, reject) => {
    const r = request({ ...base, method, path }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    r.on('error', reject);
    r.end();
  });
}

test('/healthz → 503 {ok:false, reason} при недостъпна state директория', async () => {
  const res = await req('GET', '/healthz');
  assert.equal(res.status, 503);
  const o = JSON.parse(res.body);
  assert.equal(o.ok, false);
  assert.equal(o.reason, 'state_not_writable');
});

// ── config prod-guard ─────────────────────────────────────────────────────────
test('eProduzione: prod при NODE_ENV=production ИЛИ липса на INSECURE_COOKIES', () => {
  const save = { ...process.env };
  try {
    delete process.env.NODE_ENV; process.env.OSPEDALI_INSECURE_COOKIES = '1';
    assert.equal(eProduzione(), false, 'локален режим (insecure cookies)');
    process.env.NODE_ENV = 'production';
    assert.equal(eProduzione(), true, 'NODE_ENV=production → prod');
    delete process.env.NODE_ENV; delete process.env.OSPEDALI_INSECURE_COOKIES;
    assert.equal(eProduzione(), true, 'липса на insecure cookies → prod (зад TLS)');
  } finally {
    process.env = save;
  }
});

test('initConfig: в prod без OSPEDALI_ADMIN_PASSWORD → отказва старт (хвърля)', async () => {
  const save = { ...process.env };
  // Ако локално има персистирана .state/admin.json, преместваме я настрани за детерминизъм.
  const credFile = new URL('../server/.state/admin.json', import.meta.url);
  let backup = null;
  if (existsSync(credFile)) { backup = await readFile(credFile); await rm(credFile); }
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.OSPEDALI_ADMIN_PASSWORD;
    delete process.env.OSPEDALI_INSECURE_COOKIES;
    await assert.rejects(() => initConfig(), /OSPEDALI_ADMIN_PASSWORD/);
  } finally {
    process.env = save;
    if (backup) await writeFile(credFile, backup);
  }
});
