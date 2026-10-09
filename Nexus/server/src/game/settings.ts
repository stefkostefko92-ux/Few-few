import type Database from 'better-sqlite3';
import { getDb } from '../db';
import type { CombatTuning } from './combat';

/**
 * Tunable runtime settings — anything the admin can tweak without a deploy
 * lives here. Each setting has a default, a coerced type and — for numbers —
 * its allowed range (`min`/`max`).
 *
 * Един източник на истината: границите живеят В описанието (не в
 * routes/admin.ts, както преди), валидацията е тук (`validateSettingValue`),
 * а админ API-то и клиентът само ги четат. Всяка настройка в каталога има
 * реален потребител в играта (тест: econFixes.test.ts) — преди НИТО ЕДНА не
 * се четеше и админ панелът променяше числа, които нищо не ползваше.
 */

export interface SettingDef {
  key: string;
  label: string;
  description: string;
  type: 'int' | 'float' | 'string' | 'bool';
  default: string | number | boolean;
  group: 'economy' | 'progression' | 'combat' | 'marketplace' | 'security';
  /** Долна граница (включително) — само за int/float. */
  min?: number;
  /** Горна граница (включително) — само за int/float. */
  max?: number;
}

export const SETTINGS_CATALOG: SettingDef[] = [
  // Economy
  { key: 'stat_upgrade_base_cost', group: 'economy', label: 'Stat upgrade base cost', description: 'Cost in gold of the first upgrade for any stat (5 → 10 → 15…).', type: 'int', default: 5, min: 1, max: 1_000_000 },
  { key: 'rename_cost_gold',       group: 'economy', label: 'Rename cost (gold)',     description: 'Gold cost to rename a hero in-game.', type: 'int', default: 250, min: 0, max: 1_000_000_000 },
  { key: 'rename_cooldown_hours',  group: 'economy', label: 'Rename cooldown (hours)', description: 'Hours between successive in-game renames.', type: 'int', default: 24, min: 0, max: 8760 },
  { key: 'guild_create_cost_gold', group: 'economy', label: 'Guild founding cost',    description: 'Gold cost to found a new guild.', type: 'int', default: 1000, min: 0, max: 1_000_000_000 },

  // Marketplace
  { key: 'market_fee_pct',         group: 'marketplace', label: 'Market fee (%)',     description: 'Percentage taken by the market on every sale — and on gold handed over in a player-to-player trade.', type: 'int', default: 5, min: 0, max: 50 },
  { key: 'market_max_price',       group: 'marketplace', label: 'Max listing price',  description: 'Highest price a player can set for a single item.', type: 'int', default: 1_000_000, min: 1, max: 1e12 },

  // Progression
  { key: 'energy_regen_minutes',   group: 'progression', label: 'Energy regen (min/pt)', description: 'Minutes between each +1 energy point.', type: 'int', default: 6, min: 1, max: 1440 },
  { key: 'energy_max_default',     group: 'progression', label: 'Default max energy', description: 'Starting energy cap for new heroes.', type: 'int', default: 100, min: 1, max: 999 },
  // xp_curve_multiplier е махнат: XP се пази кумулативно, а нивото се
  // извежда от кривата (levelFromXp) → смяна по време на игра тихо
  // пре-нивелираше всички герои и чупеше калибрирания темп (paceXpForKill).

  // Combat
  { key: 'crit_multiplier',        group: 'combat', label: 'Crit multiplier',         description: 'Base damage multiplier on a critical hit (heroes add up to +0.6 from CHA).', type: 'float', default: 1.8, min: 1, max: 10 },
  { key: 'base_miss_chance',       group: 'combat', label: 'Base miss chance',        description: 'Default miss chance (0–1).', type: 'float', default: 0.05, min: 0, max: 1 },
  { key: 'block_chance',           group: 'combat', label: 'Block chance (shielded)', description: 'Block chance for defenders with defense > 5 (0–1).', type: 'float', default: 0.10, min: 0, max: 1 },
  { key: 'block_damage_pct',       group: 'combat', label: 'Block damage retained',   description: 'Fraction of damage that still gets through a block (0–1).', type: 'float', default: 0.40, min: 0, max: 1 },

  // Security
  { key: 'allowed_countries',      group: 'security', label: 'Allowed countries',     description: 'Comma-separated ISO-2 country codes that may access the game.', type: 'string', default: 'BG,IT' },
  { key: 'strict_geo',             group: 'security', label: 'Strict geo (block unknown)', description: 'If on, requests with no detectable country are blocked.', type: 'bool', default: false },
  { key: 'login_rate_max_per_min', group: 'security', label: 'Auth rate limit (req/min)', description: 'Authentications allowed per minute per IP.', type: 'int', default: 20, min: 1, max: 1000 },
];

