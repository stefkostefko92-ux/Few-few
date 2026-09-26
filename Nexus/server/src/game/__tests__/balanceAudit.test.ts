// Регресионни тестове от баланс одита (Фаза 2). Балансът се МЕРИ с
// детерминистичния харнес (balanceHarness.ts, seeded RNG) — инвариантите тук
// падат, ако някоя от поправените дупки/дисбаланси се върне.
process.env.DB_PATH = ':memory:';

import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDb } from '../../db';
import { simulateCombat } from '../combat';
import { deriveStats } from '../stats';
import { paceXpForKill } from '../progression';
import { grantUniqueItem } from '../drops';
import { ITEM_SEED } from '../../seed/items';
import { QUEST_SEED } from '../../seed/quests';
import { DUNGEONS, DUNGEON_XP_PACE_KILLS } from '../../seed/dungeons';
import { MONSTER_SEED } from '../../seed/monsters';
import { DEAL_DISCOUNT } from '../dailyDeals';
import {
  questBaseXp, questLossPenalty, mythicPlusReward, arenaInBracket, QUEST_XP_PACE_CAP,
} from '../rewardFormulas';
import { huntEncounterPools, pickHuntMonster, APEX_ENCOUNTER_CHANCE, isApexSlug } from '../regions';
import * as H from './balanceHarness';
import type { Character } from '../../types/domain';

/* ───────────── харнес: детерминизъм ───────────── */

test('харнес: един и същ seed → идентичен бой (повторяемо измерване)', () => {
  const a = H.refHero('warrior', 50); const b = H.refHero('mage', 50);
  const r1 = H.withSeed(42, () => simulateCombat({ ...a }, { ...b, side: 'foe' }));
  const r2 = H.withSeed(42, () => simulateCombat({ ...a }, { ...b, side: 'foe' }));
  assert.deepStrictEqual(r1.rounds.map((x) => x.damage), r2.rounds.map((x) => x.damage));
  assert.equal(r1.winner, r2.winner);
});

/* ───────────── класов паритет ───────────── */

test('клас срещу клас: никой клас над 60% срещу друг при равно злато/екипировка (lv 50–500)', () => {
  // Преди одита: mage губеше 80–100% на всяко ниво (INT не даваше crit/dodge,
  // staff/magic умението не даваше crit); warrior 2–25% срещу DEX класовете.
  for (const L of [50, 100, 200, 300, 500]) {
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const w = H.duel(H.CLASSES[i], H.CLASSES[j], L, 200, 17);
      assert.ok(w >= 0.4 && w <= 0.6, `lv${L} ${H.CLASSES[i]} vs ${H.CLASSES[j]}: ${(w * 100).toFixed(0)}%`);
    }
  }
});

function hero(over: Partial<Character>): Character {
  return {
    id: 1, user_id: 1, is_npc: 1, name: 'T', class: 'warrior', gender: 'male', portrait: 'x',
    level: 50, xp: 0, gold: 0, stat_points: 0, skill_points: 0, hp: 1, hp_max: 1, mp: 1, mp_max: 1,
    strength: 10, dexterity: 10, constitution: 10, intelligence: 10, charisma: 10, wisdom: 0,
    skill_sword: 0, skill_axe: 0, skill_bow: 0, skill_staff: 0, skill_magic: 0, skill_stealth: 0,
    energy: 0, energy_max: 0, energy_updated_at: 0, arena_rating: 1000, wins: 0, losses: 0, created_at: 0,
    ...over,
  } as Character;
}

