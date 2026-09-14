// Изолирана in-memory база — задай ПРЕДИ първия getDb().
process.env.DB_PATH = ':memory:';

import test from 'node:test';
import assert from 'node:assert';
import { getDb } from '../../db';
import { addSeasonPoints, finalizePrevSeasonIfDue, seasonKeyFor, prevSeasonKey, rewardForRank } from '../seasons';
import { trackGuildMission, missionsForGuild, GUILD_MISSIONS, currentWeekIndex } from '../guildMissions';

let seq = 0;
function mkChar(): number {
  return getDb().prepare(
    `INSERT INTO characters (name, class, energy_updated_at, created_at) VALUES (?, 'warrior', 0, 0)`,
  ).run(`sm_${++seq}`).lastInsertRowid as number;
}

/* ===== Сезони ===== */

test('точките се трупат идемпотентно в текущия сезон', () => {
  const db = getDb();
  const id = mkChar();
  addSeasonPoints(db, id, 10);
  addSeasonPoints(db, id, 5);
  const row = db.prepare('SELECT points FROM season_scores WHERE season_key = ? AND character_id = ?')
    .get(seasonKeyFor(), id) as { points: number };
  assert.equal(row.points, 15);
});

test('lazy финализация: раздава награди веднъж и е идемпотентна', () => {
  const db = getDb();
  const a = mkChar(); const b = mkChar(); const c = mkChar();
  const prev = prevSeasonKey();
  // Симулирай точки в МИНАЛИЯ сезон.
  const ins = db.prepare('INSERT INTO season_scores (season_key, character_id, points, updated_at) VALUES (?, ?, ?, ?)');
  ins.run(prev, a, 500, 1); ins.run(prev, b, 300, 2); ins.run(prev, c, 100, 3);
  const gemsBefore = (db.prepare('SELECT gems FROM characters WHERE id = ?').get(a) as { gems: number }).gems;

  finalizePrevSeasonIfDue(db);
  finalizePrevSeasonIfDue(db); // второ извикване — не бива да раздаде втори път

  const res = db.prepare('SELECT rank, reward_gems FROM season_results WHERE season_key = ? ORDER BY rank').all(prev) as
    { rank: number; reward_gems: number }[];
  assert.equal(res.length, 3);
  assert.equal(res[0].rank, 1);
  assert.equal(res[0].reward_gems, 1000, '#1 → 1000 гема');
  const gemsAfter = (db.prepare('SELECT gems FROM characters WHERE id = ?').get(a) as { gems: number }).gems;
  assert.equal(gemsAfter - gemsBefore, 1000, 'кредитирано точно веднъж');
  const title = (db.prepare('SELECT current_title FROM characters WHERE id = ?').get(a) as { current_title: string }).current_title;
  assert.ok(title.startsWith('Season Champion'), `титла: ${title}`);
});

test('rewardForRank е монотонно намаляваща и нулева извън топ 10%', () => {
  assert.ok(rewardForRank(1, 100).gems > rewardForRank(2, 100).gems);
  assert.ok(rewardForRank(3, 100).gems > rewardForRank(10, 100).gems);
  assert.equal(rewardForRank(50, 100).gems, 0, 'ранг 50 от 100 (извън топ 10%) → нищо');
  assert.ok(rewardForRank(10, 100).gems > 0, 'топ 10 винаги получава');
});

/* ===== Гилдийни мисии ===== */

function mkGuild(): { guildId: number; charA: number; charB: number } {
  const db = getDb();
  const charA = mkChar(); const charB = mkChar();
  const g = db.prepare(`INSERT INTO guilds (name, tag, leader_id, created_at) VALUES (?, ?, ?, ?)`)
    .run(`Guild_${seq}`, `G${seq}`, charA, Date.now());
  const guildId = g.lastInsertRowid as number;
  const mem = db.prepare('INSERT INTO guild_members (guild_id, character_id, role, joined_at) VALUES (?, ?, ?, ?)');
  mem.run(guildId, charA, 'leader', Date.now());
  mem.run(guildId, charB, 'member', Date.now());
  return { guildId, charA, charB };
}

test('мисийният прогрес е общ и наградата се раздава на ВСЕКИ член точно веднъж', () => {
  const db = getDb();
  const { guildId, charA, charB } = mkGuild();
  const def = GUILD_MISSIONS.find((m) => m.key === 'arena_wins')!;
  const goldBefore = (db.prepare('SELECT gold FROM characters WHERE id = ?').get(charB) as { gold: number }).gold;
  // Двамата членове допринасят заедно до целта + още 5 отгоре.
  for (let i = 0; i < def.target - 1; i++) trackGuildMission(db, charA, 'arena_wins');
  trackGuildMission(db, charB, 'arena_wins');           // достига целта → награда
  for (let i = 0; i < 5; i++) trackGuildMission(db, charA, 'arena_wins'); // след целта — нищо повторно

  const st = missionsForGuild(db, guildId);
  const mission = st.missions.find((m) => m.key === 'arena_wins')!;
  assert.equal(mission.completed, true);
  const goldAfter = (db.prepare('SELECT gold FROM characters WHERE id = ?').get(charB) as { gold: number }).gold;
  assert.equal(goldAfter - goldBefore, def.reward_gold, 'член B получи наградата точно веднъж');
});

test('герой без гилдия не чупи нищо (no-op)', () => {
  const db = getDb();
  const solo = mkChar();
  assert.doesNotThrow(() => trackGuildMission(db, solo, 'hunt_kills'));
});

test('седмичният индекс разделя прогреса по седмици', () => {
  const now = Date.now();
  assert.equal(currentWeekIndex(now + 7 * 86_400_000), currentWeekIndex(now) + 1);
});
