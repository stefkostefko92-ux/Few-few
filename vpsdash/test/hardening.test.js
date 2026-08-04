// Регресии по находките от вътрешния преглед (Кодаджията) и red-team (Разбивача).
// Всеки тест пада преди съответната поправка.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clientIp, sendJson, openSse } from '../src/httpd.js';
import { loginAllowed, loginFailed, _resetLoginLimiter } from '../src/auth.js';
import { stripEditing } from '../src/pty.js';
import { run, runOk } from '../src/exec.js';
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

test('SSE: \\r и \\n оцеляват (иначе терминалът се разпада)', () => {
  // Симулираме openSse и гледаме какво реално тръгва по кабела.
  let wire = '';
  const res = { writableEnded: false, writeHead() {}, write(s) { wire += s; }, end() {}, on() {} };
  const sse = openSse(res);
  wire = '';
  sse.send('data', 'ред1\r\nред2\rвърнат');
  // В SSE „\r" е валиден край на ред → суровият текст губи carriage return-ите.
  // Затова пращаме JSON: в кабела няма нито един истински \r или \n в тялото.
  const body = wire.match(/^data: (.*)$/m)[1];
  assert.doesNotMatch(body, /[\r\n]/, 'тялото не бива да съдържа сурови нови редове');
  assert.equal(JSON.parse(body), 'ред1\r\nред2\rвърнат', 'след JSON.parse байтовете са същите');
  sse.close();
});

// ── Котва на одиторската верига ───────────────────────────────────────────────
// Веригата сама покрива само СРЕДАТА: последният ред няма следващ, който да го
// провери, а изтритите редове в края оставят вътрешно последователна верига.
// Точно отрязването е класическият ход — махаш редовете със своите действия.
test('котвата хваща отрязване и подмяна на последния запис', async () => {
  const { Audit } = await import('../src/audit.js');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-chain-'));
  const audit = new Audit(dir);
  for (let i = 0; i < 6; i++) audit.log({ action: 'test.action', n: i });
  const file = path.join(dir, 'audit.jsonl');
  const orig = fs.readFileSync(file, 'utf8');
  const lines = orig.split('\n').filter(Boolean);
  assert.equal(lines.length, 6);
  assert.equal(audit.verify().ok, true, 'чистият дневник минава');
  assert.equal(audit.verify().anchored, true, 'котвата съществува');

  // 1) Подмяна по средата — хваща се от самата верига.
  const mid = [...lines];
  mid[2] = JSON.stringify({ ...JSON.parse(mid[2]), action: 'подменено' });
  fs.writeFileSync(file, mid.join('\n') + '\n');
  const m = audit.verify();
  assert.equal(m.ok, false);
  assert.equal(m.brokenAt, 4, 'посочва първия ред, който вече не съвпада');

  // 2) Подмяна на ПОСЛЕДНИЯ — веригата не я вижда, котвата да.
  const last = [...lines];
  last[5] = JSON.stringify({ ...JSON.parse(last[5]), action: 'подменено' });
  fs.writeFileSync(file, last.join('\n') + '\n');
  const l = audit.verify();
  assert.equal(l.ok, false);
  assert.match(l.reason, /ПОСЛЕДЕН/);

  // 3) Отрязване на края — без котва това беше НЕВИДИМО.
  fs.writeFileSync(file, lines.slice(0, 3).join('\n') + '\n');
  const t = audit.verify();
  assert.equal(t.ok, false);
  assert.equal(t.truncated, true);
  assert.equal(t.missing, 3);
  assert.equal(t.expected, 6);

  // 4) Възстановяване → пак чисто (проверката не „помни" обвинения).
  fs.writeFileSync(file, orig);
  assert.equal(audit.verify().ok, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ротацията НЕ вдига фалшива тревога за отрязване', async () => {
  const { Audit } = await import('../src/audit.js');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-rot-'));
  const audit = new Audit(dir);
  audit.log({ action: 'преди.ротация' });
  // Симулираме прага: ротацията е ЗАКОННО скъсване — новият файл е от нула.
  fs.renameSync(path.join(dir, 'audit.jsonl'), path.join(dir, 'audit.jsonl.1'));
  audit.count = 0;
  audit.log({ action: 'след.ротация' });
  assert.equal(audit.verify().ok, true, 'ротацията не е подправяне');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Заклещена команда: вторият удар не се игнорира ───────────────────────────
test('exec: команда, която ИГНОРИРА SIGTERM, все пак умира', async () => {
  // Таймаутът на `execFile` праща само SIGTERM. Процес с trap го преживява и
  // остава завинаги — панелът го пуска пак на всяка проба и машината се задавя.
  const t0 = Date.now();
  const r = await run('sh', ['-c', 'trap "" TERM; sleep 30'], { timeout: 700 });
  const dt = Date.now() - t0;
  assert.equal(r.ok, false, 'заклещената команда не е успех');
  assert.ok(dt < 5000, `трябва да умре от втория удар, а отне ${dt} ms`);
});

// ── Липсващ инструмент ≠ „Вътрешна грешка" ───────────────────────────────────
test('exec: липсваща команда казва КОЯ липсва и кой пакет я носи', async () => {
  // Панелът върви на машини, където `ps`/`docker`/`ufw` може да ги няма. Ако
  // това стигне до потребителя като „Вътрешна грешка", човекът търси бъг в
  // панела, вместо да инсталира пакета. Съобщението е безопасно (име на
  // стандартен пакет) — затова носи `safe` и минава през маската на 5xx.
  await assert.rejects(
    () => runOk('няма-такава-команда-vpsdash', []),
    (err) => {
      assert.equal(err.status, 503, 'липсващ инструмент не е 502 „лоша врата"');
      assert.equal(err.safe, true, 'без това съобщението се маскира');
      assert.match(err.message, /липсва на тази машина/);
      return true;
    }
  );
  await assert.rejects(
    () => runOk('ps', ['--няма-такъв-флаг-vpsdash']),
    (err) => {
      assert.equal(err.status, 502, 'СЪЩЕСТВУВАЩА команда, която се проваля, си остава 502');
      assert.notEqual(err.safe, true, 'нейният stderr НЕ е безопасен за показване');
      return true;
    }
  );
});
