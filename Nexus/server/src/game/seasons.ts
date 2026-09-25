import type Database from 'better-sqlite3';
import { notify } from '../lib/notify';

/**
 * Сезонни класации — месечен сезон (UTC 'YYYY-MM') с награди за върха.
 * „Почти автоматично": никакъв cron — точки се трупат от геймплей събития,
 * а финализацията на изтекъл сезон е LAZY: първата заявка към сезонния API
 * в новия месец затваря стария сезон (в една транзакция), раздава наградите
 * и вписва резултатите. Идемпотентно — season_results е PK-защитена.
 *
 * Точки (сървър-авторитетни): лов убийство = 1 + ниво/25; арена победа = 20;
 * кула етаж = 5. Наградите са формулни по ранг.
 */

export function seasonKeyFor(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Началото на следващия сезон (ms) — за countdown в клиента. */
export function seasonEndsAt(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

/** Предишният сезонен ключ спрямо now. */
export function prevSeasonKey(now = Date.now()): string {
  const d = new Date(now);
  return seasonKeyFor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - 1);
}

/** Трупане на точки. Никога не хвърля (страничен ефект). */
export function addSeasonPoints(db: Database.Database, characterId: number, points: number, now = Date.now()): void {
  if (points <= 0) return;
  try {
    db.prepare(
      `INSERT INTO season_scores (season_key, character_id, points, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(season_key, character_id) DO UPDATE SET points = points + excluded.points, updated_at = excluded.updated_at`,
    ).run(seasonKeyFor(now), characterId, points, now);
  } catch { /* сезонът не бива да чупи основния поток */ }
}

/** Награди по ранг и общ брой участници. */
export function rewardForRank(rank: number, totalPlayers: number): { gems: number; gold: number; title: string } {
  if (rank === 1) return { gems: 1000, gold: 100_000, title: 'Season Champion' };
  if (rank === 2) return { gems: 600, gold: 60_000, title: 'Season Runner-up' };
  if (rank === 3) return { gems: 400, gold: 40_000, title: 'Season Third' };
  if (rank <= 10) return { gems: 200, gold: 20_000, title: '' };
  if (rank <= Math.max(10, Math.ceil(totalPlayers * 0.10))) return { gems: 50, gold: 10_000, title: '' };
  return { gems: 0, gold: 0, title: '' };
}

/**
 * LAZY финализация: ако предишният сезон има точки, но няма резултати —
 * затвори го сега. Идемпотентно и атомарно.
 */
export function finalizePrevSeasonIfDue(db: Database.Database, now = Date.now()): void {
  const prev = prevSeasonKey(now);
  try {
    const hasScores = db.prepare('SELECT 1 FROM season_scores WHERE season_key = ? LIMIT 1').get(prev);
    if (!hasScores) return;
    const hasResults = db.prepare('SELECT 1 FROM season_results WHERE season_key = ? LIMIT 1').get(prev);
    if (hasResults) return;
    const standings = db.prepare(
      `SELECT s.character_id, s.points FROM season_scores s
       JOIN characters c ON c.id = s.character_id AND c.is_npc = 0
       WHERE s.season_key = ? ORDER BY s.points DESC, s.updated_at ASC`,
    ).all(prev) as { character_id: number; points: number }[];
    if (standings.length === 0) return;
    const tx = db.transaction(() => {
      standings.forEach((row, i) => {
        const rank = i + 1;
        const reward = rewardForRank(rank, standings.length);
        db.prepare(
          `INSERT INTO season_results (season_key, character_id, rank, points, reward_gems, reward_gold, title, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(prev, row.character_id, rank, row.points, reward.gems, reward.gold, reward.title, now);
        if (reward.gems > 0 || reward.gold > 0) {
          db.prepare(
            'UPDATE characters SET gems = gems + ?, total_gems_earned = total_gems_earned + ?, gold = gold + ?, total_gold_earned = total_gold_earned + ? WHERE id = ?',
          ).run(reward.gems, reward.gems, reward.gold, reward.gold, row.character_id);
          notify(db, row.character_id, 'system',
            `Season ${prev} results: rank #${rank} — +${reward.gems} gems, +${reward.gold.toLocaleString()}g${reward.title ? ` and the title „${reward.title}"` : ''}!`, '');
        }
        // Титла за подиума — вписва се направо в героя (ако няма по-нова).
        if (reward.title) {
          db.prepare("UPDATE characters SET current_title = ? WHERE id = ? AND (current_title = '' OR current_title LIKE 'Season %')")
            .run(`${reward.title} ${prev}`, row.character_id);
        }
      });
    });
    tx.immediate();
  } catch { /* финализацията се преопитва при следваща заявка */ }
}