test('основният стат на класа дава същия crit/dodge пакет като DEX (agility = max)', () => {
  const war = deriveStats(hero({ class: 'warrior', strength: 100, dexterity: 10 }), []);
  const rng = deriveStats(hero({ class: 'ranger', strength: 10, dexterity: 100 }), []);
  const mag = deriveStats(hero({ class: 'mage', intelligence: 100, dexterity: 10 }), []);
  assert.equal(war.crit_chance, rng.crit_chance, 'warrior STR 100 ≡ ranger DEX 100 за crit');
  assert.equal(war.dodge_chance, rng.dodge_chance, '…и за dodge');
  assert.equal(mag.crit_chance, rng.crit_chance, 'mage INT 100 ≡ DEX 100');
  // STR не помага на не-warrior (няма „безплатен" пакет за чужд стат).
  const rogueStr = deriveStats(hero({ class: 'rogue', strength: 100, dexterity: 10 }), []);
  assert.ok(rogueStr.crit_chance < rng.crit_chance);
  // Speed (инициатива) остава чисто DEX.
  assert.ok(rng.speed > war.speed);
});

test('mage: staff/magic умението дава crit като sword/bow (преди — нищо)', () => {
  const a = deriveStats(hero({ class: 'mage', skill_magic: 0 }), []);
  const b = deriveStats(hero({ class: 'mage', skill_magic: 50 }), []);
  assert.ok(Math.abs((b.crit_chance - a.crit_chance) - 0.15) < 1e-9, '50 × 0.003');
});

/* ───────────── региони / криви ───────────── */

test('вход в регион: печеливш навсякъде, а endgame регионите НЕ стават все по-лесни', () => {
  const rows = H.regionEntry(50);
  for (const r of rows.filter((x) => x.gate >= 26)) {
    assert.ok(r.win >= 0.6, `${r.region} (lv ${r.gate}) победа ${(r.win * 100).toFixed(0)}% < 60%`);
  }
  // Преди: остатъчното HP при вход растеше 35% (lv 261) → 75% (lv 471) —
  // всеки следващ endgame регион беше по-лесен. Сега кривата е плоска.
  const at = (g: number) => rows.find((r) => r.gate === g)!.hpLeft;
  const endgame = rows.filter((r) => r.gate >= 291);
  assert.ok(Math.max(...endgame.map((r) => r.hpLeft)) <= 0.6, 'нито един endgame вход не е „разходка"');
  assert.ok(at(471) - at(261) <= 0.15, `lv471 vs lv261 HP остатък: ${at(471).toFixed(2)} vs ${at(261).toFixed(2)}`);
});

test('ловът: APEX не доминира пула на върха на региона (стената lv 102–104)', () => {
  const conclave = (MONSTER_SEED as any[]).filter((m) => m.region === 'conclave_aedric');
  for (const L of [100, 102, 103, 104]) {
    const pools = huntEncounterPools(conclave, L);
    assert.ok(pools.regular.length > 0, `lv${L}: има обикновен пул`);
    assert.ok(pools.regular.every((m) => !isApexSlug(m.slug)));
  }
  // Честота на APEX в ±3: ~APEX_ENCOUNTER_CHANCE, не 33–100%.
  const pools = huntEncounterPools(conclave, 103);
  assert.equal(pools.apex.length, 1);
  const rng = H.mulberry32(9);
  let apex = 0; const N = 20_000;
  for (let i = 0; i < N; i++) if (isApexSlug(pickHuntMonster(pools, rng)!.slug)) apex++;
  assert.ok(Math.abs(apex / N - APEX_ENCOUNTER_CHANCE) < 0.02, `APEX дял ${(apex / N).toFixed(3)}`);
});

test('екипировка: generic tier сетовете са монотонни по ниво (elite L60 беше по-слаб от warlord L45)', () => {
  const tiers = ['veteran', 'champion', 'warlord', 'elite', 'adept', 'mythic', 'ascendant', 'cosmic', 'eldritch', 'divine', 'veilforged', 'primordial'];
  for (const piece of ['sword', 'armor', 'helm', 'ring']) {
    const chain = tiers
      .map((t) => (ITEM_SEED as any[]).find((i) => i.slug.startsWith(`${t}_${piece}_`)))
      .filter(Boolean)
      .sort((a, b) => a.level_req - b.level_req);
    for (let k = 1; k < chain.length; k++) {
      const a = chain[k - 1]; const b = chain[k];
      for (const f of ['hp_bonus', 'defense', 'atk_max']) {
        assert.ok(b[f] >= a[f], `${b.slug}.${f} (${b[f]}) < ${a.slug}.${f} (${a[f]})`);
      }
    }
  }
});

