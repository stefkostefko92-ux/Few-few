import { Router } from 'express';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import type { Character } from '../types/domain';

/**
 * Weekly events — a single "Realm Trial" reward that resets each Monday
 * at 00:00 UTC. The trial accumulates kill counters server-side from any
 * combat source (hunt / bounty / dungeon / arena) and pays out scaling
 * gold + gems + a tier-appropriate equipment drop on claim.
 *
 * Counter is stored per character in a tiny table keyed by ISO week so
 * the reset is implicit: next week's row simply doesn't exist yet.
 */

const router = Router();
router.use(authRequired);

/** ISO-week key like "2026-W23". */
function isoWeek(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}

// Idempotent migration on module load.
const db = getDb();
db.exec(`
  CREATE TABLE IF NOT EXISTS weekly_progress (
    character_id INTEGER NOT NULL,
    iso_week     TEXT NOT NULL,
    kills        INTEGER NOT NULL DEFAULT 0,
    claimed_at   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (character_id, iso_week)
  );
`);

const KILL_GOAL = 50;
const REWARD_GOLD_PER_LEVEL = 35;
const REWARD_GEMS = 10;

router.get('/status', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT id, level FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const wk = isoWeek();
  const row = db.prepare('SELECT kills, claimed_at FROM weekly_progress WHERE character_id=? AND iso_week=?').get(char.id, wk) as { kills?: number; claimed_at?: number } | undefined;
  const kills = row?.kills || 0;
  const claimed = !!row?.claimed_at;
  // Next Monday 00:00 UTC for the timer.
  const now = new Date();
  const days = (8 - (now.getUTCDay() || 7)) % 7 || 7;
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, 0, 0, 0);
  res.json({
    week: wk,
    kills,
    goal: KILL_GOAL,
    claimable: kills >= KILL_GOAL && !claimed,
    claimed,
    reset_at: next,
    reward_preview: {
      gold: char.level * REWARD_GOLD_PER_LEVEL,
      gems: REWARD_GEMS,
    },
  });
});

router.post('/claim', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT id, level, gold, gems FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const wk = isoWeek();
  const row = db.prepare('SELECT kills, claimed_at FROM weekly_progress WHERE character_id=? AND iso_week=?').get(char.id, wk) as { kills?: number; claimed_at?: number } | undefined;
  if (!row || (row.kills || 0) < KILL_GOAL) { res.status(400).json({ error: `Need ${KILL_GOAL} kills this week (have ${row?.kills || 0})` }); return; }
  if (row.claimed_at) { res.status(400).json({ error: 'Already claimed this week' }); return; }
  const goldGain = char.level * REWARD_GOLD_PER_LEVEL;
  const tx = db.transaction(() => {
    // CAS the claim flag as the first write so the reward is granted at
    // most once, matching every other claim route (daily/wheel/…).
    const claim = db.prepare('UPDATE weekly_progress SET claimed_at=? WHERE character_id=? AND iso_week=? AND (claimed_at IS NULL OR claimed_at=0)')
      .run(Date.now(), char.id, wk);
    if (claim.changes !== 1) { const e: any = new Error('Already claimed this week'); e.clientSafe = true; e.status = 400; throw e; }
    db.prepare('UPDATE characters SET gold = gold + ?, gems = gems + ? WHERE id = ?')
      .run(goldGain, REWARD_GEMS, char.id);
  });
  try {
    tx();
  } catch (e: any) {
    if (e?.clientSafe) { res.status(e.status || 400).json({ error: e.message }); return; }
    throw e;
  }
  res.json({ ok: true, granted: { gold: goldGain, gems: REWARD_GEMS } });
});

/** Called from combat routes after a victory so the counter ticks
 *  without each route needing its own knowledge of the schema. */
export function trackWeeklyKill(characterId: number): void {
  const wk = isoWeek();
  getDb()
    .prepare(`INSERT INTO weekly_progress (character_id, iso_week, kills)
              VALUES (?, ?, 1)
              ON CONFLICT(character_id, iso_week) DO UPDATE SET kills = kills + 1`)
    .run(characterId, wk);
}

export default router;
