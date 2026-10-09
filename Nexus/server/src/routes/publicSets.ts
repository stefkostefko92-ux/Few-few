import { Router } from 'express';
import { getDb } from '../db';
import { ITEM_SETS, TIER_THEMES } from '../seed/sets';

const router = Router();

/**
 * Публична (без auth) мини-версия на GET /api/sets — само за 3D витрината на
 * лендинга (marketing surface). Връща статично игрово съдържание (имена на
 * части, теми, tier) — нищо потребителско/чувствително, затова без
 * `authRequired`; общият `apiLimiter` в server.ts все пак важи (виж app.use
 * ред 129). Ограничено до няколко „витринни" сета вместо цялото ITEM_SETS,
 * за да не изтичат непубликувани/бъдещи сетове преждевременно.
 */
const SHOWCASE_SLUGS = ['wayfarer', 'ironguard', 'sylvan_marshal', 'arcane_conclave', 'nightveil', 'sunforged', 'voidshard', 'mythwoven'];

router.get('/preview', (_req, res) => {
  const db = getDb();
  const wanted = ITEM_SETS.filter((s) => SHOWCASE_SLUGS.includes(s.slug));
  const slugs = [...new Set(wanted.flatMap((s) => s.pieces))];
  const placeholders = slugs.map(() => '?').join(',');
  const items = slugs.length
    ? (db
        .prepare(`SELECT slug, name, category, sub_type, tier, rarity, icon FROM items WHERE slug IN (${placeholders})`)
        .all(...slugs) as any[])
    : [];
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  const piece = (slug: string) => bySlug.get(slug) || { slug, missing: true };
  res.json({
    sets: wanted.map((s) => ({
      slug: s.slug,
      name: s.name,
      tier: s.tier,
      rarity: s.rarity,
      class_focus: s.class_focus || null,
      pieces: s.pieces.map(piece),
      theme: s.theme,
    })),
    tier_themes: TIER_THEMES,
  });
});

export default router;
