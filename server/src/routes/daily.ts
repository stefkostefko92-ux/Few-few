import { Router } from 'express';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { applyXp } from '../game/progression';
import { applyGuildMultipliers } from '../game/rewards';
import { evaluateAchievements } from '../game/events';
import { trackBattlePass } from './battlepass';
import type { Character, Quest } from '../types/domain';

const router = Router();
router.use(authRequired);

function dayIndex(now: number = Date.now()): number {
  return Math.floor(now / 86_400_000);
}

const STREAK_REWARDS = [
  { day: 1,  gold: 25,  xp: 15  },
  { day: 2,  gold: 40,  xp: 25  },
  { day: 3,  gold: 60,  xp: 40  },
  { day: 4,  gold: 90,  xp: 60  },
  { day: 5,  gold: 130, xp: 80  },
  { day: 6,  gold: 180, xp: 110 },
  { day: 7,  gold: 250, xp: 150, item: 'health_potion' },
  { day: 14, gold: 500, xp: 300, item: 'silver_ring' },
  { day: 30, gold: 1500, xp: 800, item: 'amulet_of_warding' },
];

function rewardForDay(day: number) {
  // Loop the 7-day cycle but layer bonus on milestone days
  const cyclePos = ((day - 1) % 7) + 1;
  const base = STREAK_REWARDS.find((r) => r.day === cyclePos) || STREAK_REWARDS[0];
  if (day === 14 || day === 30) {
    return STREAK_REWARDS.find((r) => r.day === day) || base;
  }
  return base;
}

function ensureDaily(db: any, characterId: number) {
  const row = db.prepare('SELECT * FROM daily_state WHERE character_id = ?').get(characterId);
  if (!row) {
    db.prepare(
      "INSERT INTO daily_state (character_id, streak, longest_streak, last_claim_day, last_spin_day, quests_json, completed_json, quests_day) VALUES (?, 0, 0, 0, 0, '[]', '[]', 0)",
    ).run(characterId);
  }
  return db.prepare('SELECT * FROM daily_state WHERE character_id = ?').get(characterId);
}

router.get('/', (req, res) => {
  const db = getDb();
  const ch = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!ch) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const state = ensureDaily(db, ch.id) as any;
  const today = dayIndex();
  const canClaim = state.last_claim_day < today;
  // If they missed >1 day, streak will reset on claim
  const streakOnClaim = canClaim ? (today - state.last_claim_day === 1 ? state.streak + 1 : 1) : state.streak;
  const reward = rewardForDay(canClaim ? streakOnClaim : state.streak);
  res.json({
    streak: state.streak,
    longest_streak: state.longest_streak,
    canClaim,
    streakOnClaim,
    nextReward: reward,
  });
});

router.post('/claim', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const state = ensureDaily(db, char.id) as any;
  const today = dayIndex();
  if (state.last_claim_day >= today) {
    res.status(400).json({ error: 'Already claimed today. Come back tomorrow.' });
    return;
  }
  const newStreak = today - state.last_claim_day === 1 ? state.streak + 1 : 1;
  const baseReward = rewardForDay(newStreak);
  const r = applyGuildMultipliers(char.id, baseReward.gold, baseReward.xp);
  const reward = { ...baseReward, gold: r.gold, xp: r.xp };
  // Grant gold + xp
  char.gold += reward.gold;
  const lvlRes = applyXp(char, reward.xp);
  // Grant item if any
  let givenItem: string | null = null;
  if ((reward as any).item) {
    const slug = (reward as any).item;
    const item = db.prepare('SELECT id, category FROM items WHERE slug = ?').get(slug) as { id: number; category: string } | undefined;
    if (item) {
      if (item.category === 'potion') {
        const existing = db.prepare('SELECT id FROM inventory WHERE character_id = ? AND item_id = ? AND equipped = 0').get(char.id, item.id) as { id: number } | undefined;
        if (existing) db.prepare('UPDATE inventory SET quantity = quantity + 1 WHERE id = ?').run(existing.id);
        else db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, '')").run(char.id, item.id);
      } else {
        db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, '')").run(char.id, item.id);
      }
      givenItem = slug;
    }
  }
  // Daily gem grant: 3 every day, 25 on the 7-day milestone (and 14 / 30).
  const gemsGranted = (newStreak === 14 || newStreak === 30) ? 50 : (newStreak % 7 === 0 ? 25 : 3);
  db.prepare(
    'UPDATE characters SET gold = gold + 0, xp = ?, level = ?, stat_points = ?, skill_points = ?, hp_max = ?, mp_max = ?, hp = ?, mp = ?, total_gold_earned = total_gold_earned + ?, total_xp_earned = total_xp_earned + ?, gold = ?, gems = gems + ?, total_gems_earned = total_gems_earned + ? WHERE id = ?',
  ).run(char.xp, char.level, char.stat_points, char.skill_points, char.hp_max, char.mp_max, char.hp, char.mp, reward.gold, reward.xp, char.gold, gemsGranted, gemsGranted, char.id);
  const longest = Math.max(state.longest_streak, newStreak);
  db.prepare('UPDATE daily_state SET streak = ?, longest_streak = ?, last_claim_day = ? WHERE character_id = ?').run(newStreak, longest, today, char.id);

  trackBattlePass(char.id, 'daily_claim', 1);

  const unlocked = evaluateAchievements(db, char.id);
  res.json({ ok: true, streak: newStreak, reward: { ...reward, gems: gemsGranted }, item: givenItem, levelUp: lvlRes.leveled ? lvlRes : null, unlocked });
});

