import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { applyXp } from '../game/progression';
import { deriveStats, buildHeroActor } from '../game/stats';
import { simulateCombat } from '../game/combat';
import { loadEquipped } from '../game/equipment';
import { applyGuildMultipliers } from '../game/rewards';
import { assertReady, setCooldown } from '../game/cooldowns';
import { DUNGEONS } from '../seed/dungeons';
import { logFromRequest } from '../lib/logger';
import type { Character, Monster } from '../types/domain';

/**
 * Mythic+ — endless tier-scaled re-runs of scripted dungeons.
 *
 * The four (now fourteen) scripted dungeons each have a level gate,
 * stages, a clear bonus, and a loot pool. After a player clears a
 * scripted dungeon once, the same dungeon becomes available on a
 * Mythic+ track where every monster's HP and attack scale by
 * `(1 + tier * 0.12)`. The player picks a tier; each successful clear
 * unlocks the next tier and pays gold + XP scaled accordingly. Each
 * tenth tier also drops a guaranteed tier-9 equipment piece from the
 * dungeon's loot pool.
 *
 * Pity protection: five consecutive failures unlock the next tier as
 * if you'd cleared the current one — so a stuck player makes progress.
 */

const router = Router();
router.use(authRequired);

const TIER_SCALE = 0.12; // 12% per tier

function ensureRun(charId: number, dungeonSlug: string): { character_id: number; dungeon_slug: string; best_tier: number; current_tier: number; current_stage: number; run_seed: number; run_started_at: number; consecutive_fails: number; updated_at: number } {
  const db = getDb();
  let row = db.prepare('SELECT * FROM mythic_plus_progress WHERE character_id = ? AND dungeon_slug = ?').get(charId, dungeonSlug) as any;
  if (row) return row;
  db.prepare(
    `INSERT INTO mythic_plus_progress (character_id, dungeon_slug, best_tier, current_tier, current_stage, run_seed, run_started_at, consecutive_fails, updated_at)
     VALUES (?, ?, 0, 0, 0, 0, 0, 0, ?)`,
  ).run(charId, dungeonSlug, Date.now());
  return db.prepare('SELECT * FROM mythic_plus_progress WHERE character_id = ? AND dungeon_slug = ?').get(charId, dungeonSlug) as any;
}

