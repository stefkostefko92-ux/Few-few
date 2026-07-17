// Изолирана in-memory база (deriveStats пипа БД само за guild buffs, които
// прескачаме с is_npc=1 — но задаваме пътя за всеки случай).
process.env.DB_PATH = ':memory:';

import test from 'node:test';
import assert from 'node:assert';
import { deriveStats } from '../stats';
import type { Character } from '../../types/domain';

/** Минимален герой; is_npc=1 → deriveStats не пипа БД (без guild buffs). */
function hero(over: Partial<Character> = {}): Character {
  return {
    id: 1, user_id: 1, is_npc: 1,
    name: 'T', class: 'warrior', gender: 'male', portrait: 'default',
    level: 10, xp: 0, gold: 0, stat_points: 0, skill_points: 0,
    hp: 100, hp_max: 100, mp: 20, mp_max: 20,
    strength: 10, dexterity: 10, constitution: 10, intelligence: 10, charisma: 10, wisdom: 10,
    skill_sword: 0, skill_axe: 0, skill_bow: 0, skill_staff: 0, skill_magic: 0, skill_stealth: 0,
    energy: 50, energy_max: 100, energy_updated_at: Date.now(),
    arena_rating: 1000, wins: 0, losses: 0, created_at: Date.now(),
    ...over,
  } as Character;
}

test('CHA дава сила на крита (crit_mult) — беше мъртъв стат', () => {
  const base = deriveStats(hero({ charisma: 0 }), []);
  const mid = deriveStats(hero({ charisma: 60 }), []);
  const high = deriveStats(hero({ charisma: 300 }), []);
  assert.equal(base.crit_mult, 1.8, 'CHA 0 → базови 1.8×');
  assert.ok(mid.crit_mult > base.crit_mult, 'повече CHA → по-силен крит');
  assert.equal(high.crit_mult, 2.4, 'таван 2.4× (1.8 + 0.6)');
});

test('WIS дава dodge (осъзнатост) — DEX вече не е единственият източник', () => {
  const noWis = deriveStats(hero({ dexterity: 20, wisdom: 0 }), []);
  const withWis = deriveStats(hero({ dexterity: 20, wisdom: 80 }), []);
  assert.ok(withWis.dodge_chance > noWis.dodge_chance, 'WIS вдига dodge при равен DEX');
  // Чист WIS билд (нисък DEX) все пак има dodge принос.
  const pureWis = deriveStats(hero({ dexterity: 0, wisdom: 100 }), []);
  assert.ok(pureWis.dodge_chance > 0, 'WIS сам по себе си дава dodge');
});

test('WIS дава защита (warding) — реален принос, не само екипировка', () => {
  const low = deriveStats(hero({ wisdom: 0 }), []);
  const high = deriveStats(hero({ wisdom: 100 }), []);
  assert.ok(high.defense > low.defense, 'повече WIS → повече защита');
  assert.equal(high.defense - low.defense, 50, '100 WIS → +50 warding (0.5/точка)');
});

test('DEX вече не е 4-в-1: dodge е споделен, но DEX пази crit/speed', () => {
  const a = deriveStats(hero({ dexterity: 50 }), []);
  const b = deriveStats(hero({ dexterity: 100 }), []);
  // DEX все още движи crit chance и speed (класова идентичност).
  assert.ok(b.crit_chance > a.crit_chance, 'DEX вдига crit chance');
  assert.ok(b.speed > a.speed, 'DEX вдига speed');
});