/* ───────────── икономика: писти ───────────── */

test('писти: нито една дейност не е > 2× следващата по XP/час; M+ и куестът не печатат спрямо лова', () => {
  // Преди: lv 50 куест (shadowfell) 29k XP/ч и M+ 24k срещу лов 2.5k (×12);
  // lv 300 M+ 162k XP/ч (×15 лова).
  for (const L of [50, 100, 200, 300]) {
    const e = H.economyAt(L);
    const hunt = e.find((x) => x.lane === 'hunt')!;
    const xs = e.map((x) => x.xpHr).sort((a, b) => b - a);
    assert.ok(xs[0] / xs[1] <= 2, `lv${L}: макс/2-ри XP ${(xs[0] / xs[1]).toFixed(2)}×`);
    for (const lane of e) {
      assert.ok(lane.xpHr <= 3 * hunt.xpHr, `lv${L} ${lane.lane} XP/ч ${lane.xpHr.toFixed(0)} > 3× лов ${hunt.xpHr.toFixed(0)}`);
      assert.ok(lane.goldHr <= 3 * hunt.goldHr, `lv${L} ${lane.lane} злато/ч ${lane.goldHr.toFixed(0)} > 3× лов ${hunt.goldHr.toFixed(0)}`);
    }
  }
});

test('Mythic+: пълният бонус е само за ПЪРВО изчистване на tier (anti-bypass на 24ч lock)', () => {
  const monBy = new Map((MONSTER_SEED as any[]).map((m) => [m.slug, m]));
  for (const d of DUNGEONS) {
    const stages = d.stages.map((s) => monBy.get(s.monster_slug));
    const first = mythicPlusReward(d, stages, 1, 0);
    const again = mythicPlusReward(d, stages, 1, 1);
    assert.equal(first.firstClear, true);
    assert.equal(again.firstClear, false);
    assert.equal(first.xp, Math.round(d.xp_bonus * 1.12));
    assert.ok(again.xp < first.xp, `${d.slug}: повторението (${again.xp}) < първото (${first.xp})`);
    // Повторението = купчината на етапите (≤ 1.8× pace на етап), не дневният бонус.
    const cap = stages.reduce((s, m) => s + Math.round(paceXpForKill(m.level) * 1.8), 0) * 1.12;
    assert.ok(again.xp <= Math.ceil(cap), `${d.slug}: ${again.xp} ≤ ${cap}`);
  }
});

test('подземия: дневният XP бонус е закотвен в темпото (не расте по-бързо от нивото)', () => {
  const band = DUNGEONS.filter((d) => d.slug.endsWith('_descent') && d.level_req >= 26);
  const monBy = new Map((MONSTER_SEED as any[]).map((m) => [m.slug, m]));
  for (const d of band) {
    const mid = monBy.get(d.stages[1].monster_slug).level;
    const levels = d.xp_bonus / (paceXpForKill(mid) * 8);
    assert.ok(Math.abs(levels - DUNGEON_XP_PACE_KILLS / 8) < 0.01, `${d.slug}: ${levels.toFixed(2)} нива`);
  }
});

/* ───────────── куестове ───────────── */

test('куест: дизайнерската XP е ≤ 3× pace на входното ниво (shadowfell беше 30×)', () => {
  for (const q of QUEST_SEED as any[]) {
    assert.ok(questBaseXp(q) <= Math.round(paceXpForKill(q.level_req) * QUEST_XP_PACE_CAP), q.slug);
  }
  const sl = (QUEST_SEED as any[]).find((q) => q.slug === 'shadowfell_shadowlord');
  assert.ok(questBaseXp(sl) < sl.xp_reward / 5, `shadowfell: ${questBaseXp(sl)} (seed ${sl.xp_reward})`);
  // Expansion куестовете (≤ 3× pace) остават непроменени.
  const exp = (QUEST_SEED as any[]).find((q) => q.slug === 'stormpeaks_drake_roost');
  assert.equal(questBaseXp(exp), exp.xp_reward);
});

