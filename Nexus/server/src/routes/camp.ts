import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { applyXp } from '../game/progression';
import { applyGuildMultipliers } from '../game/rewards';
import { logFromRequest } from '../lib/logger';
import { trackBattlePass } from './battlepass';
import type { Character } from '../types/domain';

const router = Router();
router.use(authRequired);

interface TaskDef {
  slug: string;
  name: string;
  description: string;
  icon: string;
  gold_per_hour: number;
  xp_per_hour: number;
  loot_pool: { slug: string; per_hour_chance: number }[];
}

export const CAMP_TASKS: TaskDef[] = [
  {
    slug: 'fishing',
    name: 'Cast the Line',
    description: 'A quiet hour at the river. Coin from the catch, the occasional rare lure.',
    icon: '🎣',
    gold_per_hour: 18,
    xp_per_hour: 8,
    loot_pool: [
      { slug: 'lesser_health_potion', per_hour_chance: 0.08 },
      { slug: 'health_potion',        per_hour_chance: 0.02 },
    ],
  },
  {
    slug: 'foraging',
    name: 'Forage for Herbs',
    description: 'Walk the wood and gather what the alchemists buy.',
    icon: '🌿',
    gold_per_hour: 14,
    xp_per_hour: 10,
    loot_pool: [
      { slug: 'minor_strength_elixir', per_hour_chance: 0.04 },
      { slug: 'minor_constitution_elixir', per_hour_chance: 0.04 },
      { slug: 'minor_dexterity_elixir', per_hour_chance: 0.04 },
    ],
  },
  {
    slug: 'mining',
    name: 'Work the Veins',
    description: 'Heavy work. Sturdy gold per hour. Sweat-shirts only.',
    icon: '⛏️',
    gold_per_hour: 28,
    xp_per_hour: 6,
    loot_pool: [
      { slug: 'silver_ring', per_hour_chance: 0.015 },
    ],
  },
  {
    slug: 'hunting',
    name: 'Hunt Pelts',
    description: 'Track game. Sell the pelts. Keep the trophies.',
    icon: '🏹',
    gold_per_hour: 22,
    xp_per_hour: 14,
    loot_pool: [
      { slug: 'leather_helm', per_hour_chance: 0.02 },
      { slug: 'leather_gloves', per_hour_chance: 0.02 },
    ],
  },
  {
    slug: 'scouting',
    name: 'Scout the Roads',
    description: 'Patrol the kingdom\'s ways. Lower coin, the highest XP.',
    icon: '🧭',
    gold_per_hour: 10,
    xp_per_hour: 22,
    loot_pool: [],
  },
];

const ALLOWED_HOURS = [1, 4, 8, 24];

function getChar(uid: number): Character | undefined {
  return getDb().prepare('SELECT * FROM characters WHERE user_id = ?').get(uid) as Character | undefined;
}

