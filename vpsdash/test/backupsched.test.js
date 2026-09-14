// Бекъп по график + копие извън машината.
//
// Тестват се решенията, които се чупят тихо: кога графикът СЕ ПУСКА (фиксиран час,
// първо пускане, догонване на изпуснат час), че включен-но-неработещ график вдига
// отделна аларма, и че приемащата страна отхвърля всичко, което не е точно това,
// което подателят твърди — включително истински трансфер срещу истински сървър.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';

import {
  BackupSchedule,
  scheduleChecks,
  assertShipName,
  assertNodeId,
  isTlsPeer,
  sha256File,
  receiveOffsite,
  pruneOffsite,
  offsiteDir,
} from '../src/backupsched.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'csd-bsched-'));
// Локално време, за да съвпада с `new Date(now).getHours()` в due().
const at = (h, day = 15) => new Date(2026, 6, day, h, 5, 0).getTime();
const CFG = { backups: { schedule: { enabled: true, everyHours: 24, atHour: 3 } } };

// ── Кога се пуска ────────────────────────────────────────────────────────────
test('график: първото пускане ЧАКА нощния час, не тръгва при инсталация', () => {
  const s = new BackupSchedule(tmp());
  assert.equal(s.due(CFG, at(14)), false, 'инсталация в 14:00 не бива да пуска двучасова задача');
  assert.equal(s.due(CFG, at(3)), true);
});

test('график: в рамките на кадънса мълчи, дори в правилния час', () => {
  const s = new BackupSchedule(tmp());
  s.state.lastRunAt = new Date(at(3, 15)).toISOString();
  assert.equal(s.due(CFG, at(3, 15) + 3600000), false, '4:05 същия ден — минали са 1 час');
  assert.equal(s.due(CFG, at(3, 16)), true, 'на другия ден в 3 — време е');
});

test('график: изпуснатият час се ДОГОНВА, вместо да чака цял ден', () => {
  const s = new BackupSchedule(tmp());
  s.state.lastRunAt = new Date(at(3, 10)).toISOString();
  // 10:05 на 12-ти: часът НЕ е 3, но са минали >48h → пуска се въпреки това.
  assert.equal(s.due(CFG, at(10, 12)), true);
  // На същия ден в 10:05 (само 7 часа след пускането) — не.
  const s2 = new BackupSchedule(tmp());
  s2.state.lastRunAt = new Date(at(3, 12)).toISOString();
  assert.equal(s2.due(CFG, at(10, 12)), false);
});

test('график: изключен значи изключен', () => {
  const s = new BackupSchedule(tmp());
  assert.equal(s.due({ backups: { schedule: { enabled: false } } }, at(3)), false);
});

test('график: безсмислен час/каданс пада на разумното, не чупи', () => {
  const s = new BackupSchedule(tmp());
  // `everyHours: 0` пада на 24 (подразбирането), НЕ на 1: клампването надолу би
  // значело пълен дъмп на всеки час — по-лошо от стойността, която човекът е
  // сгрешил. Нагоре има твърд таван.
  assert.equal(s.status({ backups: { schedule: { everyHours: 0, atHour: 99 } } }).everyHours, 24);
  assert.equal(s.status({ backups: { schedule: { everyHours: 'хикс' } } }).everyHours, 24);
  assert.equal(s.status({ backups: { schedule: { everyHours: 999999 } } }).everyHours, 24 * 30);
  for (const h of [99, -1, 3.5, 'нощем', null]) {
    assert.equal(s.status({ backups: { schedule: { atHour: h } } }).atHour, 3, `atHour=${h}`);
  }
  assert.equal(s.status({ backups: { schedule: { atHour: 0 } } }).atHour, 0, 'полунощ е валиден час');
});

// ── Резултатът е факт, не намерение ──────────────────────────────────────────
test('график: успехът обновява „последен успешен", провалът — не', () => {
  const dir = tmp();
  const s = new BackupSchedule(dir);
  s.record({ ok: false, code: 1, output: 'psql не отговори' });
  assert.equal(s.state.lastOkAt, null, 'провалът не бива да минава за успех');
  assert.ok(s.state.lastRunAt);
  s.record({ ok: true, code: 0, output: '✔' });
  assert.ok(s.state.lastOkAt);
  // Преживява рестарт.
  const again = new BackupSchedule(dir);
  assert.equal(again.state.lastOkAt, s.state.lastOkAt);
  assert.equal(fs.statSync(path.join(dir, 'backup-sched.json')).mode & 0o777, 0o600);
});