test('куест: загубата взима ≤ 10% злато и никога повече от наградата на куеста', () => {
  const q = { level_req: 24, xp_reward: 3000, gold_reward: 1500 };
  assert.equal(questLossPenalty(10_000_000, q), 1500, 'endgame богаташ: губи залога, не 1M');
  assert.equal(questLossPenalty(5000, q), 500, 'бедняк: 10%');
  assert.equal(questLossPenalty(0, q), 0);
});

test('уникална награда (куест item_reward / APEX): дава се веднъж, в каквото и състояние да е копието', () => {
  const db = getDb();
  db.prepare(
    `INSERT INTO items (slug, name, category, sub_type, tier, rarity, level_req, class_req, atk_min, atk_max, defense,
       hp_bonus, mp_bonus, str_bonus, dex_bonus, con_bonus, int_bonus, cha_bonus, wis_bonus, heal_hp, heal_mp,
       buy_price, sell_price, icon, description)
     VALUES ('audit_relic', 'Relic', 'weapon', 'sword', 5, 'legendary', 1, '', 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5000, '', '')`,
  ).run();
  const cid = db.prepare(`INSERT INTO characters (name, class, energy_updated_at, created_at) VALUES ('audit_q', 'warrior', 0, 0)`)
    .run().lastInsertRowid as number;
  assert.equal(grantUniqueItem(db, cid, 'audit_relic'), true, 'първият път — дава');
  assert.equal(grantUniqueItem(db, cid, 'audit_relic'), false, 'повторение на куеста — не дава');
  // Обявено на пазара копие също се брои (APEX проверката го пропускаше).
  db.prepare('UPDATE inventory SET listed = 1 WHERE character_id = ?').run(cid);
  assert.equal(grantUniqueItem(db, cid, 'audit_relic'), false, 'обявеното копие се брои');
  const n = (db.prepare('SELECT COUNT(*) AS c FROM inventory WHERE character_id = ?').get(cid) as { c: number }).c;
  assert.equal(n, 1);
});

/* ───────────── арена / лов / магазин ───────────── */

test('арена: ±3 скобата важи за ВСИЧКИ противници (вкл. NPC кукли)', () => {
  assert.equal(arenaInBracket(300, 2), false, 'lv 300 срещу lv 2 кукла — забранено');
  assert.equal(arenaInBracket(20, 23), true);
  assert.equal(arenaInBracket(20, 24), false);
  const src = readFileSync(join(__dirname, '../../routes/arena.ts'), 'utf8');
  assert.ok(!/is_npc\s*===\s*0\s*&&/.test(src), 'арената не бива да изключва NPC от скобата');
});

test('лов: седмичното убийство се брои веднъж (само през applyCombatEvent)', () => {
  const src = readFileSync(join(__dirname, '../../routes/hunting.ts'), 'utf8');
  assert.ok(!/trackWeeklyKill\s*\(/.test(src), 'hunting.ts вика trackWeeklyKill — двойно броене');
  const events = readFileSync(join(__dirname, '../events.ts'), 'utf8');
  assert.ok(/trackWeeklyKill\s*\(/.test(events), 'events.ts остава единственият източник');
});

test('магазин: купи→продай никога не е на печалба (вкл. дневната −30% оферта)', () => {
  for (const it of ITEM_SEED as any[]) {
    if (!(it.buy_price > 0)) continue;
    const dealPrice = Math.max(1, Math.floor(it.buy_price * (1 - DEAL_DISCOUNT)));
    assert.ok(it.sell_price < dealPrice, `${it.slug}: sell ${it.sell_price} ≥ оферта ${dealPrice}`);
  }
});
