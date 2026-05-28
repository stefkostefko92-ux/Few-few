import { test } from 'node:test';
import assert from 'node:assert/strict';
import { XP_TABLE, levelFromXp, applyXp, regenerateEnergy, ENERGY_REGEN_MS, classBaseStats } from '../progression';
import type { Character } from '../../types/domain';

function baseChar(over: Partial<Character> = {}): Character {
  return {
    id: 1,
    user_id: 1,
    is_npc: 0,
    name: 'Test',
    class: 'warrior',
    gender: 'male',
    portrait: 'default',
    level: 1,
    xp: 0,
    gold: 0,
    stat_points: 0,
    skill_points: 0,
    hp: 80, hp_max: 80, mp: 20, mp_max: 20,
    strength: 5, dexterity: 5, constitution: 5, intelligence: 5, charisma: 5, wisdom: 5,
    skill_sword: 0, skill_axe: 0, skill_bow: 0, skill_staff: 0, skill_magic: 0, skill_stealth: 0,
    energy: 50, energy_max: 100, energy_updated_at: Date.now(),
    arena_rating: 1000, wins: 0, losses: 0,
    created_at: Date.now(),
    ...over,
  };
}

test('XP_TABLE is monotonically increasing', () => {
  for (let i = 1; i < XP_TABLE.length - 1; i++) {
    assert.ok(XP_TABLE[i + 1] > XP_TABLE[i]);
  }
});

test('levelFromXp maps boundaries correctly', () => {
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(XP_TABLE[2] - 1), 1);
  assert.equal(levelFromXp(XP_TABLE[2]), 2);
  assert.equal(levelFromXp(XP_TABLE[5]), 5);
});

test('applyXp grants level up rewards', () => {
  const c = baseChar();
  const r = applyXp(c, XP_TABLE[3]);
  assert.ok(r.leveled);
  assert.equal(r.toLevel, 3);
  assert.equal(r.statPointsGained, 6);
  assert.equal(r.skillPointsGained, 4);
  assert.equal(c.stat_points, 6);
  assert.equal(c.level, 3);
  assert.ok(c.hp_max > 80);
});

test('applyXp without crossing level returns leveled=false', () => {
  const c = baseChar();
  const r = applyXp(c, 5);
  assert.equal(r.leveled, false);
  assert.equal(c.level, 1);
});

test('regenerateEnergy adds energy after enough time has passed', () => {
  const c = baseChar({ energy: 50, energy_max: 100, energy_updated_at: Date.now() - ENERGY_REGEN_MS * 3 });
  regenerateEnergy(c, Date.now());
  assert.equal(c.energy, 53);
});

test('regenerateEnergy caps at energy_max', () => {
  const c = baseChar({ energy: 99, energy_max: 100, energy_updated_at: Date.now() - ENERGY_REGEN_MS * 50 });
  regenerateEnergy(c, Date.now());
  assert.equal(c.energy, 100);
});

test('classBaseStats provides class flavor', () => {
  assert.ok(classBaseStats('warrior').strength >= 9);
  assert.ok(classBaseStats('mage').intelligence >= 9);
  assert.ok(classBaseStats('ranger').dexterity >= 9);
});
