import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { logFromRequest } from '../lib/logger';
import type { Character } from '../types/domain';
import { TRIAL_GEAR_ITEMS, ensureRuntimeItems } from '../seed/runtimeItems';

const router = Router();
router.use(authRequired);

/* =========================================================================
 * Trial Cache — a vendor only accessible to Tower of Trials climbers.
 *
 * Currency: trial_tokens (column on characters). Earned exclusively from
 * the Tower (1 per clear, 2 per Vault clear). Cannot be bought with gold
 * or gems — this is what makes Tower climbing meaningful even after the
 * raw gold/xp drops have stopped feeling juicy.
 *
 * Offerings are split into two kinds:
 *   • Permanent — unique gear pieces and cosmetic frames. Each can be
 *     bought once per character (logged in trial_purchases).
 *   • Consumable — forge_guarantees and mythic elixirs. Repeatable.
 *
 * The forge guarantee directly hooks into /forge/enchant: when forge
 * sees forge_guarantees > 0 on the character, the next enchant attempt
 * cannot roll "shatter" (the guarantee is consumed regardless of bucket).
 * That ties Tower → Cache → Forge in a tight loop.
 * ======================================================================= */

interface Offering {
  slug: string;
  name: string;
  description: string;
  cost: number;
  category: 'gear' | 'consumable' | 'cosmetic';
  effect: {
    item_slug?: string;     // grants an item by slug from the items table
    forge_guarantees?: number;
    elixir_minutes?: number;
    elixir_percent?: number;
    elixir_stat?: 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';
  };
  once: boolean;
}

const OFFERINGS: Offering[] = [
  {
    slug: 'forge_guarantee',
    name: 'Anvil Ward',
    description: 'Your next forge enchant cannot shatter. Stacks if bought repeatedly.',
    cost: 3,
    category: 'consumable',
    effect: { forge_guarantees: 1 },
    once: false,
  },
  {
    slug: 'mythic_strength',
    name: 'Crowned Elixir of Iron',
    description: '+30% Strength for 60 minutes. The blade speaks louder than the man.',
    cost: 5,
    category: 'consumable',
    effect: { elixir_minutes: 60, elixir_percent: 30, elixir_stat: 'strength' },
    once: false,
  },
  {
    slug: 'mythic_dexterity',
    name: 'Crowned Elixir of Wind',
    description: '+30% Dexterity for 60 minutes. Reflex is its own armour.',
    cost: 5,
    category: 'consumable',
    effect: { elixir_minutes: 60, elixir_percent: 30, elixir_stat: 'dexterity' },
    once: false,
  },
  {
    slug: 'mythic_intelligence',
    name: 'Crowned Elixir of Mind',
    description: '+30% Intelligence for 60 minutes. The world bends to discipline.',
    cost: 5,
    category: 'consumable',
    effect: { elixir_minutes: 60, elixir_percent: 30, elixir_stat: 'intelligence' },
    once: false,
  },
  {
    slug: 'trial_helm',
    name: 'Trial Crown',
    description: 'A relic helm awarded to climbers. +35 HP, +6 Defense.',
    cost: 12,
    category: 'gear',
    effect: { item_slug: 'trial_crown' },
    once: true,
  },
  {
    slug: 'trial_armor',
    name: 'Trial Aegis',
    description: 'Plate forged from compressed floor-energy. +62 HP, +13 Defense.',
    cost: 18,
    category: 'gear',
    effect: { item_slug: 'trial_aegis' },
    once: true,
  },
  {
    slug: 'trial_blade',
    name: 'Wyrmsong, Climber\'s Blade',
    description: 'A legendary one-hand sword. Strikes harder the higher you climb. Scaling weapon.',
    cost: 25,
    category: 'gear',
    effect: { item_slug: 'wyrmsong_blade' },
    once: true,
  },
];

// On first access we materialise the unique gear items in the items table.
// Статовете живеят в seed/runtimeItems.ts (по кривата, game/itemCurve.ts);
// UPSERT веднъж на процес → стар ред получава текущите статове без ре-сийд.
function ensureUniqueItems(): void {
  ensureRuntimeItems(getDb(), TRIAL_GEAR_ITEMS);
}

function getChar(uid: number): Character | undefined {
  return getDb().prepare('SELECT * FROM characters WHERE user_id = ?').get(uid) as Character | undefined;
}

