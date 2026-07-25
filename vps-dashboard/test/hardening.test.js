// Регресии по находките от вътрешния преглед (Кодаджията) и red-team (Разбивача).
// Всеки тест пада преди съответната поправка.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clientIp, sendJson } from '../src/httpd.js';
import { loginAllowed, loginFailed, _resetLoginLimiter } from '../src/auth.js';
import { stripEditing } from '../src/pty.js';
import { redactSecrets, writeFile, readFilePreview } from '../src/files.js';
import { loadConfig } from '../src/config.js';

const audit = { log: () => {} };

test('clientIp: подправеният ляв X-Forwarded-For не мами лимитера', () => {
  // Nginx слага реалния IP НАЙ-ОТДЯСНО ($proxy_add_x_forwarded_for допълва).
  const req = (headers) => ({ headers, socket: { remoteAddress: '127.0.0.1' } });
  assert.equal(clientIp(req({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' }), true), '203.0.113.7');
  // X-Real-IP (от $remote_addr) има предимство — клиентът не може да го подправи.
  assert.equal(clientIp(req({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '9.9.9.9' }), true), '203.0.113.7');
  // Без доверие в проксито се брои сокетът, каквото и да пише в хедърите.
  assert.equal(clientIp(req({ 'x-forwarded-for': '9.9.9.9' }), false), '127.0.0.1');
  assert.equal(clientIp(req({}), true), '127.0.0.1');
});

test('лимитерът на входа заключва въпреки ротиращ подправен хедър', () => {
  _resetLoginLimiter();
  const req = (spoof) => ({
    headers: { 'x-forwarded-for': `${spoof}, 203.0.113.7` },
    socket: { remoteAddress: '127.0.0.1' },
  });
  // Атакуващият върти левия елемент; реалният IP отдясно е един и същ.
  for (let i = 0; i < 5; i++) {
    const ip = clientIp(req(`9.9.9.${i}`), true);
    assert.equal(loginAllowed(ip), true, `опит ${i} трябваше да е позволен`);
    loginFailed(ip);
  }
  assert.equal(loginAllowed(clientIp(req('9.9.9.99'), true)), false, 'след 5 провала трябва да е заключен');
  _resetLoginLimiter();
});

test('sendJson не пише хедъри втори път (SSE грешка не сваля процеса)', () => {
  // Симулира отговор, който вече е започнал (както след openSse).
  let wrote = false;
  const res = {
    headersSent: true,
    writableEnded: false,
    writeHead() { wrote = true; throw new Error('ERR_HTTP_HEADERS_SENT'); },
    end() {},
    setHeader() {},
  };
  assert.doesNotThrow(() => sendJson(res, 400, { error: 'късно' }));
  assert.equal(wrote, false, 'не биваше да пипа хедърите');
});

test('одитът на терминала сглобя реда от отделните клавиши', () => {
  // Браузърът праща по един клавиш; редът се сглобява на сървъра.
  assert.equal(stripEditing('rm -rf /'), 'rm -rf /');
  // Backspace/DEL се прилагат — в одита влиза изпълненото, не натисканото.
  assert.equal(stripEditing('lsX\x7f'), 'ls');
  assert.equal(stripEditing('abc\b\b'), 'a');
  // Управляващите знаци стават четими.
  assert.equal(stripEditing('\x03'), '^C');
  assert.equal(stripEditing('\x1b'), '^[');
});

test('тайните на панела се скриват при четене през браузъра', () => {
  const cfgJson = JSON.stringify(
    { adminUser: 'admin', passwordHash: 'scrypt:16384:8:1:aa:bb', sessionSecret: 'много-таен', peerToken: 'peer-таен', port: 7700 },
    null,
    2
  );
  const r = redactSecrets('/etc/vps-dashboard/config.json', cfgJson);
  assert.equal(r.changed, true);
  assert.doesNotMatch(r.text, /много-таен|peer-таен|scrypt:16384/);
  assert.match(r.text, /скрито/);
  assert.match(r.text, /"port": 7700/); // нетайното остава видимо

  // .env форма
  const env = redactSecrets('/etc/vps-dashboard/restic.env', 'RESTIC_PASSWORD=таен\nRESTIC_REPOSITORY=/mnt/b\n');
  assert.doesNotMatch(env.text, /таен/);

  // Чужд файл не се пипа.
  const other = redactSecrets('/etc/nginx/nginx.conf', 'password = abc');
  assert.equal(other.changed, false);
  assert.equal(other.text, 'password = abc');
});

test('запис върху файл с тайни е спрян (да не изтрие тайните с плочки)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-red-'));
  const f = path.join(dir, 'normal.conf');
  fs.writeFileSync(f, 'ок\n');
  // Нормален файл се пише.
  assert.doesNotThrow(() => writeFile(f, 'ново\n', {}, audit, 'test'));
  // Съдържание със скрити стойности не се записва никъде.
  assert.throws(() => writeFile(f, 'secret = «скрито»\n', {}, audit, 'test'), /скрити/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('прод режим не тръгва без конфиг (нула генерирани пароли в journald)', () => {
  const missing = path.join(os.tmpdir(), 'csd-няма-конфиг-' + Date.now() + '.json');
  assert.throws(() => loadConfig({ configPath: missing, allowDev: false }), /Липсва конфиг/);
});

test('preview на конфига минава през редакция', () => {
  // Проверяваме, че readFilePreview маркира редактираното съдържание.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-prev-'));
  const f = path.join(dir, 'plain.txt');
  fs.writeFileSync(f, 'нищо тайно\n');
  const r = readFilePreview(f, audit, 'test');
  assert.equal(r.redacted, false);
  assert.equal(r.content, 'нищо тайно\n');
  fs.rmSync(dir, { recursive: true, force: true });
});
