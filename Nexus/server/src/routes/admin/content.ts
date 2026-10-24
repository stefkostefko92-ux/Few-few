/**
 * Статично съдържание (живее в кода, seed/*.ts): сетове, подземия, козметика,
 * постижения, световни босове — само преглед за панела. Продуктите в
 * магазина (реални пари) имат и замени през `settings` (цена / включен):
 * каталогът НЕ се мести в базата (game/productOverrides.ts).
 */
import type { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../db';
import { audit } from '../../lib/adminKit';
import { ITEM_SETS } from '../../seed/sets';
import { DUNGEONS } from '../../seed/dungeons';
import { AVATARS, FRAMES } from '../../seed/cosmetics';
import { ACHIEVEMENTS } from '../../game/achievements';
import { REALM_BOSSES } from '../../game/realmBoss';
import {
  PRODUCT_MAX_CENTS, PRODUCT_MIN_CENTS, effectiveProducts, getProductOverride, setProductOverride,
} from '../../game/productOverrides';
import { destructiveLimiter, parseBody } from './kit';

const overrideSchema = z.object({
  // null = върни цената от каталога.
  price_cents: z.number().int().min(PRODUCT_MIN_CENTS).max(PRODUCT_MAX_CENTS).nullable().optional(),
  enabled: z.boolean().optional(),
}).strict();

export function registerContent(router: Router): void {
  router.get('/content/sets', (_req, res) => {
    res.json({
      sets: ITEM_SETS.map((s) => ({
        slug: s.slug, name: s.name, tier: s.tier, rarity: s.rarity, class_focus: s.class_focus ?? '',
        level_req: s.level_req ?? null, pieces: s.pieces, lore: s.lore, family: s.theme.family,
        bonus_2: s.bonus_2 ?? null, bonus_4: s.bonus_4 ?? null, bonus_6: s.bonus_6 ?? null,
      })),
    });
  });

  router.get('/content/dungeons', (_req, res) => {
    res.json({
      dungeons: DUNGEONS.map((d) => ({
        slug: d.slug, name: d.name, region: d.region, level_req: d.level_req, energy_cost: d.energy_cost,
        cooldown_hours: d.cooldown_hours, xp_bonus: d.xp_bonus, gold_bonus: d.gold_bonus,
        stages: d.stages.map((s) => s.monster_slug), loot_pool: d.loot_pool,
      })),
    });
  });

  router.get('/content/cosmetics', (_req, res) => {
    res.json({ avatars: AVATARS, frames: FRAMES });
  });

  router.get('/content/achievements', (_req, res) => {
    const db = getDb();
    const counts = new Map((db.prepare('SELECT slug, COUNT(*) AS n FROM achievements GROUP BY slug').all() as { slug: string; n: number }[]).map((r) => [r.slug, r.n]));
    res.json({
      achievements: ACHIEVEMENTS.map((a) => ({ slug: a.slug, name: a.name, description: a.description, icon: a.icon, title: a.title ?? '', gold: a.goldReward ?? 0, xp: a.xpReward ?? 0, unlocked_by: counts.get(a.slug) ?? 0 })),
    });
  });

  router.get('/content/realm-bosses', (_req, res) => {
    res.json({ bosses: REALM_BOSSES });
  });

  /* ===================== Продукти (реални пари) ===================== */
  router.get('/content/products', (_req, res) => {
    res.json({ products: effectiveProducts(), limits: { min_cents: PRODUCT_MIN_CENTS, max_cents: PRODUCT_MAX_CENTS } });
  });

  /** Замяна на цена/видимост. Важи за НОВИ поръчки; старите пазят сумата си. */
  router.put('/content/products/:kind', destructiveLimiter, (req, res) => {
    const kind = String(req.params.kind);
    const product = effectiveProducts().find((p) => p.kind === kind);
    if (!product) { res.status(404).json({ error: 'Unknown product' }); return; }
    const body = parseBody(overrideSchema, req, res); if (!body) return;
    if (body.price_cents === undefined && body.enabled === undefined) { res.status(400).json({ error: 'No fields to update' }); return; }
    const before = getProductOverride(kind);
    const next = { ...before };
    if (body.price_cents !== undefined) {
      if (body.price_cents === null || body.price_cents === product.base_price_cents) delete next.price_cents;
      else next.price_cents = body.price_cents;
    }
    if (body.enabled !== undefined) {
      if (body.enabled) delete next.enabled;
      else next.enabled = false;
    }
    setProductOverride(kind, next, req.auth!.uid);
    const after = effectiveProducts().find((p) => p.kind === kind)!;
    audit(req, res, {
      action: 'product_override', targetType: 'product', level: 'warn',
      before: { price_cents: product.price_cents, enabled: product.enabled },
      after: { price_cents: after.price_cents, enabled: after.enabled },
      meta: { kind, base_price_cents: product.base_price_cents },
    });
    res.json({ ok: true, product: after });
  });
}