router.get('/', (req, res) => {
  const db = getDb();
  const ch = db.prepare('SELECT id, level FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number; level: number } | undefined;
  if (!ch) { res.status(404).json({ error: 'No character' }); return; }
  // A dungeon is eligible for M+ if the player has cleared it at least
  // once on the regular path (we read dungeons_cleared as a coarse
  // gate; per-dungeon tracking is a future polish).
  const rows = db.prepare('SELECT * FROM mythic_plus_progress WHERE character_id = ?').all(ch.id) as any[];
  const dungeons = DUNGEONS
    .filter((d) => ch.level >= d.level_req)
    .map((d) => {
      const p = rows.find((r) => r.dungeon_slug === d.slug) || { best_tier: 0, current_tier: 0, current_stage: 0, consecutive_fails: 0 };
      return {
        slug: d.slug, name: d.name, region: d.region, level_req: d.level_req,
        stages: d.stages.length,
        best_tier: p.best_tier,
        current_tier: p.current_tier,
        current_stage: p.current_stage,
        consecutive_fails: p.consecutive_fails,
        next_tier_scaling_pct: Math.round(((p.current_tier + 1) * TIER_SCALE) * 100),
      };
    });
  res.json({ dungeons, tier_scale_pct: TIER_SCALE * 100 });
});

const enterSchema = z.object({ slug: z.string(), tier: z.number().int().min(1).max(40) });
router.post('/enter', (req, res) => {
  const parse = enterSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const dungeon = DUNGEONS.find((d) => d.slug === parse.data.slug);
  if (!dungeon) { res.status(404).json({ error: 'Unknown dungeon' }); return; }
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  if (char.level < dungeon.level_req) { res.status(400).json({ error: `Requires level ${dungeon.level_req}.` }); return; }
  try { assertReady(char.id, 'dungeon'); }
  catch (e: any) { res.status(429).json({ error: e.message, cooldown_ms: e.cooldownMs, action: 'dungeon' }); return; }
  const tier = parse.data.tier;
  const prog = ensureRun(char.id, dungeon.slug);
  if (tier > prog.best_tier + 1) { res.status(400).json({ error: `Tier ${tier} locked — clear tier ${prog.best_tier + 1} first.` }); return; }
  try {
    db.transaction(() => {
      db.prepare(
        `UPDATE mythic_plus_progress SET current_tier = ?, current_stage = 0, run_seed = ?, run_started_at = ?, updated_at = ?
         WHERE character_id = ? AND dungeon_slug = ?`,
      ).run(tier, Math.floor(Math.random() * 1e9), Date.now(), Date.now(), char.id, dungeon.slug);
    }).immediate();
    res.json({ ok: true, dungeon: dungeon.slug, tier, stages: dungeon.stages.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/strike', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const slug = String((req.body || {}).slug || '');
  const dungeon = DUNGEONS.find((d) => d.slug === slug);
  if (!dungeon) { res.status(404).json({ error: 'Unknown dungeon' }); return; }
  // Wounded guard — striking a tier-scaled stage at 1 HP is a
  // guaranteed wipe that resets the whole run.
  if (char.hp <= Math.floor(char.hp_max * 0.1)) {
    res.status(400).json({ error: 'Too wounded to fight. Rest first.' });
    return;
  }
  const prog = db.prepare('SELECT * FROM mythic_plus_progress WHERE character_id = ? AND dungeon_slug = ?').get(char.id, slug) as any;
  if (!prog || !prog.run_started_at) { res.status(400).json({ error: 'No active Mythic+ run. POST /enter first.' }); return; }
  if (prog.current_stage >= dungeon.stages.length) { res.status(400).json({ error: 'Run already cleared. POST /claim.' }); return; }
  const stage = dungeon.stages[prog.current_stage];
  const baseMon = db.prepare('SELECT * FROM monsters WHERE slug = ?').get(stage.monster_slug) as Monster | undefined;
  if (!baseMon) { res.status(500).json({ error: 'Stage monster missing' }); return; }
  // Tier scaling.
  const scale = 1 + prog.current_tier * TIER_SCALE;
  const foe = {
    name: baseMon.name + ` (M+${prog.current_tier})`,
    side: 'foe' as const,
    level: baseMon.level,
    hp: Math.round(baseMon.hp * scale),
    hp_max: Math.round(baseMon.hp * scale),
    atk_min: Math.round(baseMon.atk_min * scale),
    atk_max: Math.round(baseMon.atk_max * scale),
    defense: Math.round(baseMon.defense * scale),
    speed: baseMon.speed,
    crit_chance: 0.08,
    dodge_chance: 0.03,
    sprite: baseMon.sprite,
  };
  const derived = deriveStats(char, loadEquipped(char.id));
  const hero = buildHeroActor(char, derived, char.hp);
  const result = simulateCombat(hero, foe);
  try {
    const out = db.transaction(() => {
      if (result.winner === 'hero') {
        // Advance stage; clamp HP to whatever survived.
        db.prepare('UPDATE characters SET hp = ? WHERE id = ?').run(Math.max(1, result.hero.hp), char.id);
        db.prepare('UPDATE mythic_plus_progress SET current_stage = current_stage + 1, updated_at = ? WHERE character_id = ? AND dungeon_slug = ?').run(Date.now(), char.id, slug);
        return { advanced: true };
      }
      // Run wiped. Bump fail count; reset run.
      db.prepare('UPDATE characters SET hp = 1 WHERE id = ?').run(char.id);
      const newFails = prog.consecutive_fails + 1;
      // Pity at five fails: unlock next tier as if cleared.
      let pityUnlocked = false;
      if (newFails >= 5) {
        const newBest = Math.max(prog.best_tier, prog.current_tier);
        db.prepare('UPDATE mythic_plus_progress SET best_tier = ?, consecutive_fails = 0, current_stage = 0, run_started_at = 0, updated_at = ? WHERE character_id = ? AND dungeon_slug = ?').run(newBest, Date.now(), char.id, slug);
        pityUnlocked = true;
      } else {
        db.prepare('UPDATE mythic_plus_progress SET consecutive_fails = ?, current_stage = 0, run_started_at = 0, updated_at = ? WHERE character_id = ? AND dungeon_slug = ?').run(newFails, Date.now(), char.id, slug);
      }
      setCooldown(char.id, 'dungeon');
      return { advanced: false, pityUnlocked };
    }).immediate();
    res.json({
      success: result.winner === 'hero',
      hero: result.hero,
      foe: result.foe,
      rounds: result.rounds,
      stage_cleared: out.advanced,
      pity_unlocked: (out as any).pityUnlocked || false,
      next_stage: out.advanced ? prog.current_stage + 1 : 0,
      total_stages: dungeon.stages.length,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/claim', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const slug = String((req.body || {}).slug || '');
  const dungeon = DUNGEONS.find((d) => d.slug === slug);
  if (!dungeon) { res.status(404).json({ error: 'Unknown dungeon' }); return; }
  try {
    const out = db.transaction(() => {
      const prog = db.prepare('SELECT * FROM mythic_plus_progress WHERE character_id = ? AND dungeon_slug = ?').get(char.id, slug) as any;
      if (!prog || prog.current_stage < dungeon.stages.length) { const e: any = new Error('Run not cleared.'); e.clientSafe = true; e.status = 400; throw e; }
      // Atomic guard: only the first /claim for this run wins.
      const guard = db.prepare('UPDATE mythic_plus_progress SET run_started_at = 0 WHERE character_id = ? AND dungeon_slug = ? AND run_started_at = ?').run(char.id, slug, prog.run_started_at);
      if (guard.changes !== 1) { const e: any = new Error('Already claimed.'); e.clientSafe = true; e.status = 400; throw e; }
      const tier = prog.current_tier;
      // Reward = scripted clear bonus, scaled by tier.
      const scale = 1 + tier * TIER_SCALE;
      const baseXp = Math.round(dungeon.xp_bonus * scale);
      const baseGold = Math.round(dungeon.gold_bonus * scale);
      const r = applyGuildMultipliers(char.id, baseGold, baseXp);
      char.gold += r.gold;
      const lvlRes = applyXp(char, r.xp);
      // Tier-10 milestone drop: guaranteed loot-pool item.
      let milestoneDrop: string | null = null;
      if (tier > 0 && tier % 10 === 0 && dungeon.loot_pool.length > 0) {
        milestoneDrop = dungeon.loot_pool[Math.floor(Math.random() * dungeon.loot_pool.length)];
        const item = db.prepare('SELECT id FROM items WHERE slug = ?').get(milestoneDrop) as { id: number } | undefined;
        if (item) db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, '')").run(char.id, item.id);
      }
      // Best-tier bookkeeping; reset fails on success.
      const newBest = Math.max(prog.best_tier, tier);
      db.prepare(
        `UPDATE mythic_plus_progress SET best_tier = ?, current_tier = 0, current_stage = 0,
           consecutive_fails = 0, updated_at = ? WHERE character_id = ? AND dungeon_slug = ?`,
      ).run(newBest, Date.now(), char.id, slug);
      db.prepare(
        `UPDATE characters SET gold = ?, xp = ?, level = ?, stat_points = ?, skill_points = ?,
           hp_max = ?, mp_max = ?, hp = ?, mp = ?,
           dungeons_cleared = dungeons_cleared + 1,
           total_xp_earned = total_xp_earned + ?, total_gold_earned = total_gold_earned + ?
         WHERE id = ?`,
      ).run(char.gold, char.xp, char.level, char.stat_points, char.skill_points, char.hp_max, char.mp_max, char.hp, char.mp, r.xp, r.gold, char.id);
      // Баланс: победният claim СЪЩО сетва dungeon cooldown-а. Преди се
      // сетваше само при wipe (:158) → печелившият chain-ваше M+ безкрайно
      // без никакъв pacing — най-голямата дупка от одита на дейностите.
      setCooldown(char.id, 'dungeon');
      return { tier, xp: r.xp, gold: r.gold, lvlRes, milestoneDrop };
    }).immediate();
    logFromRequest(req, {
      category: 'inventory', action: 'mythicplus_clear',
      character_id: char.id,
      message: `${char.name} cleared ${dungeon.name} M+${out.tier}`,
      meta: { dungeon: dungeon.slug, tier: out.tier, gold: out.gold, xp: out.xp, drop: out.milestoneDrop },
    });
    res.json({ ok: true, ...out });
  } catch (e: any) {
    if (e?.clientSafe) { res.status(e.status || 400).json({ error: e.message }); return; }
    throw e;
  }
});

export default router;
