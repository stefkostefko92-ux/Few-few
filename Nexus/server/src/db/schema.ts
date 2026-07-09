import Database from 'better-sqlite3';

export function applySchema(db: Database.Database): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    -- Изчакай до 5s при заключена база (напр. по време на .backup), вместо
    -- незабавен SQLITE_BUSY към играча.
    PRAGMA busy_timeout = 5000;

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
    CREATE INDEX IF NOT EXISTS idx_mail_char ON mail(character_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS achievements (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id  INTEGER NOT NULL,
      slug          TEXT NOT NULL,
      unlocked_at   INTEGER NOT NULL,
      UNIQUE(character_id, slug),
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ach_char ON achievements(character_id);

    CREATE TABLE IF NOT EXISTS bestiary (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id    INTEGER NOT NULL,
      monster_slug    TEXT NOT NULL,
      kills           INTEGER NOT NULL DEFAULT 0,
      first_killed_at INTEGER NOT NULL,
      last_killed_at  INTEGER NOT NULL,
      UNIQUE(character_id, monster_slug),
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_bestiary_char ON bestiary(character_id);

    CREATE TABLE IF NOT EXISTS daily_state (
      character_id    INTEGER PRIMARY KEY,
      streak          INTEGER NOT NULL DEFAULT 0,
      longest_streak  INTEGER NOT NULL DEFAULT 0,
      last_claim_day  INTEGER NOT NULL DEFAULT 0,
      last_spin_day   INTEGER NOT NULL DEFAULT 0,
      quests_json     TEXT NOT NULL DEFAULT '[]',
      completed_json  TEXT NOT NULL DEFAULT '[]',
      quests_day      INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dungeon_run (
      character_id    INTEGER PRIMARY KEY,
      slug            TEXT NOT NULL,
      stage           INTEGER NOT NULL DEFAULT 0,
      hp              INTEGER NOT NULL DEFAULT 0,
      hp_max          INTEGER NOT NULL DEFAULT 0,
      gold_pile       INTEGER NOT NULL DEFAULT 0,
      xp_pile         INTEGER NOT NULL DEFAULT 0,
      items_json      TEXT NOT NULL DEFAULT '[]',
      started_at      INTEGER NOT NULL,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS title_state (
      character_id    INTEGER PRIMARY KEY,
      current_title   TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );
  `);

  // GDPR Art. 8 — age-gate columns on users. date_of_birth is collected
  // once at registration and never displayed back; country picks the
  // member-state digital-consent threshold (BG/IT 14, FR 15, DE/AT/IE
  // /others 16). Stored on the user row so future Stripe/OSS jobs can
  // cross-check the buyer's billing country.
  const usrCols = db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[];
  const usrHave = new Set(usrCols.map((c) => c.name));
  if (!usrHave.has('date_of_birth')) db.exec(`ALTER TABLE users ADD COLUMN date_of_birth TEXT`);
  if (!usrHave.has('country')) db.exec(`ALTER TABLE users ADD COLUMN country TEXT`);

  // Idempotent lifetime-stat column additions.
  const cols = db.prepare(`PRAGMA table_info(characters)`).all() as { name: string }[];
  const have = new Set(cols.map((c) => c.name));
  const addColumn = (def: string) => {
    const name = def.split(/\s+/)[0];
    if (!have.has(name)) db.exec(`ALTER TABLE characters ADD COLUMN ${def}`);
  };
  addColumn('battles_won INTEGER NOT NULL DEFAULT 0');
  addColumn('battles_lost INTEGER NOT NULL DEFAULT 0');
  addColumn('monsters_slain INTEGER NOT NULL DEFAULT 0');
  addColumn('total_xp_earned INTEGER NOT NULL DEFAULT 0');
  addColumn('total_gold_earned INTEGER NOT NULL DEFAULT 0');
  addColumn('dungeons_cleared INTEGER NOT NULL DEFAULT 0');
  addColumn('current_title TEXT NOT NULL DEFAULT \'\'');
  addColumn('gems INTEGER NOT NULL DEFAULT 0');

  // ===== User IP tracking + tunable settings =====
  const userCols2 = db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[];
  const userHave = new Set(userCols2.map((c) => c.name));
  if (!userHave.has('last_ip')) db.exec(`ALTER TABLE users ADD COLUMN last_ip TEXT NOT NULL DEFAULT ''`);
  if (!userHave.has('last_country')) db.exec(`ALTER TABLE users ADD COLUMN last_country TEXT NOT NULL DEFAULT ''`);
  if (!userHave.has('last_user_agent')) db.exec(`ALTER TABLE users ADD COLUMN last_user_agent TEXT NOT NULL DEFAULT ''`);
  // token_version drives JWT invalidation: bump on password change /
  // reset and existing JWTs immediately fail authRequired (audit #6).
  if (!userHave.has('token_version')) db.exec(`ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  INTEGER NOT NULL,
      updated_by  INTEGER
    );
  `);
  addColumn('total_gems_earned INTEGER NOT NULL DEFAULT 0');
  addColumn('total_gems_spent INTEGER NOT NULL DEFAULT 0');
  addColumn("stat_upgrades TEXT NOT NULL DEFAULT '{}'");
  addColumn("avatar TEXT NOT NULL DEFAULT 'warrior_01'");
  addColumn("frame_slug TEXT NOT NULL DEFAULT 'plain'");
  addColumn("bio TEXT NOT NULL DEFAULT ''");
  addColumn("last_rename_at INTEGER NOT NULL DEFAULT 0");
  addColumn("cosmetic_unlocks TEXT NOT NULL DEFAULT '[]'");

  // Item set affiliation column (for set-bonus computation)
  const itemCols = db.prepare(`PRAGMA table_info(items)`).all() as { name: string }[];
  const itemHave = new Set(itemCols.map((c) => c.name));
  if (!itemHave.has('set_slug')) db.exec(`ALTER TABLE items ADD COLUMN set_slug TEXT NOT NULL DEFAULT ''`);
  // Damage-type axes — mounts and relic gear add Physical / Magical
  // Damage and Defense directly. Defaults to 0 so existing rows are
  // untouched.
  if (!itemHave.has('phys_dmg_bonus')) db.exec(`ALTER TABLE items ADD COLUMN phys_dmg_bonus INTEGER NOT NULL DEFAULT 0`);
  if (!itemHave.has('phys_def_bonus')) db.exec(`ALTER TABLE items ADD COLUMN phys_def_bonus INTEGER NOT NULL DEFAULT 0`);
  if (!itemHave.has('mag_dmg_bonus'))  db.exec(`ALTER TABLE items ADD COLUMN mag_dmg_bonus INTEGER NOT NULL DEFAULT 0`);
  if (!itemHave.has('mag_def_bonus'))  db.exec(`ALTER TABLE items ADD COLUMN mag_def_bonus INTEGER NOT NULL DEFAULT 0`);
  // Pure mechanical mount property — explicitly not a "bonus" so it
  // lives on a dedicated column instead of repurposing a stat slot.
  if (!itemHave.has('cooldown_reduction_pct')) db.exec(`ALTER TABLE items ADD COLUMN cooldown_reduction_pct INTEGER NOT NULL DEFAULT 0`);

  // ===== Guild system =====
  db.exec(`
    CREATE TABLE IF NOT EXISTS guilds (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL UNIQUE,
      tag           TEXT NOT NULL UNIQUE,
      motto         TEXT NOT NULL DEFAULT '',
      description   TEXT NOT NULL DEFAULT '',
      level         INTEGER NOT NULL DEFAULT 1,
      xp            INTEGER NOT NULL DEFAULT 0,
      member_slots  INTEGER NOT NULL DEFAULT 10,
      gold          INTEGER NOT NULL DEFAULT 0,
      crest_color   TEXT NOT NULL DEFAULT '#d6a13d',
      leader_id     INTEGER NOT NULL,
      created_at    INTEGER NOT NULL,
      FOREIGN KEY (leader_id) REFERENCES characters(id)
    );

    CREATE TABLE IF NOT EXISTS guild_members (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id      INTEGER NOT NULL,
      character_id  INTEGER NOT NULL UNIQUE,
      role          TEXT NOT NULL DEFAULT 'member',
      contribution  INTEGER NOT NULL DEFAULT 0,
      joined_at     INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_guild_members_guild ON guild_members(guild_id);

    CREATE TABLE IF NOT EXISTS guild_invitations (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id      INTEGER NOT NULL,
      character_id  INTEGER NOT NULL,
      invited_by    INTEGER NOT NULL,
      created_at    INTEGER NOT NULL,
      UNIQUE(guild_id, character_id),
      FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS guild_chat (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id      INTEGER NOT NULL,
      character_id  INTEGER NOT NULL,
      message       TEXT NOT NULL,
      created_at    INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_guild_chat_guild ON guild_chat(guild_id);

    CREATE TABLE IF NOT EXISTS guild_wars (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      attacker_guild_id   INTEGER NOT NULL,
      defender_guild_id   INTEGER NOT NULL,
      status              TEXT NOT NULL DEFAULT 'active',
      attacker_score      INTEGER NOT NULL DEFAULT 0,
      defender_score      INTEGER NOT NULL DEFAULT 0,
      started_at          INTEGER NOT NULL,
      ends_at             INTEGER NOT NULL,
      winner_guild_id     INTEGER,
      FOREIGN KEY (attacker_guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
      FOREIGN KEY (defender_guild_id) REFERENCES guilds(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS guild_war_battles (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      war_id              INTEGER NOT NULL,
      attacker_char_id    INTEGER NOT NULL,
      defender_char_id    INTEGER NOT NULL,
      winner_side         TEXT NOT NULL,
      rounds_json         TEXT NOT NULL,
      created_at          INTEGER NOT NULL,
      FOREIGN KEY (war_id) REFERENCES guild_wars(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS guild_dungeon_run (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id        INTEGER NOT NULL UNIQUE,
      slug            TEXT NOT NULL,
      boss_hp         INTEGER NOT NULL,
      boss_hp_max     INTEGER NOT NULL,
      contributions_json TEXT NOT NULL DEFAULT '[]',
      started_at      INTEGER NOT NULL,
      ends_at         INTEGER NOT NULL,
      cleared_at      INTEGER,
      FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_war_attacker ON guild_wars(attacker_guild_id);
    CREATE INDEX IF NOT EXISTS idx_war_defender ON guild_wars(defender_guild_id);

    CREATE TABLE IF NOT EXISTS purchases (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id          INTEGER NOT NULL,
      kind                  TEXT NOT NULL,
      amount_cents          INTEGER NOT NULL,
      currency              TEXT NOT NULL DEFAULT 'usd',
      gems_granted          INTEGER NOT NULL DEFAULT 0,
      effect_payload        TEXT NOT NULL DEFAULT '{}',
      status                TEXT NOT NULL DEFAULT 'pending',
      stripe_session_id     TEXT,
      stripe_payment_intent TEXT,
      mode                  TEXT NOT NULL DEFAULT 'stripe',
      created_at            INTEGER NOT NULL,
      completed_at          INTEGER,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_purchases_char ON purchases(character_id);
    CREATE INDEX IF NOT EXISTS idx_purchases_session ON purchases(stripe_session_id);

    CREATE TABLE IF NOT EXISTS event_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      ts            INTEGER NOT NULL,
      category      TEXT NOT NULL,
      action        TEXT NOT NULL,
      level         TEXT NOT NULL DEFAULT 'info',
      user_id       INTEGER,
      character_id  INTEGER,
      target_id     INTEGER,
      target_type   TEXT,
      ip            TEXT NOT NULL DEFAULT '',
      country       TEXT NOT NULL DEFAULT '',
      route         TEXT NOT NULL DEFAULT '',
      message       TEXT NOT NULL DEFAULT '',
      meta_json     TEXT NOT NULL DEFAULT '{}',
      webhook_sent  INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_log_ts        ON event_log(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_log_category  ON event_log(category, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_log_user      ON event_log(user_id, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_log_character ON event_log(character_id, ts DESC);

    CREATE TABLE IF NOT EXISTS webhook_endpoints (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      url           TEXT NOT NULL,
      secret        TEXT NOT NULL DEFAULT '',
      category_filter TEXT NOT NULL DEFAULT '*',
      enabled       INTEGER NOT NULL DEFAULT 1,
      created_at    INTEGER NOT NULL,
      last_called_at INTEGER,
      last_status   INTEGER,
      failures      INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS character_task (
      character_id  INTEGER PRIMARY KEY,
      slug          TEXT NOT NULL,
      started_at    INTEGER NOT NULL,
      ends_at       INTEGER NOT NULL,
      duration_hr   INTEGER NOT NULL,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS marketplace_listings (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_id    INTEGER NOT NULL,
      item_id         INTEGER NOT NULL,
      seller_id       INTEGER NOT NULL,
      buyer_id        INTEGER,
      price_gold      INTEGER NOT NULL,
      status          TEXT NOT NULL DEFAULT 'active',
      listed_at       INTEGER NOT NULL,
      sold_at         INTEGER,
      FOREIGN KEY (seller_id) REFERENCES characters(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id)
    );
    CREATE INDEX IF NOT EXISTS idx_market_active ON marketplace_listings(status, listed_at);
    CREATE INDEX IF NOT EXISTS idx_market_seller ON marketplace_listings(seller_id);
  `);

  // Inventory soul-bound + listed flags
  const invCols = db.prepare(`PRAGMA table_info(inventory)`).all() as { name: string }[];
  const invHave = new Set(invCols.map((c) => c.name));
  if (!invHave.has('soul_bound')) db.exec(`ALTER TABLE inventory ADD COLUMN soul_bound INTEGER NOT NULL DEFAULT 0`);
  if (!invHave.has('listed')) db.exec(`ALTER TABLE inventory ADD COLUMN listed INTEGER NOT NULL DEFAULT 0`);
  if (!invHave.has('vaulted_guild_id')) db.exec(`ALTER TABLE inventory ADD COLUMN vaulted_guild_id INTEGER NOT NULL DEFAULT 0`);

  // Dir. 2011/83/EU Art. 16(m) consent capture on the purchase row. The
  // server replays consent_text in a chargeback dispute; consent_at is
  // the timestamp at which the buyer accepted the digital-content waiver.
  const purchCols = db.prepare(`PRAGMA table_info(purchases)`).all() as { name: string }[];
  const purchHave = new Set(purchCols.map((c) => c.name));
  if (!purchHave.has('consent_text')) db.exec(`ALTER TABLE purchases ADD COLUMN consent_text TEXT`);
  if (!purchHave.has('consent_at')) db.exec(`ALTER TABLE purchases ADD COLUMN consent_at INTEGER`);
  // EU VAT / OSS bookkeeping — Stripe Tax computes the destination rate
  // at the moment of checkout. Store both the rate and the country so we
  // can file the OSS report without re-querying every Stripe session.
  if (!purchHave.has('tax_country')) db.exec(`ALTER TABLE purchases ADD COLUMN tax_country TEXT`);
  if (!purchHave.has('tax_amount_cents')) db.exec(`ALTER TABLE purchases ADD COLUMN tax_amount_cents INTEGER`);

  // Active alchemy buffs (JSON array of { stat, percent, expires_at })
  const charCols = db.prepare(`PRAGMA table_info(characters)`).all() as { name: string }[];
  const charHave = new Set(charCols.map((c) => c.name));
  if (!charHave.has('active_buffs')) db.exec(`ALTER TABLE characters ADD COLUMN active_buffs TEXT NOT NULL DEFAULT '[]'`);
  if (!charHave.has('tower_best_floor')) db.exec(`ALTER TABLE characters ADD COLUMN tower_best_floor INTEGER NOT NULL DEFAULT 0`);
  if (!charHave.has('tower_current_floor')) db.exec(`ALTER TABLE characters ADD COLUMN tower_current_floor INTEGER NOT NULL DEFAULT 0`);
  if (!charHave.has('tower_run_seed')) db.exec(`ALTER TABLE characters ADD COLUMN tower_run_seed INTEGER NOT NULL DEFAULT 0`);

  // Forge enchant ledger — per inventory item, the count of successful enchants
  // and the JSON stat bonuses they granted (so we can show them in tooltips and
  // include them in derived stats).
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_enchants (
      inventory_id  INTEGER PRIMARY KEY,
      enchant_count INTEGER NOT NULL DEFAULT 0,
      bonuses_json  TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
    );
  `);

  // Bounty board — one row per character per UTC day, with the 3 daily
  // bounties + per-bounty kill counts persisted as JSON.
  db.exec(`
    CREATE TABLE IF NOT EXISTS character_bounties (
      character_id INTEGER NOT NULL,
      day_index    INTEGER NOT NULL,
      bounties_json TEXT NOT NULL,
      PRIMARY KEY (character_id, day_index),
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );
  `);

  // Trial cache: each Tower clear hands a token, redeemed at a special
  // vendor for unique gear and forge guarantees. Trial purchases log what
  // a character has bought (some offerings are one-per-character).
  if (!charHave.has('trial_tokens')) db.exec(`ALTER TABLE characters ADD COLUMN trial_tokens INTEGER NOT NULL DEFAULT 0`);
  if (!charHave.has('forge_guarantees')) db.exec(`ALTER TABLE characters ADD COLUMN forge_guarantees INTEGER NOT NULL DEFAULT 0`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS trial_purchases (
      character_id INTEGER NOT NULL,
      slug         TEXT NOT NULL,
      bought_at    INTEGER NOT NULL,
      PRIMARY KEY (character_id, slug),
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );
  `);

  // Battle Pass — 50 tasks per UTC calendar month, free + premium rewards.
  // The month_key column is "YYYY-MM" so a new month implicitly resets
  // every character's progress without us touching this table.
  db.exec(`
    CREATE TABLE IF NOT EXISTS battle_pass (
      character_id   INTEGER NOT NULL,
      month_key      TEXT NOT NULL,
      tasks_json     TEXT NOT NULL,           -- 50 task definitions for this month
      progress_json  TEXT NOT NULL DEFAULT '{}', -- { taskId: count }
      claimed_json   TEXT NOT NULL DEFAULT '{}', -- { taskId: { free: bool, premium: bool } }
      premium_unlocked INTEGER NOT NULL DEFAULT 0,
      generated_at   INTEGER NOT NULL,
      PRIMARY KEY (character_id, month_key),
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );
  `);

  // Guild multi-track upgrades — six tracks, each 0..100, gated by guild XP.
  const guildCols = db.prepare(`PRAGMA table_info(guilds)`).all() as { name: string }[];
  const guildHave = new Set(guildCols.map((c) => c.name));
  if (!guildHave.has('attr_level'))         db.exec(`ALTER TABLE guilds ADD COLUMN attr_level INTEGER NOT NULL DEFAULT 0`);
  if (!guildHave.has('power_level'))        db.exec(`ALTER TABLE guilds ADD COLUMN power_level INTEGER NOT NULL DEFAULT 0`);
  if (!guildHave.has('defence_level'))      db.exec(`ALTER TABLE guilds ADD COLUMN defence_level INTEGER NOT NULL DEFAULT 0`);
  if (!guildHave.has('exp_bonus_level'))    db.exec(`ALTER TABLE guilds ADD COLUMN exp_bonus_level INTEGER NOT NULL DEFAULT 0`);
  if (!guildHave.has('gold_bonus_level'))   db.exec(`ALTER TABLE guilds ADD COLUMN gold_bonus_level INTEGER NOT NULL DEFAULT 0`);
  if (!guildHave.has('gold_level'))         db.exec(`ALTER TABLE guilds ADD COLUMN gold_level INTEGER NOT NULL DEFAULT 0`);

  // Guild Vault — shared item storage. The lowest guild rank ("recruit")
  // can only deposit. Members, officers, and the leader can take.
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_vault (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id      INTEGER NOT NULL,
      inventory_id  INTEGER NOT NULL,
      deposited_by  INTEGER NOT NULL,
      deposited_at  INTEGER NOT NULL,
      FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
      FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE,
      FOREIGN KEY (deposited_by) REFERENCES characters(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_guild_vault ON guild_vault(guild_id, deposited_at DESC);
  `);

  // Auction House — one item up at a time, rotates hourly. Resets at 20:00
  // UTC daily (the auction_cycles row is keyed by hour bucket).
  db.exec(`
    CREATE TABLE IF NOT EXISTS auction_listings (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      hour_bucket   INTEGER NOT NULL UNIQUE,   -- floor(now_ms / 3_600_000)
      item_slug     TEXT NOT NULL,
      item_id       INTEGER NOT NULL,
      starts_at     INTEGER NOT NULL,
      ends_at       INTEGER NOT NULL,
      starting_bid  INTEGER NOT NULL,
      current_bid   INTEGER NOT NULL,
      bidder_id     INTEGER,                   -- null until first bid
      bidder_name   TEXT,
      settled       INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (bidder_id) REFERENCES characters(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auction_hour ON auction_listings(hour_bucket);
  `);

  // Action cooldowns — replaces the energy economy. Each action kind
  // (hunt / camp_start / tower / dungeon / quest / arena) has its own
  // per-character cooldown timestamp.
  db.exec(`
    CREATE TABLE IF NOT EXISTS character_cooldowns (
      character_id      INTEGER NOT NULL,
      action_kind       TEXT NOT NULL,
      next_available_at INTEGER NOT NULL,
      PRIMARY KEY (character_id, action_kind),
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );
  `);

  // Equipped mount per character — the mount reduces action cooldowns.
  if (!charHave.has('mount_inventory_id')) db.exec(`ALTER TABLE characters ADD COLUMN mount_inventory_id INTEGER NOT NULL DEFAULT 0`);

  // Mount stat add-ons — the top-tier mount ships as a cheap base (cooldown
  // only); its combat-stat lines are sold à la carte (e.g. +Phys DMG) and
  // recorded per (character, mount_slug, addon_key). They only count toward
  // derived stats while that mount is the active one.
  db.exec(`
    CREATE TABLE IF NOT EXISTS mount_addons (
      character_id INTEGER NOT NULL,
      mount_slug   TEXT NOT NULL,
      addon_key    TEXT NOT NULL,
      bought_at    INTEGER NOT NULL,
      PRIMARY KEY (character_id, mount_slug, addon_key),
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );
  `);

  // Realm Boss — one server-wide boss per ISO week. Every character can
  // strike it once per cooldown; the boss has a shared HP pool that
  // ticks down across the whole realm. Whoever lands the kill earns the
  // lion's share; everyone who landed a hit gets a proportional payout
  // on settlement (run from realmBoss.ts when the week rolls over).
  db.exec(`
    CREATE TABLE IF NOT EXISTS realm_boss (
      iso_week     TEXT NOT NULL PRIMARY KEY,
      boss_slug    TEXT NOT NULL,
      boss_name    TEXT NOT NULL,
      hp_max       INTEGER NOT NULL,
      hp_remaining INTEGER NOT NULL,
      started_at   INTEGER NOT NULL,
      ends_at      INTEGER NOT NULL,
      cleared_at   INTEGER NOT NULL DEFAULT 0,
      kill_blow_character_id INTEGER NOT NULL DEFAULT 0,
      settled_at   INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS realm_boss_contributions (
      iso_week     TEXT NOT NULL,
      character_id INTEGER NOT NULL,
      damage       INTEGER NOT NULL DEFAULT 0,
      strikes      INTEGER NOT NULL DEFAULT 0,
      last_strike_at INTEGER NOT NULL DEFAULT 0,
      claimed_at   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (iso_week, character_id),
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );
  `);

  // Faction reputation — three factions earn rep from quest turn-ins and
  // specific kill counts. Reputation tiers unlock exclusive faction
  // vendor stock (handled in routes/faction.ts). Single denormalised
  // row per (character, faction) so the join cost stays at zero.
  db.exec(`
    CREATE TABLE IF NOT EXISTS character_faction_rep (
      character_id INTEGER NOT NULL,
      faction_slug TEXT NOT NULL,
      rep          INTEGER NOT NULL DEFAULT 0,
      updated_at   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (character_id, faction_slug),
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );
  `);

  // Seasonal events — four windows per UTC year (Frostmoot, Bloomtide,
  // Sunhigh, Emberfall). During each window any kill against an event-
  // tagged monster pays event currency (per-season). The currency
  // redeems for cosmetic frames, avatars, and a season-mount at the
  // event vendor. Window dates are UTC, fixed; we don't need a window
  // table — the season is derived from today's date.
  db.exec(`
    CREATE TABLE IF NOT EXISTS character_event_progress (
      character_id INTEGER NOT NULL,
      season_key   TEXT NOT NULL,
      points       INTEGER NOT NULL DEFAULT 0,
      claimed_json TEXT NOT NULL DEFAULT '[]',
      updated_at   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (character_id, season_key),
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );
  `);

  // Mythic+ dungeon runs — once a player clears a scripted dungeon they
  // unlock an "endless" tier track for it. Each Mythic+ tier scales
  // monster stats by (1 + tier * 0.12). One row per character per
  // dungeon tracks best cleared tier.
  db.exec(`
    CREATE TABLE IF NOT EXISTS mythic_plus_progress (
      character_id INTEGER NOT NULL,
      dungeon_slug TEXT NOT NULL,
      best_tier    INTEGER NOT NULL DEFAULT 0,
      current_tier INTEGER NOT NULL DEFAULT 0,
      current_stage INTEGER NOT NULL DEFAULT 0,
      run_seed     INTEGER NOT NULL DEFAULT 0,
      run_started_at INTEGER NOT NULL DEFAULT 0,
      consecutive_fails INTEGER NOT NULL DEFAULT 0,
      updated_at   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (character_id, dungeon_slug),
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );
  `);
}
