import 'dotenv/config';
import { getDb } from '../db';
import { ITEM_SEED } from './items';
import { MONSTER_SEED } from './monsters';
import { QUEST_SEED } from './quests';
import { DUMMY_SEED } from './dummies';

function seed(): void {
  const db = getDb();
  console.log('Seeding items...');
  const insertItem = db.prepare(`
    INSERT OR REPLACE INTO items (
      slug, name, category, sub_type, tier, rarity, level_req, class_req,
      atk_min, atk_max, defense, hp_bonus, mp_bonus,
      str_bonus, dex_bonus, con_bonus, int_bonus, cha_bonus, wis_bonus,
      heal_hp, heal_mp, buy_price, sell_price, icon, description
    ) VALUES (
      @slug, @name, @category, @sub_type, @tier, @rarity, @level_req, @class_req,
      @atk_min, @atk_max, @defense, @hp_bonus, @mp_bonus,
      @str_bonus, @dex_bonus, @con_bonus, @int_bonus, @cha_bonus, @wis_bonus,
      @heal_hp, @heal_mp, @buy_price, @sell_price, @icon, @description
    )
  `);
  const txItem = db.transaction((items: any[]) => {
    for (const it of items) {
      insertItem.run({
        heal_hp: 0,
        heal_mp: 0,
        ...it,
      });
    }
  });
  txItem(ITEM_SEED);
  console.log(`Inserted ${ITEM_SEED.length} items.`);

  console.log('Seeding monsters...');
  const insertMonster = db.prepare(`
    INSERT OR REPLACE INTO monsters (
      slug, name, level, hp, atk_min, atk_max, defense, speed, xp_reward, gold_min, gold_max, sprite, family, region
    ) VALUES (
      @slug, @name, @level, @hp, @atk_min, @atk_max, @defense, @speed, @xp_reward, @gold_min, @gold_max, @sprite, @family, @region
    )
  `);
  const txMonster = db.transaction((mons: any[]) => {
    for (const m of mons) insertMonster.run(m);
  });
  txMonster(MONSTER_SEED);
  console.log(`Inserted ${MONSTER_SEED.length} monsters.`);

  console.log('Seeding quests...');
  const insertQuest = db.prepare(`
    INSERT OR REPLACE INTO quests (
      slug, title, region, level_req, energy_cost, duration_sec, intro, narrative,
      monster_slug, xp_reward, gold_reward, item_reward, success_text, failure_text
    ) VALUES (
      @slug, @title, @region, @level_req, @energy_cost, @duration_sec, @intro, @narrative,
      @monster_slug, @xp_reward, @gold_reward, @item_reward, @success_text, @failure_text
    )
  `);
  const txQuest = db.transaction((qs: any[]) => {
    for (const q of qs) insertQuest.run(q);
  });
  txQuest(QUEST_SEED);
  console.log(`Inserted ${QUEST_SEED.length} quests.`);

  console.log('Seeding training dummies (NPC arena opponents)...');
  const slotForCategory: Record<string, string> = {
    weapon: 'weapon',
    shield: 'offhand',
    helm: 'helm',
    armor: 'armor',
    gloves: 'gloves',
    boots: 'boots',
    ring: 'ring',
    amulet: 'amulet',
  };
  const insertNpc = db.prepare(`
    INSERT OR IGNORE INTO characters (
      user_id, is_npc, name, class, gender, portrait, level, xp, gold, stat_points, skill_points,
      hp, hp_max, mp, mp_max,
      strength, dexterity, constitution, intelligence, charisma, wisdom,
      skill_sword, skill_axe, skill_bow, skill_staff, skill_magic, skill_stealth,
      energy, energy_max, energy_updated_at, arena_rating, wins, losses, created_at
    ) VALUES (
      NULL, 1, @name, @class, 'male', 'npc', @level, 0, 0, 0, 0,
      @hp_max, @hp_max, @mp_max, @mp_max,
      @strength, @dexterity, @constitution, @intelligence, @charisma, @wisdom,
      @skill_sword, @skill_axe, @skill_bow, @skill_staff, @skill_magic, @skill_stealth,
      100, 100, @now, @rating, 0, 0, @now
    )
  `);
  const findItem = db.prepare('SELECT id, category FROM items WHERE slug = ?');
  const findCharByName = db.prepare('SELECT id FROM characters WHERE name = ?');
  const insertEquip = db.prepare(
    "INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 1, ?)",
  );
  const clearEquip = db.prepare('DELETE FROM inventory WHERE character_id = ?');
  const now = Date.now();
  let npcCount = 0;
  const txDummies = db.transaction((dummies: any[]) => {
    for (const d of dummies) {
      const hp_max = 40 + d.constitution * 6 + d.level * 6;
      const mp_max = 10 + d.intelligence * 3 + d.wisdom * 2;
      insertNpc.run({
        name: d.name,
        class: d.class,
        level: d.level,
        hp_max,
        mp_max,
        strength: d.strength,
        dexterity: d.dexterity,
        constitution: d.constitution,
        intelligence: d.intelligence,
        charisma: d.charisma,
        wisdom: d.wisdom,
        skill_sword: d.skills.sword || 0,
        skill_axe: d.skills.axe || 0,
        skill_bow: d.skills.bow || 0,
        skill_staff: d.skills.staff || 0,
        skill_magic: d.skills.magic || 0,
        skill_stealth: d.skills.stealth || 0,
        now,
        rating: d.rating,
      });
      const row = findCharByName.get(d.name) as { id: number } | undefined;
      if (!row) continue;
      // Re-equip on every seed run (in case loadout changes between releases)
      clearEquip.run(row.id);
      for (const slug of d.equipment) {
        const it = findItem.get(slug) as { id: number; category: string } | undefined;
        if (!it) continue;
        const slot = slotForCategory[it.category];
        if (!slot) continue;
        insertEquip.run(row.id, it.id, slot);
      }
      npcCount++;
    }
  });
  txDummies(DUMMY_SEED);
  console.log(`Inserted/refreshed ${npcCount} training dummies.`);

  console.log('Seed complete.');
}

seed();
