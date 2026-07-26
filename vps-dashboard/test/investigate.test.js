// Фаза Е — „Разследване": времева линия, намиране на момента, извод.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findIncident, timeline, seriesAround, summarize, isMutatingAction } from '../src/investigate.js';

const T0 = new Date('2026-03-15T12:00:00.000Z').getTime();
const iso = (offsetMin) => new Date(T0 + offsetMin * 60000).toISOString();

// 60 точки на минута: спокойно, после рязък скок.
function points({ breakAt = 40, before = 20, after = 90, n = 60 } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    ts: iso(i - n),
    cpu: i < breakAt ? before + (i % 3) : after + (i % 3),
    memUsed: 40,
    memTotal: 100,
    diskMax: 50,
    load1: 0.5,
  }));
}

test('findIncident намира момента на скока', () => {
  const inc = findIncident(points());
  assert.ok(inc, 'трябваше да намери промяна');
  assert.equal(inc.series, 'cpu');
  const minutesFromEnd = (T0 - new Date(inc.at).getTime()) / 60000;
  // Скокът е на 40-ата от 60 точки → ~20 минути преди края.
  assert.ok(minutesFromEnd > 15 && minutesFromEnd < 25, `намерен на ${minutesFromEnd} мин преди края`);
});

test('findIncident мълчи при спокойни данни', () => {
  const flat = Array.from({ length: 60 }, (_, i) => ({ ts: iso(i - 60), cpu: 20 + (i % 2), memUsed: 40, memTotal: 100 }));
  assert.equal(findIncident(flat), null, 'без промяна не бива да измисля инцидент');
  assert.equal(findIncident([]), null);
  assert.equal(findIncident(points({ n: 10 })), null, 'малко точки → без заключение');
});

test('времевата линия взема само мутиращото от одита', () => {
  const events = timeline({
    at: iso(0),
    windowMs: 30 * 60000,
    audit: [
      { ts: iso(-5), action: 'deploy.run', user: 'admin' },
      { ts: iso(-3), action: 'service.action', unit: 'medqr.service', user: 'admin' },
      { ts: iso(-2), action: 'audit.view', user: 'admin' }, // четене — извън линията
      { ts: iso(-1), action: 'file.view', path: '/etc/hosts' }, // също четене
      { ts: iso(-120), action: 'power.reboot' }, // извън прозореца
    ],
    alerts: [{ ts: iso(2), type: 'firing', severity: 'critical', title: 'Продукт не отговаря', body: 'medqr' }],
    releases: [{ name: '20260315-115800', mtime: iso(-4) }],
    jobs: [{ startedAt: iso(-6), title: 'autodeploy', code: 0 }, { startedAt: iso(1), title: 'backup', code: 2 }],
  });
  const titles = events.map((e) => e.title);
  assert.ok(titles.includes('deploy.run'));
  assert.ok(titles.includes('service.action'));
  assert.ok(!titles.includes('audit.view'), 'четенето би удавило линията');
  assert.ok(!titles.includes('file.view'));
  assert.ok(!titles.includes('power.reboot'), 'извън прозореца');
  assert.ok(titles.includes('release 20260315-115800'));
  assert.ok(titles.includes('Продукт не отговаря'));
  // Подредени по време.
  const times = events.map((e) => new Date(e.ts).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  // „преди/след" е решаващото разграничение: преди = улика, след = следствие.
  assert.equal(events.find((e) => e.title === 'deploy.run').before, true);
  assert.equal(events.find((e) => e.title === 'Продукт не отговаря').before, false);
  assert.match(events.find((e) => e.title === 'deploy.run').when, /преди/);
  assert.equal(events.find((e) => e.title === 'backup').failed, true);
});

test('четящите действия не влизат — префиксът сам не стига', () => {
  // Записът и четенето споделят префикса; разликата е глаголът.
  assert.equal(isMutatingAction('file.write'), true);
  assert.equal(isMutatingAction('file.view'), false);
  assert.equal(isMutatingAction('env.write'), true);
  assert.equal(isMutatingAction('env.read'), false);
  assert.equal(isMutatingAction('env.reveal'), false, 'разкриването не променя машината');
  assert.equal(isMutatingAction('backup.restoreApply'), true);
  assert.equal(isMutatingAction('backup.restorePreview'), false, 'прегледът не пипа живото');
  assert.equal(isMutatingAction('audit.view'), false);
  assert.equal(isMutatingAction('login.ok'), false, 'непознат префикс не влиза');
  assert.equal(isMutatingAction(''), false);
  assert.equal(isMutatingAction(undefined), false);
});

test('прозорецът реже симетрично около момента', () => {
  const audit = [{ ts: iso(-31), action: 'service.action' }, { ts: iso(-29), action: 'docker.action' },
    { ts: iso(29), action: 'compose.up' }, { ts: iso(31), action: 'deploy.run' }];
  const events = timeline({ at: iso(0), windowMs: 30 * 60000, audit });
  assert.deepEqual(events.map((e) => e.title), ['docker.action', 'compose.up']);
});

test('seriesAround дава само точките в прозореца', () => {
  const s = seriesAround(points({ n: 60 }), iso(-10), 5 * 60000);
  assert.ok(s.cpu.points.length > 0 && s.cpu.points.length <= 11);
  for (const p of s.cpu.points) {
    assert.ok(Math.abs(p.x - (T0 - 10 * 60000)) <= 5 * 60000);
  }
  assert.equal(s.memory.label, 'памет');
  // Памет като процент от общото, не сурови байтове.
  assert.equal(s.memory.points[0].y, 40);
});

test('изводът сочи деплоя, но НЕ твърди причинност', () => {
  const events = timeline({
    at: iso(0),
    windowMs: 30 * 60000,
    audit: [{ ts: iso(-2), action: 'deploy.run' }, { ts: iso(-1), action: 'service.action', unit: 'medqr' }],
    releases: [{ name: 'R1', mtime: iso(-2) }],
  });
  const inc = { at: iso(0), label: 'процесор', corroborated: ['процесор', 'памет'] };
  const text = summarize(inc, events);
  assert.match(text, /Деплой/);
  assert.match(text, /съвпадения по време, не доказана причина/, 'не бива да звучи като присъда');
  assert.match(text, /едновременно в: процесор, памет/);
  // Празен прозорец казва какво да се направи, вместо да мълчи.
  const empty = summarize(null, []);
  assert.match(empty, /Нищо не изпъква/);
  assert.match(empty, /Разшири прозореца/);
});
