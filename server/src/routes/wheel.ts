import { Router } from 'express';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { applyXp } from '../game/progression';
import { evaluateAchievements } from '../game/events';
import { trackBattlePass } from './battlepass';
import type { Character } from '../types/domain';

const router = Router();
router.use(authRequired);

function dayIndex(now: number = Date.now()): number {
  return Math.floor(now / 86_400_000);
}

// Wheel segments — weighted draws scaled by player level.
const SEGMENTS = [
  { kind: 'gold',    label: 'Gold Stash',         weight: 28, multiplier: 25 },
  { kind: 'gold',    label: 'A Heavy Purse',      weight: 18, multiplier: 60 },
  { kind: 'xp',      label: 'Hard-Won Insight',   weight: 22, multiplier: 18 },
  { kind: 'xp',      label: 'A Vision of Power',  weight: 10, multiplier: 45 },
  { kind: 'potion',  label: 'Potion of Healing',  weight: 10, item: 'health_potion' },
  { kind: 'energy',  label: 'Boon of Vigor',      weight: 8,  amount: 30 },
  { kind: 'item',    label: 'A Glittering Ring',  weight: 3,  item: 'silver_ring' },
  { kind: 'jackpot', label: 'Royal Jackpot!',     weight: 1,  multiplier: 500 },
];

function pickSegment() {
  const total = SEGMENTS.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const seg of SEGMENTS) {
    if ((r -= seg.weight) <= 0) return seg;
  }
  return SEGMENTS[0];
}

router.get('/', (req, res) => {
  const db = getDb();
  const ch = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!ch) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const row = db.prepare('SELECT last_spin_day FROM daily_state WHERE character_id = ?').get(ch.id) as { last_spin_day: number } | undefined;
  const today = dayIndex();
  res.json({
    canSpin: !row || row.last_spin_day < today,
    segments: SEGMENTS.map(({ kind, label }) => ({ kind, label })),
  });
});

router.post('/spin', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const today = dayIndex();
  const row = db.prepare('SELECT last_spin_day FROM daily_state WHERE character_id = ?').get(char.id) as { last_spin_day: number } | undefined;
  if (!row) {
    db.prepare("INSERT INTO daily_state (character_id, last_spin_day) VALUES (?, ?) ON CONFLICT(character_id) DO UPDATE SET last_spin_day = excluded.last_spin_day").run(char.id, 0);
  }
  if (row && row.last_spin_day >= today) {
    res.status(400).json({ error: 'You may spin once a day. Come back tomorrow.' });
    return;
  }
  const seg = pickSegment();
  let goldDelta = 0;
  let xpDelta = 0;
  let energyDelta = 0;
  let itemSlug: string | null = null;
  let label = seg.label;

  if (seg.kind === 'gold' || seg.kind === 'jackpot') {
    goldDelta = Math.floor((seg as any).multiplier * (1 + char.level * 0.2));
  } else if (seg.kind === 'xp') {
    xpDelta = Math.floor((seg as any).multiplier * (1 + char.level * 0.3));
  } else if (seg.kind === 'energy') {
    energyDelta = Math.min((seg as any).amount, char.energy_max - char.energy);
  } else if (seg.kind === 'potion' || seg.kind === 'item') {
    itemSlug = (seg as any).item;
  }

  char.gold += goldDelta;
  char.energy = Math.min(char.energy_max, char.energy + energyDelta);
  const lvlRes = applyXp(char, xpDelta);
  if (itemSlug) {
    const item = db.prepare('SELECT id, category FROM items WHERE slug = ?').get(itemSlug) as { id: number; category: string } | undefined;
    if (item) {
      if (item.category === 'potion') {
        const ex = db.prepare('SELECT id FROM inventory WHERE character_id = ? AND item_id = ? AND equipped = 0').get(char.id, item.id) as { id: number } | undefined;
        if (ex) db.prepare('UPDATE inventory SET quantity = quantity + 1 WHERE id = ?').run(ex.id);
        else db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, '')").run(char.id, item.id);
      } else {
        db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, '')").run(char.id, item.id);
      }
    }
  }
  db.prepare(
    'UPDATE characters SET xp = ?, level = ?, stat_points = ?, skill_points = ?, hp_max = ?, mp_max = ?, hp = ?, mp = ?, gold = ?, energy = ?, total_gold_earned = total_gold_earned + ?, total_xp_earned = total_xp_earned + ? WHERE id = ?',
  ).run(char.xp, char.level, char.stat_points, char.skill_points, char.hp_max, char.mp_max, char.hp, char.mp, char.gold, char.energy, goldDelta, xpDelta, char.id);
  db.prepare("INSERT INTO daily_state (character_id, last_spin_day) VALUES (?, ?) ON CONFLICT(character_id) DO UPDATE SET last_spin_day = excluded.last_spin_day").run(char.id, today);
  trackBattlePass(char.id, 'wheel_spin', 1);
  const unlocked = evaluateAchievements(db, char.id);
  res.json({
    label,
    kind: seg.kind,
    goldDelta,
    xpDelta,
    energyDelta,
    itemSlug,
    levelUp: lvlRes.leveled ? lvlRes : null,
    unlocked,
  });
});

export default router;
