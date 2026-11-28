import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEALTH_BANDS, HEALTH_LEGEND, healthOf } from '../src/domain/health.js';
import {
  buildGroups,
  nextCrossing,
  pileLayout,
  sceneOf,
  shortDuration,
} from '../src/domain/tiles.js';
import type { BatchLike, RuleLike } from '../src/domain/alerts.js';
import { HOUR_MS } from '../src/domain/decay.js';

const now = new Date('2026-11-04T10:00:00Z');
const rate = { decayPercent: 0.6, decayMinutes: 60 };
const types = [
  { key: 'amnesia', label: 'Amnesia' },
  { key: 'ak', label: 'AK' },
  { key: 'ogkush', label: 'OG Kush' },
  { key: 'purple', label: 'Purple' },
  { key: 'skunk', label: 'Skunk' },
];

function batch(
  id: number,
  seedTypeKey: string,
  percent: number,
  count = 3,
  anchoredAt = now,
): BatchLike {
  return { id, seedTypeKey, count, percent, anchoredAt, rate };
}

function rule(
  id: number,
  kind: RuleLike['kind'],
  threshold: number,
  extra: Partial<RuleLike> = {},
): RuleLike {
  return {
    id,
    kind,
    threshold,
    seedTypeKey: null,
    channelId: '1',
    roleId: '2',
    enabled: true,
    repeatMinutes: null,
    message: null,
    ...extra,
  };
}

const groups = (batches: BatchLike[], thresholds: number[] = [20, 10]) =>
  buildGroups({ batches, types, thresholds, now, timezone: 'Europe/Sofia' });

test('здраве: границите на степените са включителни отдолу, изтеклата е отделна', () => {
  assert.equal(healthOf(100, false).stage, 'fresh');
  assert.equal(healthOf(75, false).stage, 'fresh');
  assert.equal(healthOf(74.99, false).stage, 'healthy');
  assert.equal(healthOf(50, false).stage, 'healthy');
  assert.equal(healthOf(49, false).stage, 'aging');
  assert.equal(healthOf(25, false).stage, 'aging');
  assert.equal(healthOf(24.9, false).stage, 'spoiling');
  assert.equal(healthOf(10, false).stage, 'spoiling');
  assert.equal(healthOf(9.99, false).stage, 'rotting');
  assert.equal(healthOf(0.01, false).stage, 'rotting');
  assert.equal(healthOf(0, false).stage, 'dead');
  assert.equal(healthOf(40, true).stage, 'dead', 'изтеклата е мъртва, каквото и да пише');
  assert.equal(healthOf(Number.NaN, false).stage, 'dead');
});

test('здраве: разваляне = 1 − %/100, етикети на български', () => {
  assert.equal(healthOf(100, false).decay, 0);
  assert.equal(healthOf(55, false).decay, 0.45);
  assert.equal(healthOf(0, false).decay, 1);
  assert.deepEqual(
    HEALTH_BANDS.map((b) => b.label),
    ['Свежа', 'Здрава', 'Остарява', 'Разваля се', 'Гние'],
  );
  // всяко семе в легендата попада в своята степен
  for (const l of HEALTH_LEGEND) {
    assert.equal(healthOf((1 - l.decay) * 100, l.dead).stage, l.stage, l.label);
  }
});

test('групи: по реда на видовете, плочките по изтичане, празните видове — отделно', () => {
  const r = groups([batch(1, 'skunk', 50), batch(2, 'amnesia', 90), batch(3, 'amnesia', 15)]);
  assert.deepEqual(
    r.groups.map((g) => g.key),
    ['amnesia', 'skunk'],
  );
  assert.deepEqual(
    r.groups[0]?.tiles.map((t) => t.id),
    [3, 2],
  );
  assert.deepEqual(r.empty, ['AK', 'OG Kush', 'Purple']);
  const g = r.groups[0];
  assert.ok(g);
  assert.equal(g.seeds, 6);
  assert.equal(g.lowestText, '15,00%');
  assert.equal(g.swatch, 'amnesia');
});

