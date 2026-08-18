// Известията: формат, прагове, тайни и — най-важното — какво става при ОТКАЗ.
//
// Аларма, която не стига, е равна на липсваща, но изглежда точно като работеща:
// панелът показва активна аларма, дневникът показва запис, а телефонът мълчи.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
process.env.CSD_MAIL_TIMEOUT_MS ||= '2000'; // тестът мери ПОВЕДЕНИЕТО, не търпението
import { notify, headerValue, mailAddress, passesSeverity } from '../src/notify.js';

// ── Стойности на хедъри ──────────────────────────────────────────────────────
test('известия: жетон с нов ред НЕ убива канала мълчаливо', async () => {
  // Жетон, копиран от уеб страница, често носи залепнал „\n". Node хвърля
  // „Invalid character in header content" и каналът мълчи ЗАВИНАГИ, а
  // съобщението не подсказва нищо. Сега пада с причина, която казва какво да
  // направиш.
  assert.throws(() => headerValue('abc\ndef', 'Жетонът'), /нов ред/);
  assert.throws(() => headerValue('токен-с-кирилица', 'Жетонът'), /latin-1/);
  assert.equal(headerValue('tk_normal_token', 'Жетонът'), 'tk_normal_token');

  const r = await notify(
    { nodeName: 'x', notify: { ntfy: { server: 'http://127.0.0.1:1', topic: 't', token: 'abc\ndef' } } },
    { severity: 'critical', title: 'a', body: 'b' }
  );
  const n = r.find((x) => x.channel === 'ntfy');
  assert.equal(n.ok, false);
  assert.match(n.error, /нов ред/, 'причината стига до човека, а не „Invalid character…"');
});

// ── Инжекция в хедърите на писмото ───────────────────────────────────────────
test('имейл: нов ред в адреса не добавя СКРИТИ хедъри', () => {
  assert.throws(() => mailAddress('a@b.c\nBcc: крадец@другаде.com', 'Получателят'), /нов ред/);
  assert.throws(() => mailAddress('не-е-адрес', 'Получателят'), /не прилича на адрес/);
});

test('имейл: подразбиращият се подател е ВАЛИДЕН (домейн без точка)', () => {
  // Първата версия на правилото искаше точка в домейна и отхвърляше
  // `vps-dashboard@localhost` — тоест имейлът щеше да пада на всяка машина по
  // подразбиране, а одитът да го отчита като „провал на канала".
  assert.equal(mailAddress('vps-dashboard@localhost', 'Подателят'), 'vps-dashboard@localhost');
  assert.equal(mailAddress('root@localhost', 'Подателят'), 'root@localhost');
  assert.equal(mailAddress('Панел <panel@example.com>', 'Подателят'), 'Панел <panel@example.com>');
});

