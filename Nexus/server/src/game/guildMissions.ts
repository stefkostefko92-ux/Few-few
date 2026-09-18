import type Database from 'better-sqlite3';
import { notify } from '../lib/notify';

/**
 * Гилдийни седмични мисии — кооперативни цели с обща награда. „Почти
 * автоматично": мисиите за седмицата са ДЕТЕРМИНИСТИЧНА функция на
 * седмичния индекс (UTC) — без cron, без админ; всяка гилдия вижда същите
 * три мисии, прогресът е общ за членовете, а при изпълнение ВСЕКИ текущ
 * член получава златото + нотификация. Нова седмица = чист прогрес.
 */

export interface GuildMissionDef {
  key: 'hunt_kills' | 'arena_wins' | 'tower_floors';
  label: string;
  target: number;
  reward_gold: number; // на ЧЛЕН при изпълнение
}

// Фиксирани, формулно съотнесени цели (баланс: изпълними от активна гилдия
// за седмица, без да са тривиални за соло играч).
export const GUILD_MISSIONS: GuildMissionDef[] = [
  { key: 'hunt_kills',   label: 'Slay monsters together',   target: 300, reward_gold: 4000 },
  { key: 'arena_wins',   label: 'Win arena duels',          target: 40,  reward_gold: 5000 },
  { key: 'tower_floors', label: 'Climb tower floors',       target: 60,  reward_gold: 6000 },
];

/** Текущият седмичен индекс (UTC). */
export function currentWeekIndex(now = Date.now()): number {
  return Math.floor(now / (7 * 86_400_000));
}

/** Кога се нулират мисиите (началото на следващата UTC седмица, ms). */
export function missionsResetAt(now = Date.now()): number {
  return (currentWeekIndex(now) + 1) * 7 * 86_400_000;
}

function guildIdOf(db: Database.Database, characterId: number): number | null {
  const row = db.prepare('SELECT guild_id FROM guild_members WHERE character_id = ?').get(characterId) as
    | { guild_id: number } | undefined;
  return row ? row.guild_id : null;
}

/**
 * Отчита принос към мисия. Вика се от hunting/arena/tower при успех.
 * Идемпотентно спрямо седмицата; при достигане на целта наградата се
 * раздава ЕДНОКРАТНО (rewarded флаг под транзакция) на всички членове.
 * Никога не хвърля — мисиите са страничен ефект, не бива да валят заявката.
 */
export function trackGuildMission(
  db: Database.Database,
  characterId: number,
  key: GuildMissionDef['key'],
  amount = 1,
  now = Date.now(),
): void {
  try {
    const guildId = guildIdOf(db, characterId);
    if (!guildId) return;
    const def = GUILD_MISSIONS.find((m) => m.key === key);
    if (!def) return;
    const week = currentWeekIndex(now);
    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO guild_mission_progress (guild_id, week_key, mission_key, progress, rewarded)
         VALUES (?, ?, ?, ?, 0)
         ON CONFLICT(guild_id, week_key, mission_key) DO UPDATE SET progress = progress + excluded.progress`,
      ).run(guildId, week, key, amount);
      // Награда: claim-ваме rewarded=1 атомарно — само първото минаване печели.
      const claimed = db.prepare(
        `UPDATE guild_mission_progress SET rewarded = 1
         WHERE guild_id = ? AND week_key = ? AND mission_key = ? AND rewarded = 0 AND progress >= ?`,
      ).run(guildId, week, key, def.target);
      if (claimed.changes !== 1) return;
      const members = db.prepare('SELECT character_id FROM guild_members WHERE guild_id = ?').all(guildId) as
        { character_id: number }[];
      for (const m of members) {
        db.prepare('UPDATE characters SET gold = gold + ?, total_gold_earned = total_gold_earned + ? WHERE id = ?')
          .run(def.reward_gold, def.reward_gold, m.character_id);
        notify(db, m.character_id, 'system',
          `Guild mission complete: ${def.label} — +${def.reward_gold.toLocaleString()}g for every member!`, '');
      }
    });
    tx.immediate();
  } catch { /* мисиите никога не чупят основния поток */ }
}

/** Състоянието на мисиите за гилдия тази седмица (за GET /guild/missions). */
export function missionsForGuild(db: Database.Database, guildId: number, now = Date.now()) {
  const week = currentWeekIndex(now);
  const rows = db.prepare(
    'SELECT mission_key, progress, rewarded FROM guild_mission_progress WHERE guild_id = ? AND week_key = ?',
  ).all(guildId, week) as { mission_key: string; progress: number; rewarded: number }[];
  const byKey = new Map(rows.map((r) => [r.mission_key, r]));
  return {
    reset_at: missionsResetAt(now),
    missions: GUILD_MISSIONS.map((m) => ({
      key: m.key,
      label: m.label,
      target: m.target,
      reward_gold: m.reward_gold,
      progress: Math.min(byKey.get(m.key)?.progress ?? 0, m.target),
      completed: (byKey.get(m.key)?.rewarded ?? 0) === 1,
    })),
  };
}
