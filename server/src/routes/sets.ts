import { Router } from 'express';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { ITEM_SETS } from '../seed/sets';

const router = Router();
router.use(authRequired);

router.get('/', (_req, res) => {
  const db = getDb();
  const slugs = ITEM_SETS.flatMap((s) => s.pieces);
  const placeholders = slugs.map(() => '?').join(',');
  const items = db
    .prepare(`SELECT slug, name, category, sub_type, tier, rarity, level_req FROM items WHERE slug IN (${placeholders})`)
    .all(...slugs) as any[];
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  res.json({
    sets: ITEM_SETS.map((s) => ({
      slug: s.slug,
      name: s.name,
      tier: s.tier,
      rarity: s.rarity,
      class_focus: s.class_focus || null,
      lore: s.lore,
      pieces: s.pieces.map((slug) => bySlug.get(slug) || { slug, missing: true }),
      bonus_2: s.bonus_2 || null,
      bonus_4: s.bonus_4 || null,
      bonus_6: s.bonus_6 || null,
    })),
  });
});

export default router;