// ── Алармите на самия график ─────────────────────────────────────────────────
test('график: провален планиран бекъп е КРИТИЧЕН', () => {
  const s = new BackupSchedule(tmp());
  s.record({ ok: false, code: 2, output: 'нула бази — това не е успех' });
  const c = scheduleChecks(CFG, s, at(4));
  const failed = c.find((x) => x.key === 'backup:sched-failed');
  assert.equal(failed.severity, 'critical');
  assert.match(failed.body, /нула бази/, 'диагнозата трябва да е в известието');
});

test('график: включен, но непускан от дълго — отделна аларма', () => {
  const s = new BackupSchedule(tmp());
  s.record({ ok: true, code: 0, output: '✔' });
  s.state.lastRunAt = new Date(at(3, 1)).toISOString();
  const c = scheduleChecks(CFG, s, at(3, 10)); // 9 дни по-късно, каданс 24h
  const stale = c.find((x) => x.key === 'backup:sched-stale');
  assert.equal(stale.severity, 'warning');
  assert.match(stale.title, /не е пускан/);
});

test('график: изключен → info, не критично (не буди човек в 3 сутринта)', () => {
  const c = scheduleChecks({ backups: { schedule: { enabled: false } } }, new BackupSchedule(tmp()));
  assert.deepEqual(c.map((x) => x.key), ['backup:sched-off']);
  assert.equal(c[0].severity, 'info');
});

test('график: скоро пускан и успешен → нула аларми', () => {
  const s = new BackupSchedule(tmp());
  s.record({ ok: true, code: 0, output: '✔' });
  assert.deepEqual(scheduleChecks(CFG, s), []);
});

// ── Валидации на изнасянето ──────────────────────────────────────────────────
test('изнасяне: името е затворен списък — нула изкачване по пътя', () => {
  assert.equal(assertShipName('zabobovdol-20260730-030001.sql.gz'), 'zabobovdol-20260730-030001.sql.gz');
  assert.equal(assertShipName('vol-uploads-20260730.tar.gz'), 'vol-uploads-20260730.tar.gz');
  for (const bad of ['../etc/passwd', '/etc/shadow', 'a/b.sql.gz', 'x.sql.gz\0', 'x.sh', '..sql.gz', '', 'x.tar.gz.exe']) {
    assert.throws(() => assertShipName(bad), /Невалидно име/, `${JSON.stringify(bad)} трябва да е отказано`);
  }
});

test('изнасяне: идентификаторът на възел също е частица от път', () => {
  assert.equal(assertNodeId('vps-2'), 'vps-2');
  for (const bad of ['../x', 'a/b', '', 'a b', 'x'.repeat(65)]) {
    assert.throws(() => assertNodeId(bad), /Невалиден идентификатор/);
  }
});

test('изнасяне: http peer се ОТКАЗВА (дъмпът е цялата база)', () => {
  assert.equal(isTlsPeer({ url: 'https://vps2.example' }), true);
  assert.equal(isTlsPeer({ url: 'http://10.0.0.5:7700' }), false, 'частната мрежа не е шифроване');
  assert.equal(isTlsPeer({ url: 'http://127.0.0.1:7700' }), true, 'loopback е за тест — там мрежа няма');
  assert.equal(isTlsPeer({ url: 'не-url' }), false);
});

// ── Истински трансфер срещу истински приемник ────────────────────────────────
function receiver(onDone, keep = 10) {
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      const r = await receiveOffsite(req, {
        node: url.searchParams.get('node'),
        name: url.searchParams.get('name'),
        sha256: req.headers['x-csd-sha256'],
        keep,
        dir: BASE,
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r));
      onDone?.(null, r);
    } catch (err) {
      res.writeHead(err.status || 500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
      onDone?.(err);
    }
  });
  return srv;
}

function send(port, { node, name, body, sha256, contentLength }) {
  return new Promise((resolve) => {
    const buf = Buffer.from(body);
    const headers = { 'content-type': 'application/octet-stream', 'x-csd': '1' };
    if (sha256 !== null) headers['x-csd-sha256'] = sha256 ?? crypto.createHash('sha256').update(buf).digest('hex');
    if (contentLength !== null) headers['content-length'] = String(contentLength ?? buf.length);
    const req = http.request(
      { host: '127.0.0.1', port, method: 'POST', path: `/?node=${node}&name=${name}`, headers },
      (res) => {
        let out = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (out += c));
        res.on('end', () => resolve({ status: res.statusCode, body: out }));
      }
    );
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.end(buf);
  });
}

const NODE = 'test-node';
// Своя папка: закованият път пишеше в живата /var/lib/vps-dashboard и тестовите
// възли изникнаха в таблицата на панела.
const BASE = offsiteDir(tmp());
const nodeDir = () => path.join(BASE, NODE);

