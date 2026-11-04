import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRemovalMenu, PendingRemovals } from '../src/discord/remove-flow.js';
import { HOUR_MS } from '../src/domain/decay.js';
import type { BatchView } from '../src/services/mapping.js';

const t0 = new Date('2026-11-03T10:00:00Z');
const labels = {
  amnesia: 'Amnesia',
  ak: 'AK',
  ogkush: 'OG Kush',
  purple: 'Purple',
  skunk: 'Skunk',
};

function batch(id: number, seedTypeKey: string, percent: number): BatchView {
  return {
    id,
    seedTypeKey,
    count: 5,
    percent,
    anchoredAt: t0,
    rate: { decayPercent: 0.6, decayMinutes: 60 },
    createdAt: t0,
    createdByName: 'Тестер',
    source: 'command',
  };
}

test('изборът е вързан за човека и изтича', () => {
  let clock = t0.getTime();
  const store = new PendingRemovals(2 * 60_000, () => clock);
  const token = store.create('u1', [1, 2, 3], [2]);
  assert.deepEqual(store.get(token, 'u1')?.selected, [2]);
  assert.equal(store.get(token, 'u2'), null);
  assert.equal(store.select(token, 'u1', [1, 3, 99]), true);
  assert.deepEqual(store.get(token, 'u1')?.selected, [1, 3]); // 99 не е от менюто
  clock += 2 * 60_000 + 1;
  assert.equal(store.get(token, 'u1'), null);
});

test('take взима избора веднъж', () => {
  const store = new PendingRemovals(60_000, () => t0.getTime());
  const token = store.create('u1', [1, 2], [1, 2]);
  assert.deepEqual(store.take(token, 'u1')?.selected, [1, 2]);
  assert.equal(store.take(token, 'u1'), null);
});

test('менюто: до 25 партиди, първо изтичащите, отметнат видът, бутонът брои', () => {
  const batches = [
    ...Array.from({ length: 30 }, (_, i) => batch(i + 1, 'ak', 10 + i)),
    batch(100, 'amnesia', 5),
  ];
  const menu = buildRemovalMenu(batches, labels, t0, 'tok', [100]);
  const json = menu.components.map((c) => c.toJSON());
  const select = json[0]?.components[0];
  assert.ok(select && 'options' in select);
  assert.equal(select.options.length, 25);
  assert.equal(select.options[0]?.value, '100'); // 5% изтича най-рано
  assert.equal(select.options[0]?.default, true);
  assert.equal(select.options.filter((o) => o.default).length, 1);
  for (const o of select.options) assert.ok(o.label.length <= 100);
  const go = json[1]?.components[0];
  assert.ok(go && 'label' in go);
  assert.match(go.label ?? '', /\(1\)/);
  assert.equal(go.disabled, false);
  assert.match(menu.content, /25 от 31/);
});

test('без избор бутонът е изключен', () => {
  const menu = buildRemovalMenu(
    [batch(1, 'ak', 50)],
    labels,
    new Date(t0.getTime() + HOUR_MS),
    'tok',
    [],
  );
  const go = menu.components[1]?.toJSON().components[0];
  assert.ok(go && 'disabled' in go);
  assert.equal(go.disabled, true);
});
