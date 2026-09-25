import { Router } from 'express';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { ITEM_SETS, TIER_THEMES } from '../seed/sets';
import { itemSources } from '../game/setSources';

const router = Router();
router.use(authRequired);

router.get('/', (_req, res) => {
  const db = getDb();
  const slugs = [...new Set(ITEM_SETS.flatMap((s) => [...s.pieces, ...(s.legacy_pieces ?? [])]))];
  const placeholders = slugs.map(() => '?').join(',');
  const items = db
    .prepare(`SELECT slug, name, category, sub_type, tier, rarity, level_req, class_req, icon FROM items WHERE slug IN (${placeholders})`)
    .all(...slugs) as any[];
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  const piece = (slug: string) => ({ ...(bySlug.get(slug) || { slug, missing: true }), sources: itemSources(slug) });
  res.json({
    sets: ITEM_SETS.map((s) => ({
      slug: s.slug,
      name: s.name,
      tier: s.tier,
      rarity: s.rarity,
      class_focus: s.class_focus || null,
      lore: s.lore,
      pieces: s.pieces.map(piece),
      // Адитивни полета (преработка на сетовете): визуалната тема (договор
      // с 3D иконите) и старите общи предмети, които още се броят за сета.
      theme: s.theme,
      legacy_pieces: (s.legacy_pieces ?? []).map((slug) => bySlug.get(slug) || { slug, missing: true }),
      bonus_2: s.bonus_2 || null,
      bonus_4: s.bonus_4 || null,
      bonus_6: s.bonus_6 || null,
    })),
    tier_themes: TIER_THEMES,
  });
});

export default router;
