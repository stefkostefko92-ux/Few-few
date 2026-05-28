import Database from 'better-sqlite3';

export function applySchema(db: Database.Database): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    INTEGER NOT NULL,
      last_seen_at  INTEGER NOT NULL,
      is_admin      INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS characters (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER UNIQUE,
      is_npc        INTEGER NOT NULL DEFAULT 0,
      name          TEXT NOT NULL UNIQUE,
      class         TEXT NOT NULL,           -- warrior | ranger | mage | rogue
      gender        TEXT NOT NULL DEFAULT 'male',
      portrait      TEXT NOT NULL DEFAULT 'default',
      level         INTEGER NOT NULL DEFAULT 1,
      xp            INTEGER NOT NULL DEFAULT 0,
      gold          INTEGER NOT NULL DEFAULT 50,
      stat_points   INTEGER NOT NULL DEFAULT 0,
      skill_points  INTEGER NOT NULL DEFAULT 0,
      hp            INTEGER NOT NULL DEFAULT 50,
      hp_max        INTEGER NOT NULL DEFAULT 50,
      mp            INTEGER NOT NULL DEFAULT 10,
      mp_max        INTEGER NOT NULL DEFAULT 10,
      strength      INTEGER NOT NULL DEFAULT 5,
      dexterity     INTEGER NOT NULL DEFAULT 5,
      constitution  INTEGER NOT NULL DEFAULT 5,
      intelligence  INTEGER NOT NULL DEFAULT 5,
      charisma      INTEGER NOT NULL DEFAULT 5,
      wisdom        INTEGER NOT NULL DEFAULT 5,
      skill_sword   INTEGER NOT NULL DEFAULT 0,
      skill_axe     INTEGER NOT NULL DEFAULT 0,
      skill_bow     INTEGER NOT NULL DEFAULT 0,
      skill_staff   INTEGER NOT NULL DEFAULT 0,
      skill_magic   INTEGER NOT NULL DEFAULT 0,
      skill_stealth INTEGER NOT NULL DEFAULT 0,
      energy        INTEGER NOT NULL DEFAULT 100,
      energy_max    INTEGER NOT NULL DEFAULT 100,
      energy_updated_at INTEGER NOT NULL,
      arena_rating  INTEGER NOT NULL DEFAULT 1000,
      wins          INTEGER NOT NULL DEFAULT 0,
      losses        INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS items (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      slug         TEXT NOT NULL UNIQUE,
      name         TEXT NOT NULL,
      category     TEXT NOT NULL,            -- weapon, armor, helm, gloves, boots, shield, ring, amulet, potion, misc
      sub_type     TEXT NOT NULL DEFAULT '', -- sword/axe/bow/staff for weapons
      tier         INTEGER NOT NULL DEFAULT 1,
      rarity       TEXT NOT NULL DEFAULT 'common', -- common, uncommon, rare, epic, legendary
      level_req    INTEGER NOT NULL DEFAULT 1,
      class_req    TEXT NOT NULL DEFAULT '',
      atk_min      INTEGER NOT NULL DEFAULT 0,
      atk_max      INTEGER NOT NULL DEFAULT 0,
      defense      INTEGER NOT NULL DEFAULT 0,
      hp_bonus     INTEGER NOT NULL DEFAULT 0,
      mp_bonus     INTEGER NOT NULL DEFAULT 0,
      str_bonus    INTEGER NOT NULL DEFAULT 0,
      dex_bonus    INTEGER NOT NULL DEFAULT 0,
      con_bonus    INTEGER NOT NULL DEFAULT 0,
      int_bonus    INTEGER NOT NULL DEFAULT 0,
      cha_bonus    INTEGER NOT NULL DEFAULT 0,
      wis_bonus    INTEGER NOT NULL DEFAULT 0,
      heal_hp      INTEGER NOT NULL DEFAULT 0,
      heal_mp      INTEGER NOT NULL DEFAULT 0,
      buy_price    INTEGER NOT NULL DEFAULT 0,
      sell_price   INTEGER NOT NULL DEFAULT 0,
      icon         TEXT NOT NULL DEFAULT 'sword',
      description  TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL,
      item_id      INTEGER NOT NULL,
      quantity     INTEGER NOT NULL DEFAULT 1,
      equipped     INTEGER NOT NULL DEFAULT 0,
      slot         TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id)
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_char ON inventory(character_id);

    CREATE TABLE IF NOT EXISTS monsters (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      slug         TEXT NOT NULL UNIQUE,
      name         TEXT NOT NULL,
      level        INTEGER NOT NULL DEFAULT 1,
      hp           INTEGER NOT NULL DEFAULT 20,
      atk_min      INTEGER NOT NULL DEFAULT 2,
      atk_max      INTEGER NOT NULL DEFAULT 5,
      defense      INTEGER NOT NULL DEFAULT 0,
      speed        INTEGER NOT NULL DEFAULT 5,
      xp_reward    INTEGER NOT NULL DEFAULT 5,
      gold_min     INTEGER NOT NULL DEFAULT 1,
      gold_max     INTEGER NOT NULL DEFAULT 3,
      sprite       TEXT NOT NULL DEFAULT 'goblin',
      family       TEXT NOT NULL DEFAULT 'beast',
      region       TEXT NOT NULL DEFAULT 'whispering_woods'
    );

    CREATE TABLE IF NOT EXISTS quests (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      slug         TEXT NOT NULL UNIQUE,
      title        TEXT NOT NULL,
      region       TEXT NOT NULL,
      level_req    INTEGER NOT NULL DEFAULT 1,
      energy_cost  INTEGER NOT NULL DEFAULT 5,
      duration_sec INTEGER NOT NULL DEFAULT 0,
      intro        TEXT NOT NULL,
      narrative    TEXT NOT NULL,
      monster_slug TEXT NOT NULL DEFAULT '',
      xp_reward    INTEGER NOT NULL DEFAULT 10,
      gold_reward  INTEGER NOT NULL DEFAULT 5,
      item_reward  TEXT NOT NULL DEFAULT '',
      success_text TEXT NOT NULL DEFAULT '',
      failure_text TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS quest_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL,
      quest_id     INTEGER NOT NULL,
      result       TEXT NOT NULL,
      completed_at INTEGER NOT NULL,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
      FOREIGN KEY (quest_id) REFERENCES quests(id)
    );

    CREATE INDEX IF NOT EXISTS idx_quest_log_char ON quest_log(character_id);

    CREATE TABLE IF NOT EXISTS combat_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL,
      opponent     TEXT NOT NULL,
      kind         TEXT NOT NULL,             -- 'pve' | 'pvp' | 'quest'
      result       TEXT NOT NULL,             -- 'win' | 'loss' | 'flee'
      rounds_json  TEXT NOT NULL,
      xp_gained    INTEGER NOT NULL DEFAULT 0,
      gold_gained  INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_combat_log_char ON combat_log(character_id);

    CREATE TABLE IF NOT EXISTS mail (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL,
      from_name    TEXT NOT NULL,
      subject      TEXT NOT NULL,
      body         TEXT NOT NULL,
      read_at      INTEGER,
      created_at   INTEGER NOT NULL,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );
  `);
}