test('плочка: здраве, кратко оставащо време, минат праг, цял процент за голямата цифра', () => {
  const t = groups([batch(1, 'ak', 15.7)]).groups[0]?.tiles[0];
  assert.ok(t);
  assert.equal(t.health.stage, 'spoiling');
  assert.equal(t.health.label, 'Разваля се');
  assert.equal(t.status, 'под 20%');
  assert.equal(t.percentWhole, '15');
  assert.equal(t.leftText, '1 д 2 ч');
  const old = new Date(now.getTime() - 10 * HOUR_MS);
  const dead = groups([batch(2, 'ak', 3, 2, old)]).groups[0]?.tiles[0];
  assert.equal(dead?.health.stage, 'dead');
  assert.equal(dead?.leftText, 'изтекла');
  assert.equal(dead?.status, null);
});

test('купчинка: до 5 семена, една и съща при всяко рисуване, без застъпване', () => {
  assert.equal(pileLayout(1, 1).length, 1);
  assert.equal(pileLayout(1, 3).length, 3);
  assert.equal(pileLayout(1, 400).length, 5);
  assert.equal(pileLayout(1, 0).length, 1);
  assert.deepEqual(pileLayout(42, 12), pileLayout(42, 12));
  assert.notDeepEqual(pileLayout(42, 12), pileLayout(43, 12));
  const p = pileLayout(7, 5);
  for (let i = 0; i < p.length; i++)
    for (let j = i + 1; j < p.length; j++) {
      const a = p[i];
      const b = p[j];
      assert.ok(a && b);
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 0.8, `семена ${i} и ${j} се застъпват`);
    }
});

test('сцената: само каквото браузърът рисува', () => {
  const s = sceneOf(groups([batch(5, 'purple', 60, 2)]).groups);
  assert.deepEqual(Object.keys(s[0] ?? {}), ['id', 'type', 'decay', 'dead', 'layout']);
  assert.equal(s[0]?.type, 'purple');
  assert.equal(s[0]?.decay, 0.4);
  assert.equal(s[0]?.layout.length, 2);
});

test('следващ праг: най-близкият бъдещ, само включени и приложими правила', () => {
  const batches = [batch(1, 'ak', 30), batch(2, 'purple', 12)];
  // Purple 12% → 10% след 3 ч 20 мин; AK 30% → 20% след 16 ч 40 мин
  const n = nextCrossing(batches, [rule(1, 'PERCENT', 20), rule(2, 'PERCENT', 10)], now);
  assert.equal(n?.batchId, 2);
  assert.equal(n?.thresholdText, '≤ 10%');
  assert.equal(n?.at.getTime(), now.getTime() + (2 / 0.6) * HOUR_MS);
  // изключеното и чуждият вид не броят
  const only = nextCrossing(
    batches,
    [
      rule(1, 'PERCENT', 20),
      rule(2, 'PERCENT', 10, { enabled: false }),
      rule(3, 'PERCENT', 10, { seedTypeKey: 'skunk' }),
    ],
    now,
  );
  assert.equal(only?.batchId, 1);
  // минатият праг не е „следващ“; без бъдещи прагове — null
  assert.equal(nextCrossing([batch(3, 'ak', 5)], [rule(1, 'PERCENT', 20)], now), null);
  assert.equal(nextCrossing([], [rule(1, 'PERCENT', 20)], now), null);
  // часове до 0%: AK 30% изтича след 50 ч → прагът 12 ч е след 38 ч
  const h = nextCrossing([batch(1, 'ak', 30)], [rule(1, 'HOURS_LEFT', 12)], now);
  assert.equal(h?.at.getTime(), now.getTime() + 38 * HOUR_MS);
});

test('кратко оставащо време', () => {
  assert.equal(shortDuration((3 * 24 + 19) * HOUR_MS + 39 * 60_000), '3 д 19 ч');
  assert.equal(shortDuration(15 * HOUR_MS + 49 * 60_000), '15 ч 49 мин');
});