test('имейл: заклещен sendmail не заковава известяването', async () => {
  // `notify()` чака ВСИЧКИ канали. Без таван един блокиран процес спира оценката
  // на алармите завинаги — точно когато има инцидент. Останалите канали имаха
  // таймаут; този нямаше.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-mail-t-'));
  const fake = path.join(dir, 'sendmail');
  fs.writeFileSync(fake, '#!/bin/sh\nsleep 120\n', { mode: 0o755 });
  const t0 = Date.now();
  const r = await notify({ nodeName: 'x', notify: { email: { to: 'a@b.c', sendmail: fake } } },
    { severity: 'critical', title: 'a', body: 'b' });
  const dt = Date.now() - t0;
  assert.ok(dt < 8000, `трябва да се откаже по таймаут, а отне ${dt} ms`);
  const e = r.find((x) => x.channel === 'email');
  assert.equal(e.ok, false, 'и се докладва като ПРОВАЛ, не като изпратено');
  assert.match(e.error, /не отговори/);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Прагът и „възстановено" ──────────────────────────────────────────────────
test('известия: „възстановено" на критична аларма минава праг „critical"', () => {
  // Иначе получаваш алармата, но НЕ и вдигането ѝ — най-лошата комбинация.
  assert.equal(passesSeverity({ severity: 'ok', wasSeverity: 'critical' }, 'critical'), true);
  assert.equal(passesSeverity({ severity: 'info' }, 'critical'), false);
});

// ── Отказът не заглушава другите канали ──────────────────────────────────────
test('известия: провалът на един канал не спира останалите', async () => {
  const got = [];
  const srv = http.createServer((req, res) => { got.push(req.url); res.writeHead(200); res.end('{}'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const r = await notify(
    {
      nodeId: 'n', nodeName: 'ТЕСТ',
      notify: {
        webhook: { url: `http://127.0.0.1:${port}/hook` },
        ntfy: { server: 'http://127.0.0.1:1', topic: 'мъртъв' }, // отказана връзка
      },
    },
    { severity: 'critical', title: 'a', body: 'b' }
  );
  srv.close();
  assert.equal(r.find((x) => x.channel === 'webhook').ok, true, 'живият канал получава известието');
  assert.equal(r.find((x) => x.channel === 'ntfy').ok, false, 'мъртвият се докладва като провал');
  assert.deepEqual(got, ['/hook']);
});

// ── Провалено известие НЕ се брои за изпратено ───────────────────────────────
test('аларми: пълен провал на известието кара следващата оценка да ОПИТА ПАК', async () => {
  // `lastNotified` се вписваше при НАРЕЖДАНЕ на събитието — преди да се знае
  // дали каналът е приел. Две секунди мрежов проблем правеха критична аларма
  // мълчалива за цял час (подразбиращият се cooldown), без нищо да го подсказва.
  const { AlertEngine, MAX_NOTIFY_RETRIES } = await import('../src/alerts.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-retry-'));
  const cfg = {
    nodeName: 'ТЕСТ',
    paths: { stateDir: dir },
    alerts: { enabled: true, cooldownMin: 60, notifyInfo: true },
    notify: { webhook: { url: 'http://127.0.0.1:1/мъртъв' } }, // винаги отказва
  };
  const eng = new AlertEngine({ cfg, metrics: { latest: null }, audit: { log() {} } });
  const key = 'проба:отказ';
  const cond = { key, severity: 'critical', title: 'Проба', body: 'тяло', sustain: false };
  eng.collect = async () => [cond];

  await eng.evaluate();
  const first = eng.active.get(key);
  assert.ok(first, 'алармата е активна');
  assert.equal(first.lastNotified, 0, 'часовникът е върнат — следващият каданс опитва пак');
  assert.equal(eng.notifyRetries.get(key), 1);

  await eng.evaluate();
  assert.equal(eng.notifyRetries.get(key), 2, 'вторият опит се брои');
  await eng.evaluate();
  assert.equal(eng.notifyRetries.get(key), 3);

  // След тавана се връщаме към нормалния ритъм — мъртъв канал не бива да
  // произвежда опит на всеки каданс завинаги.
  await eng.evaluate();
  assert.equal(eng.notifyRetries.get(key), MAX_NOTIFY_RETRIES + 1);
  assert.notEqual(eng.active.get(key).lastNotified, 0, 'спираме да опитваме на всеки каданс');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('аларми: УСПЕШНО известие нулира брояча и НЕ връща часовника', async () => {
  const { AlertEngine } = await import('../src/alerts.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-retry2-'));
  const srv = http.createServer((req, res) => { res.writeHead(200); res.end('{}'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const cfg = {
    nodeName: 'ТЕСТ',
    paths: { stateDir: dir },
    alerts: { enabled: true, cooldownMin: 60, notifyInfo: true },
    notify: { webhook: { url: `http://127.0.0.1:${srv.address().port}/hook` } },
  };
  const eng = new AlertEngine({ cfg, metrics: { latest: null }, audit: { log() {} } });
  const key = 'проба:успех';
  eng.collect = async () => [{ key, severity: 'critical', title: 'Проба', body: 'тяло', sustain: false }];
  await eng.evaluate();
  srv.close();
  assert.ok(eng.active.get(key).lastNotified > 0, 'доставеното известие НЕ се повтаря веднага');
  assert.equal(eng.notifyRetries.has(key), false, 'броячът е чист');
  fs.rmSync(dir, { recursive: true, force: true });
});
