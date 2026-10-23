import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLimitPatches, type LimitableProfile } from '../plan-limits-core';

const profile = (over: Partial<LimitableProfile> = {}): LimitableProfile => ({
  id: 'p1',
  customDomain: 'brand.com',
  style: { hideBadge: true, bgEffect: 'aurora' },
  published: true,
  ...over,
});

test('FREE: чисти собствения домейн и скрития бадж, пази останалия стил', () => {
  const [res] = planLimitPatches('FREE', [profile()]);
  assert.equal(res.id, 'p1');
  assert.equal(res.patch.customDomain, null);
  assert.equal(res.patch.style?.hideBadge, false);
  assert.equal(res.patch.style?.bgEffect, 'aurora');
  assert.equal(res.patch.published, undefined);
});

test('FREE: само първият (най-старият) профил остава публикуван', () => {
  const list = [
    profile({ id: 'a', customDomain: null, style: {} }),
    profile({ id: 'b', customDomain: null, style: {} }),
  ];
  const res = planLimitPatches('FREE', list);
  assert.deepEqual(res, [{ id: 'b', patch: { published: false } }]);
});

test('PRO/BUSINESS: домейнът и бадж-ът остават (платени функции)', () => {
  assert.deepEqual(planLimitPatches('PRO', [profile()]), []);
  assert.deepEqual(planLimitPatches('BUSINESS', [profile()]), []);
});

test('BUSINESS: до 5 профила, шестият се сваля от публикация', () => {
  const list = Array.from({ length: 6 }, (_, i) =>
    profile({ id: `p${i}`, customDomain: null, style: {} }),
  );
  const res = planLimitPatches('BUSINESS', list);
  assert.deepEqual(res, [{ id: 'p5', patch: { published: false } }]);
});

test('вече непубликуван излишен профил не се пипа повторно', () => {
  const list = [
    profile({ id: 'a', customDomain: null, style: {} }),
    profile({ id: 'b', customDomain: null, style: {}, published: false }),
  ];
  assert.deepEqual(planLimitPatches('FREE', list), []);
});
