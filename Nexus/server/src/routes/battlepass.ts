import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { applyXp } from '../game/progression';
import { logFromRequest } from '../lib/logger';
import type { Character } from '../types/domain';

const router = Router();
router.use(authRequired);

/* =========================================================================
 * Battle Pass — 50 tasks every UTC calendar month.
 *
 * Each task references one of the existing activity loops (hunting, camp,
 * tower, forge, bounty, arena, daily, wheel, guild, quest, market) so the
 * pass actually rewards the things players are already doing. Every event
 * route calls trackBattlePass() with a kind + value and we tick the
 * relevant tasks.
 *
 * Resets:
 *   month_key is "YYYY-MM". When the client asks for /battlepass and the
 *   stored row's month doesn't match the current month, we just generate
 *   a fresh 50-task pass and write it over the new month-key row. The old
 *   month's row stays in the DB as history.
 *
 * Tracks:
 *   Free   — gold, XP, basic potions, forge cost discounts (later).
 *   Premium — gems, trial tokens, mythic elixirs, unique frames. Unlocked
 *             by spending 500 gems at /battlepass/unlock-premium. (Players
 *             who buy the gem pack via Stripe get the gems and can unlock
 *             from inside the game with no extra purchase flow.)
 *
 * Tasks are picked from POOLS deterministically by month so every
 * character gets the same 50 tasks for a given month (lets community
 * compare progress).
 * ======================================================================= */

const PASS_LENGTH = 50;
const PREMIUM_UNLOCK_GEMS = 500;

type Kind =
  | 'hunt_kill' | 'tower_clear' | 'tower_vault'
  | 'forge_enchant' | 'forge_high_enchant' | 'bounty_claim'
  | 'arena_win' | 'daily_claim' | 'wheel_spin'
  | 'guild_donate' | 'quest_complete' | 'market_sale'
  | 'camp_claim' | 'dungeon_clear' | 'trial_token_earned';

interface TaskTemplate {
  kind: Kind;
  text: (n: number) => string;
  amount: () => number;
  free: { gold?: number; xp?: number; item_slug?: string };
  premium: { gems?: number; trial_tokens?: number; forge_guarantees?: number; item_slug?: string };
}

const POOL: TaskTemplate[] = [
  { kind: 'hunt_kill', text: (n) => `Slay ${n} monsters in the Hunting Grounds`, amount: () => 20,
    free: { gold: 80, xp: 60 }, premium: { gems: 15 } },
  { kind: 'hunt_kill', text: (n) => `Slay ${n} monsters in the Hunting Grounds`, amount: () => 50,
    free: { gold: 200, xp: 180 }, premium: { gems: 40, trial_tokens: 1 } },
  { kind: 'bounty_claim', text: (n) => `Claim ${n} bounties from the Board`, amount: () => 3,
    free: { gold: 150, xp: 120 }, premium: { gems: 25 } },
  { kind: 'bounty_claim', text: (n) => `Claim ${n} bounties from the Board`, amount: () => 9,
    free: { gold: 400, xp: 320 }, premium: { gems: 60, trial_tokens: 2 } },
  { kind: 'tower_clear', text: (n) => `Climb to Tower floor ${n}`, amount: () => 5,
    free: { gold: 100, xp: 80 }, premium: { trial_tokens: 1 } },
  { kind: 'tower_clear', text: (n) => `Climb to Tower floor ${n}`, amount: () => 15,
    free: { gold: 300, xp: 240 }, premium: { gems: 35, trial_tokens: 2 } },
  { kind: 'tower_vault', text: (n) => `Clear ${n} Tower Vault floor${n > 1 ? 's' : ''}`, amount: () => 2,
    free: { gold: 250, xp: 200 }, premium: { gems: 30, trial_tokens: 1 } },
  { kind: 'forge_enchant', text: (n) => `Successfully enchant ${n} items at the Forge`, amount: () => 5,
    free: { gold: 120, xp: 100 }, premium: { forge_guarantees: 1 } },
  { kind: 'forge_high_enchant', text: () => `Reach +3 enchant on any item`, amount: () => 1,
    free: { gold: 200, xp: 160 }, premium: { gems: 40 } },
  { kind: 'arena_win', text: (n) => `Win ${n} arena duels`, amount: () => 5,
    free: { gold: 150, xp: 100 }, premium: { gems: 25 } },
  { kind: 'camp_claim', text: (n) => `Claim ${n} camp tasks`, amount: () => 3,
    free: { gold: 80, xp: 60 }, premium: { gems: 15 } },
  { kind: 'daily_claim', text: (n) => `Collect Daily Tribute ${n} times`, amount: () => 7,
    free: { gold: 200, xp: 150 }, premium: { gems: 30 } },
  { kind: 'wheel_spin', text: (n) => `Spin the Wheel of Fortune ${n} times`, amount: () => 5,
    free: { gold: 100, xp: 80 }, premium: { gems: 20 } },
  { kind: 'guild_donate', text: (n) => `Donate ${n.toLocaleString()}g (or gem equivalent) to your guild`, amount: () => 1000,
    free: { gold: 0, xp: 200 }, premium: { gems: 25 } },
  { kind: 'guild_donate', text: (n) => `Donate ${n.toLocaleString()}g (or gem equivalent) to your guild`, amount: () => 5000,
    free: { gold: 0, xp: 500 }, premium: { gems: 75, trial_tokens: 1 } },
  { kind: 'quest_complete', text: (n) => `Complete ${n} quests`, amount: () => 3,
    free: { gold: 120, xp: 100 }, premium: { gems: 20 } },
  { kind: 'market_sale', text: (n) => `Sell ${n} items in the Player Market`, amount: () => 3,
    free: { gold: 100, xp: 60 }, premium: { gems: 15 } },
  { kind: 'dungeon_clear', text: (n) => `Clear ${n} dungeon stage${n > 1 ? 's' : ''}`, amount: () => 4,
    free: { gold: 200, xp: 180 }, premium: { gems: 30, trial_tokens: 1 } },
  { kind: 'trial_token_earned', text: (n) => `Earn ${n} Trial Tokens from the Tower`, amount: () => 3,
    free: { gold: 120, xp: 100 }, premium: { gems: 25 } },
];

