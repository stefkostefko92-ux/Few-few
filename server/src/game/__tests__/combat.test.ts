import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateCombat } from '../combat';
import type { CombatActor } from '../../types/domain';

function actor(over: Partial<CombatActor>): CombatActor {
  return {
    name: 'Test',
    side: 'hero',
    level: 1,
    hp: 100,
    hp_max: 100,
    atk_min: 10,
    atk_max: 10,
    defense: 0,
    speed: 5,
    crit_chance: 0,
    dodge_chance: 0,
    sprite: 'warrior',
    class: 'warrior',
    ...over,
  };
}

test('combat: terminates within MAX_ROUNDS', () => {
  const hero = actor({ name: 'Hero', side: 'hero' });
  const foe = actor({ name: 'Foe', side: 'foe' });
  const r = simulateCombat(hero, foe);
  assert.ok(r.rounds.length > 0);
  assert.ok(r.rounds.length <= 60);
  assert.ok(r.winner === 'hero' || r.winner === 'foe');
});

test('combat: higher speed actor strikes first', () => {
  const hero = actor({ name: 'Hero', side: 'hero', speed: 10 });
  const foe = actor({ name: 'Foe', side: 'foe', speed: 1 });
  const r = simulateCombat(hero, foe);
  assert.equal(r.rounds[0].attacker, 'hero');
});

test('combat: dominant hero wins reliably', () => {
  let heroWins = 0;
  for (let i = 0; i < 30; i++) {
    const hero = actor({ name: 'Hero', side: 'hero', atk_min: 30, atk_max: 40, hp: 200, hp_max: 200 });
    const foe = actor({ name: 'Foe', side: 'foe', atk_min: 1, atk_max: 2, hp: 30, hp_max: 30 });
    const r = simulateCombat(hero, foe);
    if (r.winner === 'hero') heroWins++;
  }
  assert.ok(heroWins >= 28, `Hero should win ≥28/30, got ${heroWins}`);
});

test('combat: defense reduces damage', () => {
  // With heavy defense the foe should survive far longer
  const heroNoDef = actor({ name: 'Hero', side: 'hero', atk_min: 20, atk_max: 20 });
  const tankFoe = actor({ name: 'Tank', side: 'foe', defense: 200, hp: 100, hp_max: 100 });
  const r = simulateCombat(heroNoDef, tankFoe);
  // Damage per hit at defense=200 should be small; foe should take many rounds to die or survive
  const heroAttacks = r.rounds.filter((rd) => rd.attacker === 'hero' && rd.action === 'attack');
  if (heroAttacks.length > 0) {
    const avg = heroAttacks.reduce((s, rd) => s + rd.damage, 0) / heroAttacks.length;
    assert.ok(avg < 8, `Defense should reduce damage; avg was ${avg}`);
  }
});

test('combat: dodge can prevent damage', () => {
  const hero = actor({ name: 'Hero', side: 'hero', atk_min: 5, atk_max: 5 });
  const elusiveFoe = actor({ name: 'Wind', side: 'foe', dodge_chance: 1.0 });
  const r = simulateCombat(hero, elusiveFoe);
  // Every hero attack should be a dodge
  const heroOffense = r.rounds.filter((rd) => rd.attacker === 'hero');
  assert.ok(heroOffense.every((rd) => rd.action === 'dodge'));
});

test('combat: round indices are monotonic', () => {
  const hero = actor({ name: 'Hero', side: 'hero' });
  const foe = actor({ name: 'Foe', side: 'foe' });
  const r = simulateCombat(hero, foe);
  let prev = 0;
  for (const rd of r.rounds) {
    assert.ok(rd.index > prev);
    prev = rd.index;
  }
});
