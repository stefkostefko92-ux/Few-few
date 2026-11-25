// Apple Wallet web service (src/routes/wallet.js /v1/…) — външен вход (device id, pushToken, Authorization),
// HMAC авторизация по profile.id, подписване на .pkpass през системния openssl. Smoke тестът проверява само
// „401 без токен“; тук е целият договор. Сертификатите са самоподписани, във временна папка.
// (Изпитателя, класиране по риск 21.11.2026 — V1.)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = fs.mkdtempSync(join(os.tmpdir(), 'vizitka-wallet-'));
process.env.PRINT_API_SECRET = 'test-print-secret';

// Самоподписан сертификат за подписа (същият играе и ролята на WWDR — openssl не проверява веригата).
const certDir = fs.mkdtempSync(join(os.tmpdir(), 'vizitka-wallet-cert-'));
const cert = join(certDir, 'pass.pem');
const key = join(certDir, 'pass.key');
execFileSync(
  'openssl',
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '1',
    '-subj',
    '/CN=test',
    '-keyout',
    key,
    '-out',
    cert,
  ],
  { stdio: 'ignore' }
);
const APPLE_ENV = {
  APPLE_TEAM_ID: 'TEAM123456',
  APPLE_PASS_TYPE_ID: 'pass.test.vizitka',
  APPLE_PASS_CERT: cert,
  APPLE_PASS_KEY: key,
  APPLE_WWDR_CERT: cert,
};
Object.assign(process.env, APPLE_ENV);

const { default: app } = await import('../src/app.js');
const { default: db } = await import('../src/db.js');
const { passAuthToken } = await import('../src/wallet/shared.js');

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

let failures = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    failures++;
    console.error(`✘ ${name}\n  ${err.message}`);
  }
}

db.prepare(
  "INSERT INTO users (id, email, password_hash) VALUES (1, 'w@b.bg', 'x'), (2, 'h@b.bg', 'x')"
).run();
db.prepare(
  "INSERT INTO profiles (id, user_id, slug, display_name, is_public) VALUES (1, 1, 'ivan', 'Иван', 1), (2, 2, 'skrit', 'Скрит', 0)"
).run();

const TYPE = APPLE_ENV.APPLE_PASS_TYPE_ID;
const DEV = 'device0123456789';
const PUSH = 'a'.repeat(64);
const auth = (serial) => ({ authorization: `ApplePass ${passAuthToken(serial)}` });
const reg = (serial, headers, body = { pushToken: PUSH }, dev = DEV) =>
  fetch(`${base}/v1/devices/${dev}/registrations/${TYPE}/${serial}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
const rows = (serial = '1') =>
  db.prepare('SELECT * FROM apple_pass_registrations WHERE serial_number = ?').all(serial);

await test('регистрация: 201, повторение с нов токен → 200 и точно един ред с новия токен', async () => {
  assert.equal((await reg('1', auth('1'))).status, 201);
  const r2 = await reg('1', auth('1'), { pushToken: 'b'.repeat(64) });
  assert.equal(r2.status, 200);
  const all = rows();
  assert.equal(all.length, 1);
  assert.equal(all[0].push_token, 'b'.repeat(64));
});

await test('чужд, празен или с друга дължина токен → 401, без ред и без изключение', async () => {
  for (const h of [
    auth('2'),
    { authorization: 'ApplePass ' },
    { authorization: 'ApplePass abc' },
    {},
  ]) {
    const r = await reg('1', h, { pushToken: PUSH }, 'other-device');
    assert.equal(r.status, 401, JSON.stringify(h));
  }
  assert.equal(rows().filter((r) => r.device_library_id === 'other-device').length, 0);
});

await test('pushToken празен, къс, с път или твърде дълъг → 400, без ред', async () => {
  for (const pushToken of ['', 'a'.repeat(31), '../x', 'a'.repeat(201), undefined]) {
    const r = await reg('1', auth('1'), { pushToken }, 'bad-push-device');
    assert.equal(r.status, 400, String(pushToken));
  }
  assert.equal(rows().filter((r) => r.device_library_id === 'bad-push-device').length, 0);
});

await test('без APPLE_* настройки: валиден токен → 404 (функцията е изключена)', async () => {
  const saved = process.env.APPLE_PASS_CERT;
  delete process.env.APPLE_PASS_CERT;
  try {
    assert.equal((await reg('1', auth('1'), { pushToken: PUSH }, 'off-device')).status, 404);
  } finally {
    process.env.APPLE_PASS_CERT = saved;
  }
});

await test('списък на регистрациите: 204 без редове, 200 със serialNumbers', async () => {
  const none = await fetch(`${base}/v1/devices/nobody/registrations/${TYPE}`);
  assert.equal(none.status, 204);
  const some = await fetch(`${base}/v1/devices/${DEV}/registrations/${TYPE}`);
  assert.equal(some.status, 200);
  assert.deepEqual((await some.json()).serialNumbers, ['1']);
});

await test('сваляне на картата: подписан .pkpass (ZIP с pass.json, manifest.json и signature)', async () => {
  const r = await fetch(`${base}/v1/passes/${TYPE}/1`, { headers: auth('1') });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') || '', /application\/vnd\.apple\.pkpass/);
  const buf = Buffer.from(await r.arrayBuffer());
  assert.equal(buf.toString('latin1', 0, 2), 'PK', 'не е ZIP');
  for (const f of ['pass.json', 'manifest.json', 'signature'])
    assert.ok(buf.includes(Buffer.from(f)), `липсва ${f}`);
  assert.ok(r.headers.get('last-modified'), 'липсва Last-Modified');
});

await test('If-Modified-Since след промяната → 304; скрита, непозната или без токен → 404/401', async () => {
  const later = new Date(Date.now() + 86_400_000).toUTCString();
  assert.equal(
    (
      await fetch(`${base}/v1/passes/${TYPE}/1`, {
        headers: { ...auth('1'), 'if-modified-since': later },
      })
    ).status,
    304
  );
  assert.equal(
    (await fetch(`${base}/v1/passes/${TYPE}/2`, { headers: auth('2') })).status,
    404,
    'скрита визитка'
  );
  assert.equal(
    (await fetch(`${base}/v1/passes/${TYPE}/999`, { headers: auth('999') })).status,
    404,
    'непозната'
  );
  assert.equal((await fetch(`${base}/v1/passes/${TYPE}/1`)).status, 401, 'без токен');
});

await test('отписване: грешен токен → 401 и редът остава; верен → 200 и редът изчезва', async () => {
  const url = `${base}/v1/devices/${DEV}/registrations/${TYPE}/1`;
  assert.equal((await fetch(url, { method: 'DELETE', headers: auth('2') })).status, 401);
  assert.equal(rows().length, 1);
  assert.equal((await fetch(url, { method: 'DELETE', headers: auth('1') })).status, 200);
  assert.equal(rows().length, 0);
});

server.close();
fs.rmSync(certDir, { recursive: true, force: true });
if (failures) {
  console.error(`\n${failures} провалени теста`);
  process.exit(1);
}
console.log('\nApple Wallet web service: всички тестове минаха.');
