import 'dotenv/config';
import { getDb } from '../db';
import { ITEM_SEED } from './items';
import { MONSTER_SEED } from './monsters';
import { QUEST_SEED } from './quests';

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

  console.log('Seed complete.');
}

seed();
