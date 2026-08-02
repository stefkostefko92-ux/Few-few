// SLO/бюджет за грешки + маскирането на журнала — чиста математика и чист текст,
// без система. Живото четене на journalctl се проверява ръчно.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  SloStore, windowStats, approxPercentile, burnRate, evaluateBurn, budgetRemaining, BUCKETS,
} from '../src/slo.js';
import { maskMessage, fingerprint, LogMiner } from '../src/logmine.js';

const NOW = 1_700_000_000_000;
const MIN = 60_000;

// Генератор на минутни агрегати: n минути назад от NOW, с даден брой лоши.
function rows({ name = 'p', minutes = 60, perMinute = 10, bad = 0, slow = 0, ms = 120, now = NOW }) {
  const out = [];
  for (let i = 0; i < minutes; i++) {
    const buckets = new Array(BUCKETS.length).fill(0);
    buckets[BUCKETS.findIndex((b) => ms <= b)] = perMinute;
    out.push({
      ts: now - i * MIN,
      name,
      total: perMinute,
      bad,
      slow,
      sumMs: ms * perMinute,
      maxMs: ms,
      buckets,
    });
  }
  return out;
}

test('windowStats сумира само своя продукт и своя прозорец', () => {
  const data = [...rows({ name: 'a', minutes: 120, bad: 1 }), ...rows({ name: 'b', minutes: 120, bad: 5 })];
  const w = windowStats(data, 'a', 60 * MIN, NOW);
  assert.equal(w.total, 610); // 61 минутни агрегата (границата е включена) × 10 проби
  assert.equal(w.bad, 61);
  assert.equal(w.errorRate, 0.1);
  assert.equal(w.avgMs, 120);
  // Продукт без данни не гърми, връща нули.
  const empty = windowStats(data, 'няма', 60 * MIN, NOW);
  assert.equal(empty.total, 0);
  assert.equal(empty.errorRate, 0);
  assert.equal(empty.p95Ms, null);
});

test('approxPercentile избира кофата, в която пада q', () => {
  // 100 проби: 90 бързи (≤100ms), 10 бавни (≤1600ms)
  const b = new Array(BUCKETS.length).fill(0);
  b[0] = 90;
  b[4] = 10;
  assert.equal(approxPercentile(b, 0.5), 100);
  assert.equal(approxPercentile(b, 0.95), 1600);
  assert.equal(approxPercentile(new Array(BUCKETS.length).fill(0), 0.95), null);
});

test('burnRate: 1× значи „бюджетът стига точно за прозореца"', () => {
  assert.ok(Math.abs(burnRate(0.001, 0.999) - 1) < 1e-9); // 1-0.999 не е точно 0.001 в двоичен вид
  assert.equal(Math.round(burnRate(0.0144, 0.999) * 10) / 10, 14.4);
  assert.equal(burnRate(0.5, 1), 0); // цел 100% → няма бюджет, не делим на нула
});

test('evaluateBurn мълчи при здрава услуга', () => {
  const data = rows({ minutes: 4320, bad: 0 }); // 3 дни чисти
  assert.equal(evaluateBurn(data, 'p', 0.999, { now: NOW }), null);
});

test('evaluateBurn пламва при устойчиво изгаряне и връща само най-тежкото правило', () => {
  const data = rows({ minutes: 4320, perMinute: 10, bad: 3 }); // 30% грешки навсякъде
  const hit = evaluateBurn(data, 'p', 0.999, { now: NOW });
  assert.ok(hit, 'трябваше да пламне');
  assert.equal(hit.severity, 'critical');
  assert.equal(hit.factor, 14.4); // най-строгото правило, не и трите
  assert.ok(hit.longBurn > 14.4);
});

test('evaluateBurn пази от „една лоша проба = страница"', () => {
  // Дълъг прозорец с грешки, но късият има само 1 лоша от малко проби →
  // това е мигване, не инцидент. Точно капанът от SRE Workbook.
  const data = [
    ...rows({ minutes: 360, perMinute: 1, bad: 0, now: NOW - 5 * MIN }),
    { ts: NOW, name: 'p', total: 1, bad: 1, slow: 0, sumMs: 50, maxMs: 50, buckets: new Array(BUCKETS.length).fill(0) },
  ];
  assert.equal(evaluateBurn(data, 'p', 0.999, { now: NOW, minBadShort: 3 }), null);
});

