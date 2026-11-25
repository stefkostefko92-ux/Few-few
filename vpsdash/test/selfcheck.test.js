// Проверката на панела срещу машината — чистите части. Целият отчет се пуска в
// smoke обиколката (истински сървър) и в лабораторията.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vhostFindings, canWrite, selfCheck } from '../src/selfcheck.js';

test('самопроверка: vhost без редовете, без които части от панела не работят', () => {
  const tpl = fs.readFileSync(path.join(import.meta.dirname, '..', 'deploy', 'nginx.conf.example'), 'utf8');
  assert.deepEqual(vhostFindings(tpl), [], 'шаблонът от репото има всичко');
  const bare = 'location / { proxy_pass http://127.0.0.1:7700; }';
  const titles = vhostFindings(bare).map((f) => f[0]).join(' | ');
  assert.match(titles, /413/);
  assert.match(titles, /SSE/);
  assert.match(titles, /адрес/);
  assert.match(titles, /WebSocket/);
});

test('самопроверка: „записваема" значи РЕАЛЕН запис, не права на хартия', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-sc-'));
  assert.equal(canWrite(dir).ok, true);
  assert.deepEqual(fs.readdirSync(dir), [], 'пробният файл се трие веднага');
  assert.equal(canWrite(path.join(dir, 'няма')).ok, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('самопроверка: продукт на чужд порт и липсваща папка се виждат, без да гърми', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-sc-'));
  const cfg = {
    paths: { stateDir: dir, archiveDir: path.join(dir, 'няма'), currentLink: path.join(dir, 'cur'), releasesDir: dir },
    healthChecks: [{ name: 'стар', url: 'http://127.0.0.1:1/health' }, { name: 'друг', url: 'http://127.0.0.1:2/health' }],
    envFiles: [{ name: 'стар', path: '/opt/няма-такъв/.env' }],
  };
  const r = await selfCheck(cfg, {}, { headers: {} });
  const by = (t) => r.checks.find((c) => c.title === t);
  assert.equal(by('Папката за състоянието е записваема').status, 'ok');
  // Заглавието казва истината и при провал — не „е записваема" с червена точка.
  assert.equal(by('Папката за архиви е записваема'), undefined);
  assert.equal(by('Папката за архиви НЕ е записваема').status, 'bad');
  assert.ok(by('Папката за архиви НЕ е записваема').cmd.startsWith('mkdir -p '));
  assert.equal(by('Нито един продукт не отговаря на проверката').status, 'bad');
  assert.equal(by('Файлът с променливи липсва').status, 'warn');
  assert.ok(r.summary.bad >= 2);
  fs.rmSync(dir, { recursive: true, force: true });
});
