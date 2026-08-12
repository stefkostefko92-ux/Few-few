// Регресии по находките от вътрешния преглед (Кодаджията) и red-team (Разбивача).
// Всеки тест пада преди съответната поправка.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clientIp, sendJson, openSse } from '../src/httpd.js';
import { loginAllowed, loginFailed, _resetLoginLimiter, attemptStart, globalDelayMs, bruteForceState, bearerAllowed, bearerFailed } from '../src/auth.js';
import { stripEditing } from '../src/pty.js';
import { run, runOk } from '../src/exec.js';
import { Audit } from '../src/audit.js';
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

// ── Ротацията на одита не бива да е тиха ─────────────────────────────────────
test('одит: проверката минава ПРЕЗ завъртените файлове, не само през текущия', () => {
  // Веднага след ротация `verify()` връщаше „ok, проверени 1" — зелено при
  // непроверени сто хиляди записа. Точно обратното на целта на доказателство
  // за цялост: то приспива, вместо да пази.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-rot-'));
  const a = new Audit(dir);
  for (let i = 0; i < 50; i++) a.log({ action: 'проба', i });
  // Изкуствена ротация: преименуваме както го прави кодът при препълване.
  fs.renameSync(path.join(dir, 'audit.jsonl'), path.join(dir, 'audit.jsonl.1'));
  a.count = 0;
  for (let i = 0; i < 5; i++) a.log({ action: 'след ротация', i });

  const v = a.verify();
  assert.equal(v.ok, true, 'веригата продължава ПРЕЗ файловете (prevHash не се нулира)');
  assert.equal(v.checked, 55, `очакват се 55 проверени, а не 5 — получени ${v.checked}`);
  assert.equal(v.files, 2);
  assert.equal(v.rotated, 1);
  assert.ok(v.oldest, 'хоризонтът се КАЗВА — иначе „цяла верига" не значи нищо');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('одит: ротацията пази ПОВЕЧЕ от едно поколение', () => {
  // Беше `rename(file, file + '.1')` — предишният `.1` се презаписваше, тоест
  // при всяка ротация най-старите следи изчезваха без ред някъде за това.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-rot2-'));
  const a = new Audit(dir);
  a.log({ action: 'първи' });
  for (const gen of [1, 2, 3]) {
    fs.writeFileSync(path.join(dir, 'audit.jsonl.' + gen), '{"поколение":' + gen + '}\n');
  }
  assert.deepEqual(
    a.files().map((f) => path.basename(f)),
    ['audit.jsonl.3', 'audit.jsonl.2', 'audit.jsonl.1', 'audit.jsonl'],
    'най-старият е ПЪРВИ — веригата се чете хронологично'
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('одит: ДВЕ последователни ротации не изяждат най-старото поколение', () => {
  // Мутационната проверка показа, че предишният тест не покриваше самото
  // завъртане — само четенето след него. А точно завъртането губеше данни:
  // `rename(file, file + '.1')` презаписваше предишния `.1`.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-rot3-'));
  const prev = process.env.CSD_AUDIT_MAX_BYTES;
  process.env.CSD_AUDIT_MAX_BYTES = '900'; // прагът е нисък, за да е ротацията истинска
  try {
    const a = new Audit(dir);
    // Толкова записи, че да има ТОЧНО две-три завъртания: при повече от
    // `KEEP_ROTATED` най-старото ЗАКОННО изпада и тестът би мерил друго нещо.
    for (let i = 0; i < 20; i++) a.log({ action: 'пълнеж', i, data: 'x'.repeat(40) });
    assert.ok(fs.existsSync(path.join(dir, 'audit.jsonl.1')), 'първо поколение съществува');
    assert.ok(fs.existsSync(path.join(dir, 'audit.jsonl.2')), 'ВТОРОТО поколение също — то се губеше');
    const v = a.verify();
    assert.equal(v.ok, true, 'веригата остава цяла през всички поколения');
    assert.ok(v.files >= 3, `очакват се поне 3 файла, намерени ${v.files}`);
    assert.equal(v.checked, 20, `всички 20 записа през всички поколения, не само последното — ${v.checked}`);
  } finally {
    if (prev === undefined) delete process.env.CSD_AUDIT_MAX_BYTES;
    else process.env.CSD_AUDIT_MAX_BYTES = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── Брутфорс: трите дупки, всяка доказана като АТАКА ─────────────────────────

test('паралелен залп НЕ минава лимита (проверката и отчитането са атомарни)', () => {
  _resetLoginLimiter();
  // Атаката: старият код проверяваше квотата, после чакаше (`await readJson`,
  // scrypt) и чак тогава отчиташе провала. Стоте заявки, тръгнали заедно, виждат
  // едно и също „свободно" състояние. Симулираме точно това — сто проверки БЕЗ
  // нито едно отчитане между тях.
  const burst = Array.from({ length: 100 }, () => loginAllowed('9.9.9.9'));
  assert.equal(burst.filter(Boolean).length, 100, 'старият ред пропуска целия залп — затова беше дупка');

  _resetLoginLimiter();
  const atomic = Array.from({ length: 100 }, () => attemptStart('9.9.9.9'));
  assert.equal(atomic.filter(Boolean).length, 5, 'слотът се заема веднага — минават точно 5, не 100');
  assert.equal(attemptStart('9.9.9.9'), false, 'квотата остава изчерпана');
  // Друг адрес не се влияе — лимитът е по източник, не общ таван на входа.
  assert.equal(attemptStart('9.9.9.10'), true);
});

test('разпределена атака се лови ГЛОБАЛНО и бави, вместо да заключва', () => {
  _resetLoginLimiter();
  assert.equal(globalDelayMs(), 0, 'при спокойствие нула забавяне — иначе наказваме собственика');
  // Сто адреса по един опит: всеки поотделно е под лимита, тоест броячът по IP
  // не вижда нищо. Точно така изглежда ботнет.
  for (let i = 0; i < 100; i++) attemptStart(`10.0.${Math.floor(i / 256)}.${i % 256}`);
  const d = globalDelayMs();
  assert.ok(d > 0, 'общият шум трябва да се вижда, дори когато всеки адрес е „чист"');
  assert.ok(d <= 5000, 'забавянето има таван — иначе става самопричинен отказ на услуга');
  const st = bruteForceState();
  assert.ok(st.recentFails >= 100 && st.addresses >= 100, 'състоянието се докладва за аларма/табло');
  // И най-важното: НЕ блокира. Собственикът с вярната парола влиза, само по-бавно.
  assert.equal(attemptStart('10.0.0.0'.replace('0.0', '9.9')), true);
});

test('грешен Bearer вече се брои и спира — беше безплатен и НЕВИДИМ опит', () => {
  _resetLoginLimiter();
  assert.equal(bearerAllowed('7.7.7.7'), true);
  for (let i = 0; i < 10; i++) bearerFailed('7.7.7.7');
  assert.equal(bearerAllowed('7.7.7.7'), false, 'налучкването на peerToken трябва да спре');
  assert.equal(bearerAllowed('7.7.7.8'), true, 'друг адрес не е засегнат');
  // Провалите по Bearer хранят и глобалния брояч — иначе атака по този вход
  // остава невидима за забавянето.
  assert.ok(bruteForceState().recentFails >= 10);
});

test('налучкването ГЪРМИ — защита без сигнал не позволява да реагираш', async () => {
  const { AlertEngine } = await import('../src/alerts.js');
  _resetLoginLimiter();
  const a = Object.create(AlertEngine.prototype);
  assert.deepEqual(a.bruteChecks(), [], 'при тишина не се вдига шум');

  // Един ядосан човек, забравил паролата: малко опити, ЕДИН адрес.
  for (let i = 0; i < 16; i++) attemptStart('5.5.5.5');
  let f = a.bruteChecks();
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'warning', 'един адрес е човек, не машина');
  assert.match(f[0].body, /смени паролата/);

  // Ботнет: същият общ брой, но пръснат. По адрес всеки е „чист" — точно
  // затова прагът е върху СБОРА.
  _resetLoginLimiter();
  for (let i = 0; i < 20; i++) attemptStart(`172.16.0.${i}`);
  f = a.bruteChecks();
  assert.equal(f[0].severity, 'critical');
  assert.match(f[0].title, /Разпределено/);
  assert.match(f[0].body, /машина, не забравена парола/);
});
