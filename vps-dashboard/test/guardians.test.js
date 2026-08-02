// Тихите пазачи: /etc дрейф + SSH входове.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Guardians, parseLast, ipHash } from '../src/guardians.js';
import { saveBaseline, snapshotEtc } from '../src/posture.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'csd-guard-'));

const LAST = [
  'root     pts/0        93.123.45.67     2026-07-30T10:00:00+00:00 - 2026-07-30T11:00:00+00:00  (01:00)',
  'deploy   pts/1        10.0.0.5         2026-07-30T09:00:00+00:00   still logged in',
  'reboot   system boot  6.8.0-40-generic 2026-07-29T08:00:00+00:00   still running',
  'root     tty1                          2026-07-28T07:00:00+00:00 - down   (00:10)',
].join('\n');

// ── parseLast ────────────────────────────────────────────────────────────────
test('пазачи: last се разбира — само мрежови входове, без reboot и конзола', () => {
  const e = parseLast(LAST);
  assert.equal(e.length, 2, 'reboot и tty1 без източник отпадат');
  assert.deepEqual(e.map((x) => x.source), ['93.123.45.67', '10.0.0.5']);
  assert.equal(e[0].user, 'root');
  assert.ok(Number.isFinite(e[0].ts));
});

test('пазачи: хешът на адреса е стабилен и НЕ е обратим до адреса', () => {
  assert.equal(ipHash('1.2.3.4'), ipHash('1.2.3.4'));
  assert.notEqual(ipHash('1.2.3.4'), ipHash('1.2.3.5'));
  assert.equal(ipHash('1.2.3.4').length, 16, 'кратък отпечатък — не самият адрес на диска');
});

// ── SSH проверката ───────────────────────────────────────────────────────────
test('пазачи: ПЪРВОТО пускане само зарежда котвата — не излива историята', () => {
  const g = new Guardians(tmp());
  const events = g.sshCheckFromText(LAST);
  assert.deepEqual(events, [], 'стартът не е инцидент');
  assert.ok(g.state.lastLoginTs > 0);
  assert.equal(g.state.ipHashes.length, 2, 'видените адреси стават познати');
});

test('пазачи: нов вход от ПОЗНАТ адрес е info, от НОВ адрес — warning', () => {
  const dir = tmp();
  const g = new Guardians(dir);
  // Котвата се задава с ЯВНО време — в производството е „сега", а тук „сега" би
  // било след тестовите входове и нищо не би минало за ново.
  g.sshCheckFromText(LAST, Date.parse('2026-07-30T11:30:00Z'));
  const later = [
    'root     pts/2        93.123.45.67     2026-07-30T12:00:00+00:00   still logged in',
    'root     pts/3        203.0.113.99     2026-07-30T12:05:00+00:00   still logged in',
  ].join('\n');
  const events = g.sshCheckFromText(later);
  assert.equal(events.length, 2);
  const known = events.find((e) => e.body.includes('93.123.45.67'));
  const fresh = events.find((e) => e.body.includes('203.0.113.99'));
  assert.equal(known.severity, 'info', 'познатият адрес не буди човек');
  assert.equal(fresh.severity, 'warning');
  assert.match(fresh.title, /НОВ адрес/);
  assert.equal(fresh.transient, true, 'входът е СЪБИТИЕ — няма какво да се „възстанови"');
  // Повторна проверка със същия текст: нищо ново.
  assert.deepEqual(g.sshCheckFromText(later), [], 'котвата напредва');
});

test('пазачи: на диска стоят ХЕШОВЕ, не адреси (преживява рестарт)', () => {
  const dir = tmp();
  const g = new Guardians(dir);
  g.sshCheckFromText(LAST);
  const raw = fs.readFileSync(path.join(dir, 'guardians.json'), 'utf8');
  assert.equal(raw.includes('93.123.45.67'), false, 'самият адрес не влиза в състоянието');
  assert.ok(raw.includes(ipHash('93.123.45.67')));
  assert.equal(fs.statSync(path.join(dir, 'guardians.json')).mode & 0o777, 0o600);
  const again = new Guardians(dir);
  assert.equal(again.state.ipHashes.length, 2);
});

// ── /etc дрейфът ─────────────────────────────────────────────────────────────
test('пазачи: без отпечатък — тиха покана (info, веднъж седмично)', () => {
  const g = new Guardians(tmp());
  const c = g.etcCheck({});
  assert.equal(c.length, 1);
  assert.equal(c[0].key, 'etc:baseline');
  assert.equal(c[0].severity, 'info');
});

test('пазачи: чист отпечатък — нула аларми; дрейф — warning-СЪСТОЯНИЕ с примери', () => {
  const dir = tmp();
  // Истински отпечатък на текущата система (WATCHED пътищата, които съществуват).
  saveBaseline(dir, snapshotEtc());
  const g = new Guardians(dir);
  assert.deepEqual(g.etcCheck({}), [], 'нищо не е пипано → тишина');

  // Подправяме базовата линия: все едно един файл е бил друг.
  const base = JSON.parse(fs.readFileSync(path.join(dir, 'etc-baseline.json'), 'utf8'));
  const keys = Object.keys(base.files);
  if (keys.length) {
    base.files[keys[0]] = { ...base.files[keys[0]], sha256: 'друг-хеш' };
    base.files['/etc/фантомен-файл.conf'] = { sha256: 'x', mode: '0644', size: 1 };
    fs.writeFileSync(path.join(dir, 'etc-baseline.json'), JSON.stringify(base));
    const g2 = new Guardians(dir);
    const c = g2.etcCheck({});
    assert.equal(c.length, 1);
    assert.equal(c[0].key, 'etc:drift');
    assert.equal(c[0].severity, 'warning');
    assert.match(c[0].body, /Променени: 1/);
    assert.match(c[0].body, /изтрити: 1/, 'фантомният файл от базата е „изтрит" сега');
    assert.match(c[0].body, /нов отпечатък/, 'казва как се приема промяната');
  }
});

test('пазачи: дрейфът се смята по КАДАНС — междинните викания ползват кеша', () => {
  const g = new Guardians(tmp());
  g.etcCheck({});
  const at = g.lastEtcAt;
  g.etcCheck({}); // веднага пак → кешът, без ново сканиране
  assert.equal(g.lastEtcAt, at, 'второто викане не сканира');
});
