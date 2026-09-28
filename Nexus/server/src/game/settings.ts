import type Database from 'better-sqlite3';
import { getDb } from '../db';

/**
 * Tunable runtime settings — anything the admin can tweak without a deploy
 * lives here. Each setting has a default and a coerced type.
 */

export interface SettingDef {
  key: string;
  label: string;
  description: string;
  type: 'int' | 'float' | 'string' | 'bool';
  default: string | number | boolean;
  group: 'economy' | 'progression' | 'combat' | 'marketplace' | 'security';
}

export const SETTINGS_CATALOG: SettingDef[] = [
  // Economy
  { key: 'stat_upgrade_base_cost', group: 'economy', label: 'Stat upgrade base cost', description: 'Cost in gold of the first upgrade for any stat (5 → 10 → 15…).', type: 'int', default: 5 },
  { key: 'rename_cost_gold',       group: 'economy', label: 'Rename cost (gold)',     description: 'Gold cost to rename a hero in-game.', type: 'int', default: 250 },
  { key: 'rename_cooldown_hours',  group: 'economy', label: 'Rename cooldown (hours)', description: 'Hours between successive in-game renames.', type: 'int', default: 24 },
  { key: 'guild_create_cost_gold', group: 'economy', label: 'Guild founding cost',    description: 'Gold cost to found a new guild.', type: 'int', default: 1000 },

  // Marketplace
  { key: 'market_fee_pct',         group: 'marketplace', label: 'Market fee (%)',     description: 'Percentage taken by the market on every sale.', type: 'int', default: 5 },
  { key: 'market_max_price',       group: 'marketplace', label: 'Max listing price',  description: 'Highest price a player can set for a single item.', type: 'int', default: 1_000_000 },

  // Progression
  { key: 'energy_regen_minutes',   group: 'progression', label: 'Energy regen (min/pt)', description: 'Minutes between each +1 energy point.', type: 'int', default: 6 },
  { key: 'energy_max_default',     group: 'progression', label: 'Default max energy', description: 'Starting energy cap for new heroes.', type: 'int', default: 100 },
  { key: 'xp_curve_multiplier',    group: 'progression', label: 'XP curve multiplier', description: 'Multiplier on the base XP curve (50 * level^1.7).', type: 'float', default: 1.0 },

  // Combat
  { key: 'crit_multiplier',        group: 'combat', label: 'Crit multiplier',         description: 'Damage multiplier on a critical hit.', type: 'float', default: 1.8 },
  { key: 'base_miss_chance',       group: 'combat', label: 'Base miss chance',        description: 'Default miss chance (0–1).', type: 'float', default: 0.05 },
  { key: 'block_chance',           group: 'combat', label: 'Block chance (shielded)', description: 'Block chance for defenders with defense > 5 (0–1).', type: 'float', default: 0.10 },
  { key: 'block_damage_pct',       group: 'combat', label: 'Block damage retained',   description: 'Fraction of damage that still gets through a block (0–1).', type: 'float', default: 0.40 },

  // Security
  { key: 'allowed_countries',      group: 'security', label: 'Allowed countries',     description: 'Comma-separated ISO-2 country codes that may access the game.', type: 'string', default: 'BG,IT' },
  { key: 'strict_geo',             group: 'security', label: 'Strict geo (block unknown)', description: 'If on, requests with no detectable country are blocked.', type: 'bool', default: false },
  { key: 'login_rate_max_per_min', group: 'security', label: 'Auth rate limit (req/min)', description: 'Authentications allowed per minute per IP.', type: 'int', default: 20 },
];

export function findSetting(key: string): SettingDef | undefined {
  return SETTINGS_CATALOG.find((s) => s.key === key);
}

function coerce(def: SettingDef, raw: string): any {
  switch (def.type) {
    case 'int':    return parseInt(raw, 10);
    case 'float':  return parseFloat(raw);
    case 'bool':   return raw === '1' || raw === 'true';
    case 'string':
    default:       return raw;
  }
}

/** Read a setting value. Returns the default if unset. */
export function getSetting<T = any>(key: string, db: Database.Database = getDb()): T {
  const def = findSetting(key);
  if (!def) throw new Error(`Unknown setting: ${key}`);
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return def.default as T;
  return coerce(def, row.value) as T;
}

export function setSetting(key: string, value: any, byUser?: number): void {
  const def = findSetting(key);
  if (!def) throw new Error(`Unknown setting: ${key}`);
  const v = String(value);
  getDb()
    .prepare(`INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .run(key, v, Date.now(), byUser ?? null);
}

export function getAllSettings(): { def: SettingDef; value: any; isDefault: boolean }[] {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return SETTINGS_CATALOG.map((def) => {
    const stored = map.get(def.key);
    return {
      def,
      value: stored !== undefined ? coerce(def, stored) : def.default,
      isDefault: stored === undefined,
    };
  });
}
