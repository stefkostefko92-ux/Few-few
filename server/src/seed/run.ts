import 'dotenv/config';
import { getDb } from '../db';
import { ITEM_SEED } from './items';
import { MONSTER_SEED } from './monsters';
import { QUEST_SEED } from './quests';
import { DUMMY_SEED } from './dummies';
import { generateExtendedDummies } from './dummies_extended';

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

  /* ===== Extended player pool — populates leaderboards & marketplace ===== */
  console.log('Seeding extended player pool...');
  const extended = generateExtendedDummies();
  const insertExt = db.prepare(`
    INSERT OR IGNORE INTO characters (
      user_id, is_npc, name, class, gender, portrait, level, xp, gold, stat_points, skill_points,
      hp, hp_max, mp, mp_max,
      strength, dexterity, constitution, intelligence, charisma, wisdom,
      skill_sword, skill_axe, skill_bow, skill_staff, skill_magic, skill_stealth,
      energy, energy_max, energy_updated_at, arena_rating, wins, losses, created_at, bio
    ) VALUES (
      NULL, 0, @name, @class, 'male', 'default', @level, 0, @gold, 0, 0,
      @hp_max, @hp_max, @mp_max, @mp_max,
      @strength, @dexterity, @constitution, @intelligence, @charisma, @wisdom,
      @skill_sword, @skill_axe, @skill_bow, @skill_staff, @skill_magic, @skill_stealth,
      100, 100, @now, @rating, @wins, @losses, @created_at, @bio
    )
  `);
  const findItemBySlug = db.prepare('SELECT id, category FROM items WHERE slug = ?');
  const insertEquip2 = db.prepare(
    "INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 1, ?)",
  );
  const insertExtraInv = db.prepare(
    "INSERT INTO inventory (character_id, item_id, quantity, equipped, slot, soul_bound, listed) VALUES (?, ?, 1, 0, '', 0, ?)",
  );
  const insertListing = db.prepare(
    `INSERT INTO marketplace_listings (inventory_id, item_id, seller_id, price_gold, status, listed_at) VALUES (?, ?, ?, ?, 'active', ?)`,
  );

  // Tier-aware kit picks. Original sets, no external reference.
  const KIT: Record<1 | 2 | 3, Record<string, string[]>> = {
    1: {
      warrior: ['iron_sword', 'leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots', 'wooden_shield'],
      ranger:  ['short_bow', 'leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots'],
      mage:    ['novice_staff', 'cloth_hood', 'cloth_robe', 'cloth_gloves', 'cloth_shoes'],
      rogue:   ['rusty_dagger', 'leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots'],
    },
    2: {
      warrior: ['steel_longsword', 'chain_helm', 'chain_armor', 'chain_gloves', 'chain_boots', 'kite_shield'],
      ranger:  ['elven_bow', 'leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots'],
      mage:    ['sapphire_staff', 'cloth_hood', 'cloth_robe', 'cloth_gloves', 'cloth_shoes'],
      rogue:   ['rusty_dagger', 'leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots'],
    },
    3: {
      warrior: ['flameblade', 'plate_helm', 'plate_armor', 'chain_gloves', 'chain_boots', 'kite_shield'],
      ranger:  ['shadowfang_bow', 'leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots'],
      mage:    ['archmage_staff', 'cloth_hood', 'mage_robe', 'cloth_gloves', 'cloth_shoes'],
      rogue:   ['flameblade', 'leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots'],
    },
  };
  const SLOTS: Record<string, string> = {
    weapon: 'weapon', shield: 'offhand', helm: 'helm', armor: 'armor',
    gloves: 'gloves', boots: 'boots', ring: 'ring', amulet: 'amulet',
  };

  // Items the extended players might list on the marketplace.
  const MARKET_POOL = [
    { slug: 'silver_ring', min: 80, max: 160 },
    { slug: 'amulet_of_warding', min: 280, max: 480 },
    { slug: 'chain_helm', min: 90, max: 160 },
    { slug: 'chain_armor', min: 160, max: 280 },
    { slug: 'kite_shield', min: 110, max: 220 },
    { slug: 'leather_helm', min: 20, max: 45 },
    { slug: 'short_bow', min: 30, max: 60 },
    { slug: 'sapphire_staff', min: 250, max: 420 },
    { slug: 'plate_helm', min: 420, max: 720 },
    { slug: 'minor_strength_elixir', min: 90, max: 140 },
    { slug: 'minor_dexterity_elixir', min: 90, max: 140 },
  ];

  let extCount = 0;
  let marketCount = 0;
  const txExt = db.transaction(() => {
    for (const e of extended) {
      const con = 4 + Math.floor(e.level * 0.4) + Math.floor(Math.random() * 4);
      const str = e.class === 'warrior' ? 6 + Math.floor(e.level * 0.5) : 4 + Math.floor(e.level * 0.25);
      const dex = e.class === 'ranger' || e.class === 'rogue' ? 6 + Math.floor(e.level * 0.5) : 4 + Math.floor(e.level * 0.25);
      const int_ = e.class === 'mage' ? 6 + Math.floor(e.level * 0.5) : 3 + Math.floor(e.level * 0.2);
      const wis = e.class === 'mage' ? 5 + Math.floor(e.level * 0.35) : 4 + Math.floor(e.level * 0.2);
      const cha = 4 + Math.floor(e.level * 0.15);
      const hp_max = 40 + con * 6 + e.level * 6;
      const mp_max = 10 + int_ * 3 + wis * 2;
      const battles = 3 + Math.floor(Math.random() * (e.level * 4));
      const wins = Math.floor(battles * (0.45 + Math.random() * 0.3));
      const losses = Math.max(0, battles - wins);
      const created_at = Date.now() - e.joined_days_ago * 86_400_000;
      insertExt.run({
        name: e.name, class: e.class, level: e.level,
        gold: 50 + Math.floor(e.level * 20 * Math.random()),
        hp_max, mp_max,
        strength: str, dexterity: dex, constitution: con, intelligence: int_, charisma: cha, wisdom: wis,
        skill_sword: e.class === 'warrior' ? Math.floor(e.level * 0.6) : 0,
        skill_axe: 0,
        skill_bow: e.class === 'ranger' ? Math.floor(e.level * 0.6) : 0,
        skill_staff: e.class === 'mage' ? Math.floor(e.level * 0.5) : 0,
        skill_magic: e.class === 'mage' ? Math.floor(e.level * 0.6) : 0,
        skill_stealth: e.class === 'rogue' ? Math.floor(e.level * 0.55) : 0,
        rating: e.rating, wins, losses, now: Date.now(), created_at,
        bio: e.bio,
      });
      const row = db.prepare('SELECT id FROM characters WHERE name = ?').get(e.name) as { id: number } | undefined;
      if (!row) continue;
      const kit = KIT[e.gear_tier][e.class] || [];
      for (const slug of kit) {
        const it = findItemBySlug.get(slug) as { id: number; category: string } | undefined;
        if (!it) continue;
        insertEquip2.run(row.id, it.id, SLOTS[it.category] || 'weapon');
      }
      // ~35% of extended players list 1-2 items on the marketplace
      if (Math.random() < 0.35) {
        const listings = 1 + (Math.random() < 0.4 ? 1 : 0);
        for (let i = 0; i < listings; i++) {
          const pick = MARKET_POOL[Math.floor(Math.random() * MARKET_POOL.length)];
          const it = findItemBySlug.get(pick.slug) as { id: number; category: string } | undefined;
          if (!it) continue;
          const invInfo = insertExtraInv.run(row.id, it.id, 1);
          const invId = invInfo.lastInsertRowid as number;
          const price = Math.floor(pick.min + Math.random() * (pick.max - pick.min));
          insertListing.run(invId, it.id, row.id, price, Date.now() - Math.floor(Math.random() * 7 * 86_400_000));
          db.prepare('UPDATE inventory SET listed = 1 WHERE id = ?').run(invId);
          marketCount++;
        }
      }
      extCount++;
    }
  });
  txExt();
  console.log(`Inserted/refreshed ${extCount} extended players, ${marketCount} marketplace listings.`);

  console.log('Seed complete.');
}

seed();
