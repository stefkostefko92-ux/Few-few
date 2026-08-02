// Седмичният дайджест — съставянето (чиста функция) и кадансът.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { composeDigest, DigestSchedule } from '../src/digest.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'csd-digest-'));

// ── Съставянето ──────────────────────────────────────────────────────────────
test('дайджест: спокойната седмица звучи спокойно — и КАЗВА, че е спокойна', () => {
  const text = composeDigest({
    nodeName: 'VPS-1',
    alertCounts: { critical: 0, warning: 0 },
    activeNow: [],
    backup: { hasBackup: true, ageDays: 0.3, maxAgeDays: 2, lastDrillOkDays: 12, offsiteEnabled: true, offsiteShipped: 40 },
    traffic: { quotaBytes: 1, used: 5e11, usedPct: 2.3, warmedUp: true, projected: 9e11, projectedPct: 4.1 },
    slo: [{ name: 'medqr', target: 0.999, availability: 0.9999 }, { name: 'vizitka', target: 0.999, availability: 1 }],
  });
  assert.match(text, /VPS-1/);
  assert.match(text, /нито една критична/);
  assert.match(text, /Активни аларми сега: няма/);
  assert.match(text, /най-новият е на 0.3 дни, последна успешна проба преди 12 дни/);
  assert.match(text, /включено \(изнесени 40\)/);
  assert.match(text, /всички 2 продукта в целта/);
  assert.match(text, /седмичният пулс/);
});

test('дайджест: лошата седмица изброява точно проблемите, не всичко', () => {
  const text = composeDigest({
    nodeId: 'vps-1',
    alertCounts: { critical: 4, warning: 11 },
    topAlerts: [
      { title: 'Продукт не отговаря: medqr', count: 3 },
      { title: 'Дискът се пълни', count: 2 },
      { title: 'х', count: 1 },
      { title: 'няма да се покаже', count: 1 },
    ],
    activeNow: [{ title: 'Дискът се пълни', severity: 'warning' }],
    backup: { hasBackup: false, offsiteEnabled: false },
    slo: [
      { name: 'medqr', target: 0.999, availability: 0.95 },
      { name: 'vizitka', target: 0.999, availability: 1 },
    ],
    disks: [{ mount: '/', usePercent: 91, etaDays: 4 }],
    updates: { security: 3 },
    expiring: [{ what: 'TLS сертификат', name: 'medqr.example', daysLeft: 9 }],
  });
  assert.match(text, /4 критични, 11 предупреждения/);
  assert.match(text, /Продукт не отговаря: medqr \(×3\)/);
  assert.equal(text.includes('няма да се покаже'), false, 'top 3, не всичко');
  assert.match(text, /Активни СЕГА: 1/);
  assert.match(text, /НЯМА нито един дъмп/);
  assert.match(text, /ИЗКЛЮЧЕНО \(бекъп на същия диск не е бекъп\)/);
  assert.match(text, /medqr: наличност 95.00%/);
  assert.equal(text.includes('vizitka: наличност'), false, 'зелените продукти не се изброяват');
  assert.match(text, /Диск \/: 91%, пълен след ~4 дни/);
  assert.match(text, /Ъпдейти за сигурност: 3/);
  assert.match(text, /TLS сертификат изтича след 9 дни/);
});

test('дайджест: без проба за възстановяване се КАЗВА, не се премълчава', () => {
  const text = composeDigest({
    alertCounts: { critical: 0, warning: 0 },
    activeNow: [],
    backup: { hasBackup: true, ageDays: 1, maxAgeDays: 2, lastDrillOkDays: null, offsiteEnabled: false },
  });
  assert.match(text, /проба за възстановяване няма/);
});

// ── Кадансът ─────────────────────────────────────────────────────────────────
const CFG = { alerts: { digest: { enabled: true, weekday: 1, hour: 8 } } };
// Локално време: 2026-08-03 е понеделник.
const mon8 = new Date(2026, 7, 3, 8, 10).getTime();

test('дайджест: първото пращане чака СЛОТА (ден+час), не тръгва при старт', () => {
  const d = new DigestSchedule(tmp());
  assert.equal(d.due(CFG, new Date(2026, 7, 3, 14, 0).getTime()), false, 'понеделник следобед не е слотът');
  assert.equal(d.due(CFG, new Date(2026, 7, 4, 8, 10).getTime()), false, 'вторник в 8 също не е');
  assert.equal(d.due(CFG, mon8), true, 'понеделник в 8 е');
});

test('дайджест: седмичният ритъм — рано е → мълчи; слотът след ~7 дни → праща', () => {
  const d = new DigestSchedule(tmp());
  d.state.lastSentAt = new Date(mon8).toISOString();
  assert.equal(d.due(CFG, mon8 + 3600000), false, 'час по-късно — не');
  assert.equal(d.due(CFG, new Date(2026, 7, 6, 8, 10).getTime()), false, 'четвъртък — не');
  assert.equal(d.due(CFG, new Date(2026, 7, 10, 8, 10).getTime()), true, 'следващият понеделник в 8 — да');
});

test('дайджест: изпуснат слот се ДОГОНВА след 8+ дни, независимо от деня', () => {
  const d = new DigestSchedule(tmp());
  d.state.lastSentAt = new Date(mon8).toISOString();
  // Панелът е бил спрян в понеделник; сряда след 9 дни — праща, не чака слота.
  assert.equal(d.due(CFG, new Date(2026, 7, 12, 15, 0).getTime()), true);
});

test('дайджест: изключен значи изключен; записът преживява рестарт', () => {
  const dir = tmp();
  const d = new DigestSchedule(dir);
  assert.equal(d.due({ alerts: { digest: { enabled: false } } }, mon8), false);
  d.record('текст на отчета');
  const again = new DigestSchedule(dir);
  assert.ok(again.state.lastSentAt);
  assert.equal(again.state.lastText, 'текст на отчета');
  assert.equal(fs.statSync(path.join(dir, 'digest.json')).mode & 0o777, 0o600);
});