router.get('/status', (req, res) => {
  const char = getChar(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const task = getDb().prepare('SELECT * FROM character_task WHERE character_id = ?').get(char.id) as any;
  res.json({
    tasks: CAMP_TASKS,
    durations: ALLOWED_HOURS,
    current: task ? { ...task, def: CAMP_TASKS.find((t) => t.slug === task.slug) } : null,
    now: Date.now(),
  });
});

const startSchema = z.object({
  slug: z.string(),
  hours: z.number().int().refine((n) => ALLOWED_HOURS.includes(n), 'duration must be 1, 4, 8, or 24'),
});

router.post('/start', (req, res) => {
  const parse = startSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const char = getChar(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const def = CAMP_TASKS.find((t) => t.slug === parse.data.slug);
  if (!def) { res.status(404).json({ error: 'Unknown task' }); return; }
  const db = getDb();
  const existing = db.prepare('SELECT 1 FROM character_task WHERE character_id = ?').get(char.id);
  if (existing) { res.status(400).json({ error: 'You already have a task running. Claim it first.' }); return; }
  const now = Date.now();
  const ends = now + parse.data.hours * 60 * 60 * 1000;
  db.prepare(
    `INSERT INTO character_task (character_id, slug, started_at, ends_at, duration_hr) VALUES (?, ?, ?, ?, ?)`,
  ).run(char.id, def.slug, now, ends, parse.data.hours);
  logFromRequest(req, {
    category: 'camp', action: 'start',
    character_id: char.id,
    message: `${char.name} started ${def.name} for ${parse.data.hours}h`,
    meta: { slug: def.slug, hours: parse.data.hours },
  });
  res.json({ ok: true, ends_at: ends });
});

router.post('/claim', (req, res) => {
  const char = getChar(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const task = db.prepare('SELECT * FROM character_task WHERE character_id = ?').get(char.id) as any;
  if (!task) { res.status(404).json({ error: 'No task to claim' }); return; }
  if (task.ends_at > Date.now()) {
    res.status(400).json({ error: `Still ${Math.ceil((task.ends_at - Date.now()) / 60000)} minutes remaining.` });
    return;
  }
  const def = CAMP_TASKS.find((t) => t.slug === task.slug);
  if (!def) { db.prepare('DELETE FROM character_task WHERE character_id = ?').run(char.id); res.json({ ok: true }); return; }
  const hours = task.duration_hr as number;
  // Skill scaling: charisma adds a small payout bump (max +20% at CHA 20)
  const chaBonus = Math.min(0.2, (char.charisma || 5) * 0.01);
  // Баланс: level scaling — фиксираните g/h (10–28) правеха idle пътя
  // мъртво съдържание след ~lv30 (24ч camp < 1 hunt kill). +6%/ниво държи
  // camp на ~25–35% от активния hunt доход на всяко ниво — смислен
  // офлайн филър, без да конкурира активната игра.
  const levelScale = 1 + char.level * 0.06;
  const baseGold = Math.round(def.gold_per_hour * hours * (1 + chaBonus) * levelScale);
  const baseXp   = Math.round(def.xp_per_hour * hours * levelScale);
  const reward = applyGuildMultipliers(char.id, baseGold, baseXp);
  const goldGain = reward.gold;
  const xpGain = reward.xp;

  const loot: string[] = [];
  for (const l of def.loot_pool) {
    if (Math.random() < l.per_hour_chance * hours) {
      const item = db.prepare('SELECT id, category FROM items WHERE slug = ?').get(l.slug) as { id: number; category: string } | undefined;
      if (item) {
        if (item.category === 'potion') {
          const ex = db.prepare('SELECT id FROM inventory WHERE character_id = ? AND item_id = ? AND equipped = 0 AND soul_bound = 0').get(char.id, item.id) as { id: number } | undefined;
          if (ex) db.prepare('UPDATE inventory SET quantity = quantity + 1 WHERE id = ?').run(ex.id);
          else db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, '')").run(char.id, item.id);
        } else {
          db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, '')").run(char.id, item.id);
        }
        loot.push(l.slug);
      }
    }
  }
  const lvlRes = applyXp(char, xpGain);
  db.prepare(
    `UPDATE characters SET gold = gold + ?, xp = ?, level = ?, hp_max = ?, mp_max = ?, hp = hp_max, mp = mp_max, total_gold_earned = total_gold_earned + ?, total_xp_earned = total_xp_earned + ? WHERE id = ?`,
  ).run(goldGain, char.xp, char.level, char.hp_max, char.mp_max, goldGain, xpGain, char.id);
  db.prepare('DELETE FROM character_task WHERE character_id = ?').run(char.id);

  trackBattlePass(char.id, 'camp_claim', 1);

  logFromRequest(req, {
    category: 'camp', action: 'claim',
    character_id: char.id,
    message: `${char.name} claimed ${def.name} (${hours}h) for +${goldGain}g +${xpGain} XP`,
    meta: { slug: def.slug, hours, gold: goldGain, xp: xpGain, loot, level_up: lvlRes.leveled },
  });

  res.json({ ok: true, gold: goldGain, xp: xpGain, loot, levelUp: lvlRes.leveled ? lvlRes : null });
});

export default router;