test('budgetRemaining: чисто = 100%, изчерпано = 0% и не пада под нула', () => {
  const clean = budgetRemaining(rows({ minutes: 100, bad: 0 }), 'p', 0.999, 30 * 86400000, NOW);
  assert.equal(clean.remainingPct, 100);
  assert.equal(clean.availabilityPct, 100);

  const burnt = budgetRemaining(rows({ minutes: 100, perMinute: 10, bad: 5 }), 'p', 0.999, 30 * 86400000, NOW);
  assert.equal(burnt.remainingPct, 0);
  assert.equal(burnt.spentPct, 100); // таван, не 50000%
  assert.ok(burnt.availabilityPct < 100);

  const none = budgetRemaining([], 'p', 0.999, 30 * 86400000, NOW);
  assert.equal(none.total, 0);
  assert.equal(none.remainingPct, 100);
});

test('SloStore: текущата минута се вижда веднага, старите отиват на диска', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-slo-'));
  const store = new SloStore(dir);
  store.record('x', { up: true, ms: 50, latencyTargetMs: 800 });
  store.record('x', { up: false, ms: 0, latencyTargetMs: 800 });
  store.record('x', { up: true, ms: 1500, latencyTargetMs: 800 }); // бавна, но жива
  // Още нищо не е записано на диск (минутата тече), но се чете от паметта.
  const live = store.read(0);
  assert.equal(live.length, 1);
  assert.equal(live[0].total, 3);
  assert.equal(live[0].bad, 1);
  assert.equal(live[0].slow, 1, '„бавно" е отделен показател от „долу"');

  // Изкуствено остаряваме агрегата → flush на диска при следващия запис.
  const [key, agg] = [...store.current.entries()][0];
  store.current.delete(key);
  agg.ts -= 5 * MIN;
  store.current.set(`${agg.ts}|x`, agg);
  store.record('x', { up: true, ms: 10 });
  assert.ok(fs.existsSync(store.file), 'старата минута трябваше да иде на диска');
  assert.equal(store.read(0).length, 2, 'дискът + текущата минута');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('маскирането маха тайните и стабилизира шаблона', () => {
  const a = maskMessage('connection refused to 10.0.0.7:5432 after 3 tries');
  const b = maskMessage('connection refused to 192.168.1.9:5432 after 41 tries');
  assert.equal(a, b, 'един и същи шаблон, различни числа/адреси');
  assert.equal(fingerprint(a), fingerprint(b));

  // Тайните НЕ бива да излязат — известието тръгва към Telegram/ntfy.
  const secret = maskMessage('auth failed: Authorization: Bearer sk-live-abc123DEF token=hunter2 user=ivan@example.com');
  assert.doesNotMatch(secret, /sk-live-abc123DEF/);
  assert.doesNotMatch(secret, /hunter2/);
  assert.doesNotMatch(secret, /ivan@example\.com/);
  assert.doesNotMatch(maskMessage('token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig'), /eyJhbGci/);
  // Пътищата също са PII-носители (/home/<име>/…).
  assert.doesNotMatch(maskMessage('cannot open /home/ivan/.ssh/id_rsa'), /ivan/);
});

test('отпечатъкът е кратък и различава истински различни грешки', () => {
  const fp = fingerprint('disk full on /var');
  assert.equal(fp.length, 16);
  assert.notEqual(fp, fingerprint('permission denied on /var'));
});

test('ratesByUnit брои само истинските грешки (p≤3)', () => {
  const groups = [
    { unit: 'a.service', priority: 3, count: 100, lastTs: NOW },
    { unit: 'a.service', priority: 2, count: 20, lastTs: NOW + 1 },
    { unit: 'a.service', priority: 4, count: 9999, lastTs: NOW }, // warning → извън сметката
    { unit: 'b.service', priority: 3, count: 5, lastTs: NOW },
  ];
  const r = LogMiner.ratesByUnit(groups, 60);
  assert.equal(r.length, 2);
  assert.equal(r[0].unit, 'a.service');
  assert.equal(r[0].errors, 120);
  assert.equal(r[0].distinct, 2);
  assert.equal(r[0].perMinute, 2);
  assert.equal(r[1].errors, 5);
  // Без прозорец не измисляме скорост.
  assert.equal(LogMiner.ratesByUnit(groups, 0)[0].perMinute, null);
});

test('LogMiner помни отпечатъците между пусканията и чисти старите', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csd-lm-'));
  const m = new LogMiner(dir);
  const old = Date.now() - 20 * 86400000;
  m.state.seen = { стар: { first: old, last: old }, нов: { first: Date.now(), last: Date.now() } };
  m.save();
  const again = new LogMiner(dir);
  assert.deepEqual(Object.keys(again.state.seen), ['нов'], 'по-старите от 14 дни отпадат');
  fs.rmSync(dir, { recursive: true, force: true });
});
