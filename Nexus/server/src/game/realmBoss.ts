/**
 * Realm Boss — споделеното ядро (изнесено от routes/realmBoss.ts), за да го
 * ползват И маршрутът на играча, И админ панелът (ръчен спаун/нулиране),
 * без дублиране на ротацията, ключа на седмицата и формулата за HP.
 */
import { getDb } from '../db';

type Db = ReturnType<typeof getDb>;

/** ISO-week key like "2026-W23". Must match weekly.ts. */
export function isoWeek(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}

export interface RealmBossDef {
  slug: string;
  name: string;
  flavor: string;
  hp_per_active_char: number; // scales with realm population
  hp_floor: number;
  atk_min: number;
  atk_max: number;
  defense: number;
  speed: number;
  level: number;
  sprite: string;
  drop_slug: string;
}

export interface RealmBossRow {
  iso_week: string;
  boss_slug: string;
  boss_name: string;
  hp_max: number;
  hp_remaining: number;
  started_at: number;
  ends_at: number;
  cleared_at: number;
  kill_blow_character_id: number;
  settled_at: number;
}

/** Six bosses rotate weekly. Boss is picked by iso_week hash → modulo. */
export const REALM_BOSSES: RealmBossDef[] = [
  { slug: 'rb_thalion',  name: 'Thalion, the Sunless Crown',  flavor: 'A king who outlived his kingdom and forgot how to stop wearing the throne.',
    hp_per_active_char: 80_000, hp_floor: 600_000, level: 250, atk_min: 1100, atk_max: 1800, defense: 380, speed: 7, sprite: 'shadowlord', drop_slug: 'realm_thalion_crown' },
  { slug: 'rb_vethryx',  name: 'Vethryx, the Spine-of-Sky',   flavor: 'A wyrm long enough to wrap the high mountains. Sleeps for centuries, wakes for grudges.',
    hp_per_active_char: 90_000, hp_floor: 700_000, level: 270, atk_min: 1250, atk_max: 2000, defense: 360, speed: 6, sprite: 'drake',      drop_slug: 'realm_vethryx_scale' },
  { slug: 'rb_orsis',    name: 'Orsis, the Drowned God',      flavor: 'The drowned do not stay drowned forever. Orsis just remembered why he sank.',
    hp_per_active_char: 100_000, hp_floor: 800_000, level: 290, atk_min: 1400, atk_max: 2250, defense: 400, speed: 8, sprite: 'serpent',    drop_slug: 'realm_orsis_pendant' },
  { slug: 'rb_kallosh',  name: 'Kallosh, the Marrow-Keeper',  flavor: 'The librarian who ate the books. Knows every spell, casts none, but the dead do walk now.',
    hp_per_active_char: 110_000, hp_floor: 900_000, level: 310, atk_min: 1550, atk_max: 2480, defense: 420, speed: 6, sprite: 'witch',      drop_slug: 'realm_kallosh_grimoire' },
  { slug: 'rb_dawn_unmaker', name: 'The Dawn-Unmaker',       flavor: 'A figure who walks the line of every morning and unmakes one star at a time.',
    hp_per_active_char: 125_000, hp_floor: 1_000_000, level: 330, atk_min: 1750, atk_max: 2800, defense: 460, speed: 8, sprite: 'shadowlord', drop_slug: 'realm_dawn_unmaker_ash' },
  { slug: 'rb_unnamed',  name: 'The One Who Wasn\'t Named',   flavor: 'The clergy refuses to record this name. There is a reason.',
    hp_per_active_char: 140_000, hp_floor: 1_100_000, level: 340, atk_min: 1950, atk_max: 3100, defense: 500, speed: 8, sprite: 'shadowlord', drop_slug: 'realm_unnamed_sigil' },
];

export function findRealmBoss(slug: string): RealmBossDef | undefined {
  return REALM_BOSSES.find((b) => b.slug === slug);
}

export function pickBossForWeek(wk: string): RealmBossDef {
  // Cheap stable hash of the iso-week string → boss index.
  let h = 0;
  for (let i = 0; i < wk.length; i++) h = ((h << 5) - h + wk.charCodeAt(i)) | 0;
  return REALM_BOSSES[Math.abs(h) % REALM_BOSSES.length];
}

/** HP пулът по формулата: max(под, HP на активен герой × активни герои lv100+). */
export function realmBossHpFor(db: Db, boss: RealmBossDef): number {
  const activeChars = (db.prepare('SELECT COUNT(*) AS c FROM characters WHERE level >= 100 AND is_npc = 0').get() as { c: number }).c;
  return Math.max(boss.hp_floor, boss.hp_per_active_char * Math.max(1, activeChars));
}

/** Краят на текущата ISO седмица (следващият понеделник 00:00 UTC). */
export function weekEndsAt(now = new Date()): number {
  const days = (8 - (now.getUTCDay() || 7)) % 7 || 7;
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, 0, 0, 0);
}

/**
 * Създава реда на седмицата, ако липсва (ON CONFLICT DO NOTHING). `boss` и
 * `hpMax` по избор — ръчен спаун от админ панела; иначе ротацията/формулата.
 * Връща true, ако редът е създаден сега.
 */
export function spawnWeekBoss(db: Db, wk: string, boss: RealmBossDef = pickBossForWeek(wk), hpMax?: number): boolean {
  const hp = hpMax ?? realmBossHpFor(db, boss);
  const info = db.prepare(
    `INSERT INTO realm_boss (iso_week, boss_slug, boss_name, hp_max, hp_remaining, started_at, ends_at)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(iso_week) DO NOTHING`,
  ).run(wk, boss.slug, boss.name, hp, hp, Date.now(), weekEndsAt());
  return info.changes === 1;
}

/** Lazy-create the week's row if it doesn't exist. */
export function ensureWeekBoss(): RealmBossRow {
  const db = getDb();
  const wk = isoWeek();
  const row = db.prepare('SELECT * FROM realm_boss WHERE iso_week = ?').get(wk) as RealmBossRow | undefined;
  if (row) return row;
  spawnWeekBoss(db, wk);
  return db.prepare('SELECT * FROM realm_boss WHERE iso_week = ?').get(wk) as RealmBossRow;
}