test('изнасяне: цялото копие се приема, проверява по хеш и пише с mode 600', async (t) => {
  const srv = receiver();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  t.after(() => {
    srv.close();
    fs.rmSync(nodeDir(), { recursive: true, force: true });
  });
  const port = srv.address().port;
  const body = 'СЪДЪРЖАНИЕ НА ДЪМП'.repeat(50);

  const ok = await send(port, { node: NODE, name: 'db-1.sql.gz', body });
  assert.equal(ok.status, 200, ok.body);
  const full = path.join(nodeDir(), 'db-1.sql.gz');
  assert.equal(fs.readFileSync(full, 'utf8'), body);
  assert.equal(fs.statSync(full).mode & 0o777, 0o600);
  assert.equal(await sha256File(full), JSON.parse(ok.body).sha256);

  // Повторното пращане не прелива мрежата за нищо.
  const dup = await send(port, { node: NODE, name: 'db-1.sql.gz', body });
  assert.equal(JSON.parse(dup.body).duplicate, true);
});

test('изнасяне: несъвпадащ хеш се ОТХВЪРЛЯ и не оставя файл', async (t) => {
  const srv = receiver();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  t.after(() => {
    srv.close();
    fs.rmSync(nodeDir(), { recursive: true, force: true });
  });
  const port = srv.address().port;
  const bad = await send(port, { node: NODE, name: 'db-2.sql.gz', body: 'данни', sha256: 'a'.repeat(64) });
  assert.equal(bad.status, 400);
  assert.match(JSON.parse(bad.body).error, /РАЗЛИЧЕН/);
  assert.equal(fs.existsSync(path.join(nodeDir(), 'db-2.sql.gz')), false, 'копие със съмнителен хеш не бива да оцелява');
  assert.equal(fs.existsSync(path.join(nodeDir(), 'db-2.sql.gz.part')), false, 'нито недовършеното');
});

test('изнасяне: без content-length се отказва (иначе не мога да проверя мястото)', async (t) => {
  const srv = receiver();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  t.after(() => {
    srv.close();
    fs.rmSync(nodeDir(), { recursive: true, force: true });
  });
  const port = srv.address().port;
  // СУРОВ chunked заявка през сокет, а не през `http.request`: клиентът на Node
  // сам слага content-length при `end(buffer)` (проверено), тоест през него този
  // клон е недостижим — а истински подател може да прати именно chunked.
  const sha = crypto.createHash('sha256').update('x').digest('hex');
  const res = await rawChunked(port, `/?node=${NODE}&name=db-3.sql.gz`, sha, 'x');
  assert.match(res, /^HTTP\/1\.1 411 /, res.split('\r\n')[0]);
  assert.equal(fs.existsSync(path.join(nodeDir(), 'db-3.sql.gz')), false);
});

function rawChunked(port, pathname, sha, body) {
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1', () => {
      sock.write(
        `POST ${pathname} HTTP/1.1\r\nHost: 127.0.0.1\r\nx-csd: 1\r\nx-csd-sha256: ${sha}\r\n` +
          `Transfer-Encoding: chunked\r\n\r\n${body.length.toString(16)}\r\n${body}\r\n0\r\n\r\n`
      );
    });
    let out = '';
    sock.setEncoding('utf8');
    sock.on('data', (c) => (out += c));
    sock.on('close', () => resolve(out));
    sock.on('error', () => resolve(out));
  });
}

test('изнасяне: невалидно име/възел се отказват от приемника, не само от подателя', async (t) => {
  const srv = receiver();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  t.after(() => srv.close());
  const port = srv.address().port;
  assert.equal((await send(port, { node: NODE, name: 'x.sh', body: 'x' })).status, 400);
  assert.equal((await send(port, { node: '..', name: 'db.sql.gz', body: 'x' })).status, 400);
  assert.equal((await send(port, { node: NODE, name: 'db.sql.gz', body: 'x', sha256: null })).status, 400);
});

test('изнасяне: приемникът подрязва до N най-нови (не се пълни безкрайно)', () => {
  const dir = nodeDir();
  // Чисто начало: тестът не бива да зависи от това какво е оставил предишният.
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (let i = 1; i <= 5; i++) {
    const f = path.join(dir, `keep-${i}.sql.gz`);
    fs.writeFileSync(f, 'x');
    fs.utimesSync(f, new Date(2026, 0, i), new Date(2026, 0, i));
  }
  const dropped = pruneOffsite(BASE, NODE, 2);
  assert.deepEqual(dropped.sort(), ['keep-1.sql.gz', 'keep-2.sql.gz', 'keep-3.sql.gz']);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['keep-4.sql.gz', 'keep-5.sql.gz']);
  fs.rmSync(dir, { recursive: true, force: true });
});