export interface Task {
  id: string;          // "h1", "t5", etc, stable inside a month
  kind: Kind;
  text: string;
  required: number;
  done: number;
  free: TaskTemplate['free'];
  premium: TaskTemplate['premium'];
  claimed: { free: boolean; premium: boolean };
}

function currentMonthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}`;
}

function monthSeed(monthKey: string): number {
  let s = 0;
  for (const ch of monthKey) s = (s * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(s);
}

function generateTasks(monthKey: string): Task[] {
  const seed = monthSeed(monthKey);
  const tasks: Task[] = [];
  for (let i = 0; i < PASS_LENGTH; i++) {
    const tmpl = POOL[(seed + i * 31) % POOL.length];
    const amount = tmpl.amount();
    // Difficulty escalation: deeper into the pass = bigger numbers.
    const scale = 1 + Math.floor(i / 10) * 0.5; // 1x, 1.5x, 2x, 2.5x, 3x
    const required = Math.max(1, Math.round(amount * scale));
    const freeScale = 1 + Math.floor(i / 10) * 0.3;
    const premiumScale = 1 + Math.floor(i / 10) * 0.4;
    tasks.push({
      id: `t${i + 1}`,
      kind: tmpl.kind,
      text: tmpl.text(required),
      required,
      done: 0,
      free: scaleReward(tmpl.free, freeScale),
      premium: scaleReward(tmpl.premium, premiumScale),
      claimed: { free: false, premium: false },
    });
  }
  return tasks;
}

function scaleReward<T extends Record<string, number | undefined | string>>(reward: T, factor: number): T {
  const out: any = {};
  for (const k of Object.keys(reward)) {
    const v = reward[k];
    if (typeof v === 'number') out[k] = Math.round(v * factor);
    else out[k] = v;
  }
  return out;
}

interface PassRow {
  tasks: Task[];
  progress: Record<string, number>;
  claimed: Record<string, { free: boolean; premium: boolean }>;
  premium_unlocked: boolean;
}

function loadOrInit(charId: number): PassRow {
  const db = getDb();
  const monthKey = currentMonthKey();
  let row = db
    .prepare('SELECT tasks_json, progress_json, claimed_json, premium_unlocked FROM battle_pass WHERE character_id = ? AND month_key = ?')
    .get(charId, monthKey) as any;
  if (!row) {
    const tasks = generateTasks(monthKey);
    db.prepare(
      `INSERT INTO battle_pass (character_id, month_key, tasks_json, progress_json, claimed_json, premium_unlocked, generated_at)
       VALUES (?, ?, ?, '{}', '{}', 0, ?)`,
    ).run(charId, monthKey, JSON.stringify(tasks), Date.now());
    row = { tasks_json: JSON.stringify(tasks), progress_json: '{}', claimed_json: '{}', premium_unlocked: 0 };
  }
  return {
    tasks: JSON.parse(row.tasks_json),
    progress: JSON.parse(row.progress_json || '{}'),
    claimed: JSON.parse(row.claimed_json || '{}'),
    premium_unlocked: !!row.premium_unlocked,
  };
}

function saveProgress(charId: number, progress: Record<string, number>): void {
  getDb()
    .prepare('UPDATE battle_pass SET progress_json = ? WHERE character_id = ? AND month_key = ?')
    .run(JSON.stringify(progress), charId, currentMonthKey());
}

/**
 * Called from every activity route after a notable event. value defaults
 * to 1 (e.g. one kill). For "tower_clear" we pass value = floor reached so
 * we can mark high-floor tasks as complete in one shot instead of needing
 * cumulative climbs.
 */
export function trackBattlePass(charId: number, kind: Kind, value: number = 1): void {
  const db = getDb();
  // Lazy-init the current month so the first event of the month works.
  const row = db.prepare('SELECT progress_json, tasks_json FROM battle_pass WHERE character_id = ? AND month_key = ?')
    .get(charId, currentMonthKey()) as any;
  if (!row) {
    // Insert fresh row using the generator; safer to call loadOrInit which handles it.
    loadOrInit(charId);
    return trackBattlePass(charId, kind, value);
  }
  const tasks: Task[] = JSON.parse(row.tasks_json);
  const progress: Record<string, number> = JSON.parse(row.progress_json || '{}');
  let dirty = false;
  for (const t of tasks) {
    if (t.kind !== kind) continue;
    const prev = progress[t.id] || 0;
    if (prev >= t.required) continue;
    if (kind === 'tower_clear') {
      // "Reach Tower floor N" — value = floor number, set to max(prev, value).
      const next = Math.max(prev, value);
      if (next > prev) { progress[t.id] = Math.min(t.required, next); dirty = true; }
    } else if (kind === 'forge_high_enchant') {
      // "Reach +3 enchant on any item" — value = enchant count of the item.
      if (value >= 3) { progress[t.id] = t.required; dirty = true; }
    } else if (kind === 'guild_donate') {
      progress[t.id] = Math.min(t.required, prev + value);
      dirty = true;
    } else {
      progress[t.id] = Math.min(t.required, prev + value);
      dirty = true;
    }
  }
  if (dirty) saveProgress(charId, progress);
}

router.get('/', (req, res) => {
  const char = getDb().prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const pass = loadOrInit(char.id);
  const augmented = pass.tasks.map((t) => ({
    ...t,
    done: pass.progress[t.id] || 0,
    claimed: pass.claimed[t.id] || { free: false, premium: false },
  }));
  // End-of-month timestamp for the client countdown.
  const now = new Date();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  res.json({
    month_key: currentMonthKey(),
    resets_at: nextMonth.getTime(),
    premium_unlocked: pass.premium_unlocked,
    premium_unlock_cost: PREMIUM_UNLOCK_GEMS,
    tasks: augmented,
  });
});

const claimSchema = z.object({ id: z.string(), track: z.enum(['free', 'premium']) });
router.post('/claim', (req, res) => {
  const parse = claimSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const db = getDb();
  const ch = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!ch) { res.status(404).json({ error: 'No character' }); return; }
  // Audit (backend round): old flow read `pass.claimed`, granted gold/
  // gems/trial_tokens/items, then wrote the new `claimed_json` —
  // parallel POSTs with the same id+track both passed the slotClaimed
  // check and duplicated every reward. Now wrapped in BEGIN IMMEDIATE
  // with a CAS UPDATE on `claimed_json` that requires the JSON to be
  // unchanged since we read it.
  try {
    const result = db.transaction(() => {
      const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(ch.id) as Character;
      const oldRow = db.prepare('SELECT claimed_json FROM battle_pass WHERE character_id = ? AND month_key = ?').get(ch.id, currentMonthKey()) as { claimed_json: string } | undefined;
      const pass = loadOrInit(char.id);
      const task = pass.tasks.find((t) => t.id === parse.data.id);
      if (!task) { const e: any = new Error('Task not found'); e.clientSafe = true; e.status = 404; throw e; }
      const done = pass.progress[task.id] || 0;
      if (done < task.required) { const e: any = new Error(`Need ${task.required - done} more.`); e.clientSafe = true; e.status = 400; throw e; }
      const slotClaimed = pass.claimed[task.id] || { free: false, premium: false };
      if (slotClaimed[parse.data.track]) { const e: any = new Error('Already claimed.'); e.clientSafe = true; e.status = 400; throw e; }
      if (parse.data.track === 'premium' && !pass.premium_unlocked) { const e: any = new Error('Premium track not unlocked.'); e.clientSafe = true; e.status = 400; throw e; }
      // CAS the claimed_json BEFORE granting so the rewards code never
      // runs twice in parallel.
      slotClaimed[parse.data.track] = true;
      pass.claimed[task.id] = slotClaimed;
      const newJson = JSON.stringify(pass.claimed);
      const upd = db.prepare('UPDATE battle_pass SET claimed_json = ? WHERE character_id = ? AND month_key = ? AND claimed_json = ?')
        .run(newJson, ch.id, currentMonthKey(), oldRow?.claimed_json ?? '{}');
      if (upd.changes !== 1) { const e: any = new Error('Already claimed.'); e.clientSafe = true; e.status = 400; throw e; }
      const reward: Record<string, any> = parse.data.track === 'free' ? task.free : task.premium;
      if (reward.gold)    { char.gold += reward.gold; }
      let lvlRes = null as ReturnType<typeof applyXp> | null;
      if (reward.xp)      { lvlRes = applyXp(char, reward.xp); }
      if (reward.gems)    { db.prepare('UPDATE characters SET gems = gems + ?, total_gems_earned = total_gems_earned + ? WHERE id = ?').run(reward.gems, reward.gems, char.id); }
      if (reward.trial_tokens)     { db.prepare('UPDATE characters SET trial_tokens = trial_tokens + ? WHERE id = ?').run(reward.trial_tokens, char.id); }
      if (reward.forge_guarantees) { db.prepare('UPDATE characters SET forge_guarantees = forge_guarantees + ? WHERE id = ?').run(reward.forge_guarantees, char.id); }
      if (reward.item_slug) {
        const item = db.prepare('SELECT id FROM items WHERE slug = ?').get(reward.item_slug) as any;
        if (item) db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, '')").run(char.id, item.id);
      }
      db.prepare(
        `UPDATE characters SET gold = ?, xp = ?, level = ?, stat_points = ?, skill_points = ?,
           hp_max = ?, mp_max = ?, hp = hp_max, mp = mp_max WHERE id = ?`,
      ).run(char.gold, char.xp, char.level, char.stat_points, char.skill_points, char.hp_max, char.mp_max, char.id);
      return { reward, lvlRes, charName: char.name, taskText: task.text, taskId: task.id, taskKind: task.kind };
    }).immediate();
    logFromRequest(req, {
      category: 'character', action: 'battlepass_claim',
      character_id: ch.id,
      message: `${result.charName} claimed ${parse.data.track} reward of "${result.taskText}"`,
      meta: { task: result.taskId, kind: result.taskKind, track: parse.data.track, reward: result.reward },
    });
    res.json({ ok: true, reward: result.reward, levelUp: result.lvlRes && result.lvlRes.leveled ? result.lvlRes : null });
  } catch (e: any) {
    if (e?.clientSafe) { res.status(e.status || 400).json({ error: e.message }); return; }
    throw e;
  }
});

router.post('/unlock-premium', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const pass = loadOrInit(char.id);
  if (pass.premium_unlocked) { res.status(400).json({ error: 'Premium already unlocked for this month.' }); return; }
  if (((char as any).gems || 0) < PREMIUM_UNLOCK_GEMS) {
    res.status(400).json({ error: `Need ${PREMIUM_UNLOCK_GEMS} gems to unlock premium.` });
    return;
  }
  const debit = db.prepare('UPDATE characters SET gems = gems - ?, total_gems_spent = total_gems_spent + ? WHERE id = ? AND gems >= ?')
    .run(PREMIUM_UNLOCK_GEMS, PREMIUM_UNLOCK_GEMS, char.id, PREMIUM_UNLOCK_GEMS);
  if (debit.changes !== 1) { res.status(400).json({ error: 'Gem balance changed — retry.' }); return; }
  db.prepare('UPDATE battle_pass SET premium_unlocked = 1 WHERE character_id = ? AND month_key = ?')
    .run(char.id, currentMonthKey());

  logFromRequest(req, {
    category: 'payment', action: 'battlepass_premium_unlock',
    character_id: char.id,
    message: `${char.name} unlocked premium battle pass for ${currentMonthKey()}`,
    meta: { gems: PREMIUM_UNLOCK_GEMS, month: currentMonthKey() },
  });
  res.json({ ok: true });
});

export default router;