export function findSetting(key: string): SettingDef | undefined {
  return SETTINGS_CATALOG.find((s) => s.key === key);
}

/** Границите [min, max] на числова настройка (или null). */
export function settingBounds(def: SettingDef): [number, number] | null {
  if (def.type !== 'int' && def.type !== 'float') return null;
  if (def.min === undefined || def.max === undefined) return null;
  return [def.min, def.max];
}

/**
 * Валидира и нормализира стойност за настройката. Единственото място с
 * правилата (тип, граници, формат) — админ API-то само го вика.
 */
export function validateSettingValue(def: SettingDef, raw: unknown): { ok: true; value: string | number | boolean } | { ok: false; error: string } {
  if (def.type === 'int' || def.type === 'float') {
    const n = typeof raw === 'string' && raw.trim() === '' ? NaN : Number(raw);
    if (typeof raw === 'boolean' || !Number.isFinite(n) || (def.type === 'int' && !Number.isInteger(n))) {
      return { ok: false, error: def.type === 'int' ? 'Integer required' : 'Number required' };
    }
    const b = settingBounds(def);
    if (b && (n < b[0] || n > b[1])) return { ok: false, error: `Value must be between ${b[0]} and ${b[1]}` };
    return { ok: true, value: n };
  }
  if (def.type === 'bool') {
    if (![true, false, 'true', 'false', 1, 0, '1', '0'].includes(raw as never)) return { ok: false, error: 'Boolean required' };
    return { ok: true, value: raw === true || raw === 'true' || raw === 1 || raw === '1' };
  }
  let v = String(raw).trim();
  if (def.key === 'allowed_countries') {
    v = v.toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z]{2}(,[A-Z]{2})*$/.test(v)) return { ok: false, error: 'Use comma-separated ISO-2 codes, e.g. BG,IT' };
  }
  return { ok: true, value: v };
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

/* Кеш: настройките се четат в горещи пътища (бой, регенерация на енергия,
 * гео мидълуер). Процесът е един и единственият запис минава през
 * setSetting → кешът се инвалидира там. `db` различен от getDb() заобикаля
 * кеша. */
const cache = new Map<string, { value: any; isSet: boolean }>();

/** Изчиства кеша (тестове / външна промяна на таблицата). */
export function clearSettingsCache(): void {
  cache.clear();
}

function read(key: string, db?: Database.Database): { value: any; isSet: boolean } {
  const def = findSetting(key);
  if (!def) throw new Error(`Unknown setting: ${key}`);
  if (!db) {
    const hit = cache.get(key);
    if (hit) return hit;
  }
  const row = (db ?? getDb()).prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  let out: { value: any; isSet: boolean };
  if (!row) out = { value: def.default, isSet: false };
  else {
    const v = coerce(def, row.value);
    // Повредена стойност в БД → по подразбиране (fail-safe), не NaN в боя.
    out = (def.type === 'int' || def.type === 'float') && !Number.isFinite(v) ? { value: def.default, isSet: false } : { value: v, isSet: true };
  }
  if (!db) cache.set(key, out);
  return out;
}

/** Read a setting value. Returns the default if unset. */
export function getSetting<T = any>(key: string, db?: Database.Database): T {
  return read(key, db).value as T;
}

/** Дали админът е задал стойност (иначе важи env/по подразбиране). */
export function isSettingSet(key: string): boolean {
  return read(key).isSet;
}

export function setSetting(key: string, value: any, byUser?: number): void {
  const def = findSetting(key);
  if (!def) throw new Error(`Unknown setting: ${key}`);
  const v = String(value);
  getDb()
    .prepare(`INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .run(key, v, Date.now(), byUser ?? null);
  cache.delete(key);
}

export function getAllSettings(): { def: SettingDef; value: any; isDefault: boolean }[] {
  return SETTINGS_CATALOG.map((def) => {
    const r = read(def.key);
    return { def, value: r.value, isDefault: !r.isSet };
  });
}

/** Живите бойни константи от настройките — маршрутите ги подават на
 *  simulateCombat (енджинът остава чиста функция за харнеса/тестовете). */
export function liveCombatTuning(): CombatTuning {
  return {
    critBase: getSetting<number>('crit_multiplier'),
    missChance: getSetting<number>('base_miss_chance'),
    blockChance: getSetting<number>('block_chance'),
    blockDamagePct: getSetting<number>('block_damage_pct'),
  };
}
