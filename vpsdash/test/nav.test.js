// Навигацията „Топокарта": хъбовете покриват ВСИЧКИ секции точно веднъж, а
// алармите светят хъба, където живее причината.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { HUBS, hubOf, hubOfAlert, hubStates } from '../public/nav.js';

const app = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'public', 'app.js'), 'utf8');
const SECTIONS = [...app.slice(app.indexOf('const SECTIONS = ['), app.indexOf('];', app.indexOf('const SECTIONS = ['))).matchAll(/\{ id: '([\w-]+)'/g)].map((m) => m[1]);

test('всяка секция от app.js е в точно един хъб — и няма хъб със секция, която не съществува', () => {
  assert.ok(SECTIONS.length >= 40, `намерени ${SECTIONS.length} секции`);
  const placed = HUBS.flatMap((h) => h.sections);
  assert.deepEqual([...placed].sort(), [...new Set(placed)].sort(), 'секция в два хъба');
  assert.deepEqual(SECTIONS.filter((s) => !placed.includes(s)), [], 'секция без хъб — в менюто би отишла в „Управление" по резерва');
  assert.deepEqual(placed.filter((s) => !SECTIONS.includes(s)), [], 'хъб сочи несъществуваща секция');
  assert.equal(HUBS.length, 7);
  assert.equal(hubOf('fail2ban'), 'defense');
  assert.equal(hubOf('несъществуваща'), 'control', 'резервата не губи секцията');
});

test('всеки ключ на аларма от src/ има хъб — и непознатият отива в „Пулс"', () => {
  const src = path.resolve(import.meta.dirname, '..', 'src');
  const keys = new Set();
  for (const f of fs.readdirSync(src).filter((x) => x.endsWith('.js'))) {
    for (const m of fs.readFileSync(path.join(src, f), 'utf8').matchAll(/key: [`']([a-z0-9_-]+)(?::|[`'])/g)) keys.add(m[1]);
  }
  assert.ok(keys.size > 30, `ключове: ${keys.size}`);
  // Тези живеят законно в „Пулс" (там е „Аларми" и здравето на самия мониторинг).
  const PULSE = new Set(['product', 'slo', 'slo-slow', 'http5xx', 'traffic', 'business', 'anomaly', 'digest', 'proposal', 'monitor', 'heartbeat', 'notify', 'maintenance', 'stale', 'test']);
  const unmapped = [...keys].filter((k) => hubOfAlert(k) === 'pulse' && !PULSE.has(k));
  assert.deepEqual(unmapped, [], 'нов ключ на аларма без хъб — добави го в ALERT_PREFIX в public/nav.js');
  assert.equal(hubOfAlert('disk:/'), 'data');
  assert.equal(hubOfAlert('service:nginx.service'), 'work');
  assert.equal(hubOfAlert('ports:new'), 'defense');
  assert.equal(hubOfAlert('нещо-ново'), 'pulse');
});

test('хъбът носи НАЙ-ЛОШАТА тежест и броя ѝ; аномалиите не светят', () => {
  const st = hubStates([
    { key: 'disk:/', severity: 'warning' },
    { key: 'backup:age', severity: 'critical' },
    { key: 'inode:/', severity: 'warning' },
    { key: 'service:x', severity: 'warning' },
    { key: 'service:y', severity: 'warning' },
    { key: 'anomaly:cpu', severity: 'info' },
  ]);
  assert.deepEqual(st.data, { sev: 'danger', n: 1 }, 'критичната бие предупрежденията');
  assert.deepEqual(st.work, { sev: 'warn', n: 2 });
  assert.deepEqual(st.pulse, { sev: null, n: 0 }, 'info не свети');
  assert.deepEqual(hubStates(null).defense, { sev: null, n: 0 });
});
