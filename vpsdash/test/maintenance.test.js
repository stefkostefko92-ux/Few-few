// Режим „поддръжка" — пауза на известията, НЕ на алармите.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AlertEngine } from '../src/alerts.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'csd-maint-'));
const engine = (maintenance) =>
  new AlertEngine({
    cfg: { paths: { stateDir: tmp() }, alerts: { maintenance }, notify: {} },
    metrics: { latest: null },
    audit: null,
  });

test('поддръжка: активна/изтекла/липсваща се разпознават', () => {
  assert.equal(engine(null).maintenance(), null);
  assert.equal(engine({ until: Date.now() - 1000 }).maintenance(), null, 'изтеклата не важи');
  const m = { until: Date.now() + 60000, reason: 'деплой' };
  assert.deepEqual(engine(m).maintenance(), m);
});

test('поддръжка: известието се ПОТИСКА, но остава в дневника и одита', async () => {
  const eng = engine({ until: Date.now() + 60000, reason: 'деплой' });
  const entry = await eng.dispatch({ type: 'firing', key: 'disk:/', severity: 'critical', title: 'Дискът се пълни', body: '…' });
  assert.equal(entry.maintenance, true, 'маркирано е ЗАЩО не е тръгнало');
  assert.deepEqual(entry.sent, [], 'нищо не излиза навън');
  assert.equal(eng.maintSuppressed, 1, 'броячът за обобщението расте');
  assert.equal(eng.log.at(-1).key, 'disk:/', 'дневникът в панела го пази');
});

test('поддръжка: тестовото известие МИНАВА (иначе не можеш да провериш каналите)', async () => {
  const eng = engine({ until: Date.now() + 60000 });
  const entry = await eng.dispatch({ type: 'test', key: 'test', severity: 'info', title: 'Тест', body: '' });
  assert.notEqual(entry.maintenance, true);
});

test('поддръжка: изтичането чисти състоянието и праща обобщение', async () => {
  const eng = engine({ until: Date.now() - 5, reason: 'деплой' });
  eng.maintSuppressed = 7;
  // saveConfig в теста само пише в паметта — не пипаме /etc.
  eng.saveConfig = (cfg, patch) => Object.assign(cfg.alerts, patch.alerts);
  await eng.expireMaintenance();
  assert.equal(eng.cfg.alerts.maintenance, null, 'режимът се чисти САМ');
  assert.equal(eng.maintSuppressed, 0);
  const summary = eng.log.at(-1);
  assert.equal(summary.key, 'maintenance:done');
  assert.match(summary.body, /Потиснати известия: 7/);
  assert.notEqual(summary.maintenance, true, 'обобщението НЕ се самопотиска');
});

test('поддръжка: без изтекъл режим expireMaintenance не прави нищо', async () => {
  const eng = engine({ until: Date.now() + 60000 });
  const before = eng.log.length;
  await eng.expireMaintenance();
  assert.equal(eng.log.length, before);
  assert.ok(eng.maintenance(), 'активният режим остава');
});

test('поддръжка: заглушаването по ключ продължава да работи независимо', async () => {
  const eng = new AlertEngine({
    cfg: {
      paths: { stateDir: tmp() },
      alerts: { silences: [{ key: 'disk:/', until: Date.now() + 60000 }] },
      notify: {},
    },
    metrics: { latest: null },
    audit: null,
  });
  const entry = await eng.dispatch({ type: 'firing', key: 'disk:/', severity: 'warning', title: 'х', body: '' });
  assert.ok(entry.silenced, 'заглушаването е отделен механизъм, не се измества от поддръжката');
});
