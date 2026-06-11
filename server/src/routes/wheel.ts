import { Router } from 'express';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { applyXp } from '../game/progression';
import { applyGuildMultipliers } from '../game/rewards';
import { evaluateAchievements } from '../game/events';
import { trackBattlePass } from './battlepass';
import { logFromRequest } from '../lib/logger';
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
  const ch = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!ch) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const today = dayIndex();
  // Audit (backend round): old flow read last_spin_day, then computed
  // rewards, then bumped last_spin_day at the end. Two parallel spins
  // both passed the JS check and double-granted (500x jackpot was the
  // painful case). Now BEGIN IMMEDIATE serialises, and the day-bump
  // CAS UPDATE gates the whole block — only one parallel call wins.
  try {
    const result = db.transaction(() => {
      db.prepare(
        "INSERT INTO daily_state (character_id, last_spin_day, streak, longest_streak, last_claim_day, quests_json, completed_json, quests_day) " +
        "VALUES (?, 0, 0, 0, 0, '[]', '[]', 0) ON CONFLICT(character_id) DO NOTHING",
      ).run(ch.id);
      const upd = db.prepare('UPDATE daily_state SET last_spin_day = ? WHERE character_id = ? AND last_spin_day < ?').run(today, ch.id, today);
      if (upd.changes !== 1) {
        const e: any = new Error('You may spin once a day. Come back tomorrow.');
        e.clientSafe = true; e.status = 400; throw e;
      }
      const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(ch.id) as Character;
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

  // Apply guild scholarship / charter to wheel rewards too.
  const mul = applyGuildMultipliers(char.id, goldDelta, xpDelta);
  goldDelta = mul.gold;
  xpDelta   = mul.xp;

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
      return { seg, label, goldDelta, xpDelta, energyDelta, itemSlug, lvlRes, charName: char.name };
    }).immediate();
    trackBattlePass(ch.id, 'wheel_spin', 1);
    logFromRequest(req, {
      category: 'wheel', action: 'spin', character_id: ch.id,
      message: `${result.charName} spun the wheel: ${result.label}`,
      meta: { segment: result.seg.kind, label: result.label, gold: result.goldDelta, xp: result.xpDelta, energy: result.energyDelta, item: result.itemSlug },
    });
    const unlocked = evaluateAchievements(db, ch.id);
    res.json({
      label: result.label,
      kind: result.seg.kind,
      goldDelta: result.goldDelta,
      xpDelta: result.xpDelta,
      energyDelta: result.energyDelta,
      itemSlug: result.itemSlug,
      levelUp: result.lvlRes.leveled ? result.lvlRes : null,
      unlocked,
    });
  } catch (e: any) {
    if (e?.clientSafe) { res.status(e.status || 400).json({ error: e.message }); return; }
    throw e;
  }
});

export default router;