router.get('/quests', (req, res) => {
  const db = getDb();
  const ch = db.prepare('SELECT id, level FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number; level: number } | undefined;
  if (!ch) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const state = ensureDaily(db, ch.id) as any;
  const today = dayIndex();
  let slugs: string[] = JSON.parse(state.quests_json || '[]');
  let completed: string[] = JSON.parse(state.completed_json || '[]');
  if (state.quests_day !== today || slugs.length === 0) {
    // Rotate: pick 3 random quests at or below the player's level
    const pool = db
      .prepare('SELECT slug FROM quests WHERE level_req <= ? ORDER BY level_req DESC LIMIT 25')
      .all(ch.level + 1) as { slug: string }[];
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 3);
    slugs = shuffled.map((s) => s.slug);
    completed = [];
    db.prepare('UPDATE daily_state SET quests_json = ?, completed_json = ?, quests_day = ? WHERE character_id = ?').run(
      JSON.stringify(slugs), JSON.stringify(completed), today, ch.id,
    );
  }
  const details = db
    .prepare(`SELECT slug, title, region, level_req, xp_reward, gold_reward FROM quests WHERE slug IN (${slugs.map(() => '?').join(',')})`)
    .all(...slugs) as Quest[];
  res.json({
    quests: details.map((q) => ({
      ...q,
      completed: completed.includes(q.slug),
      bonus_gold: Math.floor(q.gold_reward * 2),
      bonus_xp: Math.floor(q.xp_reward * 2),
    })),
    resetAt: (today + 1) * 86_400_000,
  });
});

router.post('/quests/claim', (req, res) => {
  const { questSlug } = req.body || {};
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const state = ensureDaily(db, char.id) as any;
  const slugs: string[] = JSON.parse(state.quests_json || '[]');
  let completed: string[] = JSON.parse(state.completed_json || '[]');
  if (!slugs.includes(questSlug)) {
    res.status(400).json({ error: 'Not one of today\'s daily quests.' });
    return;
  }
  if (completed.includes(questSlug)) {
    res.status(400).json({ error: 'Already claimed today.' });
    return;
  }
  // Check the quest_log for a successful completion since the daily rotation began.
  const todayStart = dayIndex() * 86_400_000;
  const quest = db.prepare('SELECT id, xp_reward, gold_reward FROM quests WHERE slug = ?').get(questSlug) as { id: number; xp_reward: number; gold_reward: number } | undefined;
  if (!quest) {
    res.status(404).json({ error: 'Quest not found' });
    return;
  }
  const success = db
    .prepare("SELECT id FROM quest_log WHERE character_id = ? AND quest_id = ? AND result = 'success' AND completed_at >= ?")
    .get(char.id, quest.id, todayStart);
  if (!success) {
    res.status(400).json({ error: 'Complete the quest first before claiming the daily bonus.' });
    return;
  }
  const bonusGold = quest.gold_reward * 2;
  const bonusXp = quest.xp_reward * 2;
  char.gold += bonusGold;
  const lvlRes = applyXp(char, bonusXp);
  db.prepare(
    'UPDATE characters SET xp = ?, level = ?, stat_points = ?, skill_points = ?, hp_max = ?, mp_max = ?, hp = ?, mp = ?, gold = ?, total_gold_earned = total_gold_earned + ?, total_xp_earned = total_xp_earned + ? WHERE id = ?',
  ).run(char.xp, char.level, char.stat_points, char.skill_points, char.hp_max, char.mp_max, char.hp, char.mp, char.gold, bonusGold, bonusXp, char.id);
  completed.push(questSlug);
  db.prepare('UPDATE daily_state SET completed_json = ? WHERE character_id = ?').run(JSON.stringify(completed), char.id);
  const unlocked = evaluateAchievements(db, char.id);
  res.json({ ok: true, bonusGold, bonusXp, levelUp: lvlRes.leveled ? lvlRes : null, unlocked });
});

export default router;
