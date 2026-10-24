import assert from 'node:assert/strict';
import test from 'node:test';
import { MASTERY_TIERS, masteryFor, weaponLabel } from '../src/mastery.js';

test('праговете на майсторството са от CONTRACT.md §3', () => {
  assert.deepEqual(
    MASTERY_TIERS.map((tier) => [tier.id, tier.kills]),
    [
      ['bronze', 100],
      ['silver', 500],
      ['gold', 1500],
      ['platinum', 4000],
      ['diamond', 10000],
    ],
  );
});

test('значката и напредъкът към следващата', () => {
  assert.deepEqual(masteryFor(0), {
    tier: null,
    next: { id: 'bronze', kills: 100, remaining: 100 },
    percent: 0,
  });
  assert.equal(masteryFor(99).tier, null);
  assert.equal(masteryFor(100).tier, 'bronze');
  assert.equal(masteryFor(499).tier, 'bronze');
  assert.equal(masteryFor(500).tier, 'silver');
  assert.equal(masteryFor(1000).percent, 50);
  assert.equal(masteryFor(1500).tier, 'gold');
  assert.equal(masteryFor(4000).tier, 'platinum');
  const top = masteryFor(10000);
  assert.equal(top.tier, 'diamond');
  assert.equal(top.next, null);
  assert.equal(top.percent, 100);
  assert.equal(masteryFor(-3).tier, null);
});

test('имената на оръжията са текст, без да се гадае непознатото', () => {
  assert.equal(weaponLabel('weapon_ak47'), 'AK-47');
  assert.equal(weaponLabel('m4a1_silencer'), 'M4A1-S');
  assert.equal(weaponLabel('weapon_m4a1'), 'M4A4');
  assert.equal(weaponLabel('knife_t'), 'Knife');
  assert.equal(weaponLabel('weapon_knife_karambit'), 'Knife');
  assert.equal(weaponLabel('weapon_newgun'), 'NEWGUN');
  assert.equal(weaponLabel('<b>'), 'B');
});