router.get('/', (req, res) => {
  ensureUniqueItems();
  const char = getChar(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const bought = getDb()
    .prepare('SELECT slug FROM trial_purchases WHERE character_id = ?')
    .all(char.id) as { slug: string }[];
  const owned = new Set(bought.map((b) => b.slug));
  res.json({
    tokens: (char as any).trial_tokens || 0,
    forge_guarantees: (char as any).forge_guarantees || 0,
    offerings: OFFERINGS.map((o) => ({
      ...o,
      already_owned: o.once && owned.has(o.slug),
    })),
  });
});

const buySchema = z.object({ slug: z.string() });
router.post('/buy', (req, res) => {
  ensureUniqueItems();
  const parse = buySchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const offering = OFFERINGS.find((o) => o.slug === parse.data.slug);
  if (!offering) { res.status(404).json({ error: 'Unknown offering' }); return; }
  const db = getDb();
  const char = getChar(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }

  // Audit (backend round): the previous flow checked `once` ownership,
  // then debited, then INSERTed into trial_purchases. Two parallel
  // /buy calls both saw owned=false and both debited; the second
  // INSERT failed on PK so the player ended up minus 12-25 trial
  // tokens with nothing to show for it. Fix: for once-only offerings,
  // INSERT into trial_purchases FIRST (guard) then debit + grant. For
  // repeatable offerings, BEGIN IMMEDIATE serialises and the atomic
  // debit gates everything else.
  try {
    const result = db.transaction(() => {
      const tokens = (char as any).trial_tokens || 0;
      if (tokens < offering.cost) { const e: any = new Error(`Need ${offering.cost} Trial Tokens (you have ${tokens}).`); e.clientSafe = true; e.status = 400; throw e; }
      if (offering.once) {
        // INSERT OR IGNORE returns changes=0 if the row already exists;
        // that means the second parallel caller bails BEFORE debiting.
        const claim = db.prepare('INSERT OR IGNORE INTO trial_purchases (character_id, slug, bought_at) VALUES (?, ?, ?)')
          .run(char.id, offering.slug, Date.now());
        if (claim.changes !== 1) { const e: any = new Error('Already claimed once.'); e.clientSafe = true; e.status = 400; throw e; }
      }
      const debit = db
        .prepare('UPDATE characters SET trial_tokens = trial_tokens - ? WHERE id = ? AND trial_tokens >= ?')
        .run(offering.cost, char.id, offering.cost);
      if (debit.changes !== 1) { const e: any = new Error('Token balance changed — retry.'); e.clientSafe = true; e.status = 400; throw e; }
      if (offering.effect.item_slug) {
        const item = db.prepare('SELECT id FROM items WHERE slug = ?').get(offering.effect.item_slug) as any;
        if (item) {
          db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot, soul_bound) VALUES (?, ?, 1, 0, '', 1)").run(char.id, item.id);
        }
      }
      if (offering.effect.forge_guarantees) {
        db.prepare('UPDATE characters SET forge_guarantees = forge_guarantees + ? WHERE id = ?')
          .run(offering.effect.forge_guarantees, char.id);
      }
      if (offering.effect.elixir_minutes && offering.effect.elixir_stat) {
        const row = db.prepare('SELECT active_buffs FROM characters WHERE id = ?').get(char.id) as any;
        const buffs = JSON.parse(row?.active_buffs || '[]');
        buffs.push({
          stat: offering.effect.elixir_stat,
          percent: offering.effect.elixir_percent || 30,
          expires_at: Date.now() + (offering.effect.elixir_minutes || 60) * 60_000,
        });
        db.prepare('UPDATE characters SET active_buffs = ? WHERE id = ?').run(JSON.stringify(buffs), char.id);
      }
      return { tokens_remaining: tokens - offering.cost };
    }).immediate();
    logFromRequest(req, {
      category: 'inventory', action: 'trial_cache_buy',
      character_id: char.id,
      message: `${char.name} redeemed ${offering.cost}× Trial Token for ${offering.name}`,
      meta: { slug: offering.slug, cost: offering.cost, category: offering.category },
    });
    res.json({ ok: true, name: offering.name, tokens_remaining: result.tokens_remaining });
  } catch (e: any) {
    if (e?.clientSafe) { res.status(e.status || 400).json({ error: e.message }); return; }
    throw e;
  }
});

export default router;
