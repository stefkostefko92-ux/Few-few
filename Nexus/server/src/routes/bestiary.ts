import { Router } from 'express';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';

const router = Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const db = getDb();
  const ch = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!ch) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const all = db.prepare('SELECT * FROM monsters ORDER BY level').all() as any[];
  const found = db
    .prepare('SELECT monster_slug, kills, first_killed_at, last_killed_at FROM bestiary WHERE character_id = ?')
    .all(ch.id) as { monster_slug: string; kills: number; first_killed_at: number; last_killed_at: number }[];
  const foundMap = new Map(found.map((f) => [f.monster_slug, f]));
  const list = all.map((m) => {
    const entry = foundMap.get(m.slug);
    if (!entry) {
      return {
        slug: m.slug,
        name: '???',
        level: m.level,
        family: m.family,
        region: m.region,
        sprite: m.sprite,
        discovered: false,
        kills: 0,
      };
    }
    return {
      slug: m.slug,
      name: m.name,
      level: m.level,
      family: m.family,
      region: m.region,
      sprite: m.sprite,
      hp: m.hp,
      atk_min: m.atk_min,
      atk_max: m.atk_max,
      defense: m.defense,
      xp_reward: m.xp_reward,
      discovered: true,
      kills: entry.kills,
      first_killed_at: entry.first_killed_at,
      last_killed_at: entry.last_killed_at,
    };
  });
  // Колекции по региони: избий ВСИЧКИ чудовища в регион → еднократна
  // награда (злато+гемове, формулно по нивото на региона). Дългосрочната
  // „collect them all" кука — бестиарият вече не е само за четене.
  const claims = new Set(
    (db.prepare('SELECT region FROM bestiary_region_claims WHERE character_id = ?').all(ch.id) as { region: string }[])
      .map((r) => r.region),
  );
  const byRegion = new Map<string, { total: number; killed: number; maxLevel: number }>();
  for (const m of all) {
    const r = byRegion.get(m.region) || { total: 0, killed: 0, maxLevel: 0 };
    r.total++;
    r.maxLevel = Math.max(r.maxLevel, m.level);
    if (foundMap.has(m.slug)) r.killed++;
    byRegion.set(m.region, r);
  }
  const regions = [...byRegion.entries()].map(([region, r]) => ({
    region,
    total: r.total,
    killed: r.killed,
    complete: r.killed >= r.total,
    claimed: claims.has(region),
    reward_gold: rewardGold(r.maxLevel),
    reward_gems: rewardGems(r.maxLevel),
  }));

  res.json({
    bestiary: list,
    total: all.length,
    discovered: found.length,
    regions,
  });
});

// Формулни награди по върховото ниво на региона — автоматично последователни
// и за бъдещи региони (нищо ръчно): злато ≈ 60×maxLevel, гемове 10 + 5 на
// всеки 100 нива.
function rewardGold(maxLevel: number): number { return 60 * maxLevel; }
function rewardGems(maxLevel: number): number { return 10 + Math.floor(maxLevel / 100) * 5; }

router.post('/claim', (req, res) => {
  const region = String((req.body || {}).region || '');
  if (!region) { res.status(400).json({ error: 'region required' }); return; }
  const db = getDb();
  const ch = db.prepare('SELECT id, name FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number; name: string } | undefined;
  if (!ch) { res.status(404).json({ error: 'No character' }); return; }
  const stats = db.prepare(
    `SELECT COUNT(*) AS total, MAX(level) AS max_level,
            SUM(CASE WHEN b.monster_slug IS NOT NULL THEN 1 ELSE 0 END) AS killed
     FROM monsters m
     LEFT JOIN bestiary b ON b.monster_slug = m.slug AND b.character_id = ?
     WHERE m.region = ?`,
  ).get(ch.id, region) as { total: number; max_level: number; killed: number };
  if (!stats.total) { res.status(404).json({ error: 'Unknown region' }); return; }
  if (stats.killed < stats.total) {
    res.status(400).json({ error: `Slay every beast first (${stats.killed}/${stats.total}).` });
    return;
  }
  const gold = rewardGold(stats.max_level);
  const gems = rewardGems(stats.max_level);
  try {
    // Атомарно: PRIMARY KEY(character_id, region) прави двойния claim
    // невъзможен — второто INSERT гърми и транзакцията се отменя.
    db.transaction(() => {
      db.prepare('INSERT INTO bestiary_region_claims (character_id, region, claimed_at) VALUES (?, ?, ?)')
        .run(ch.id, region, Date.now());
      db.prepare('UPDATE characters SET gold = gold + ?, gems = gems + ?, total_gold_earned = total_gold_earned + ?, total_gems_earned = total_gems_earned + ? WHERE id = ?')
        .run(gold, gems, gold, gems, ch.id);
    }).immediate();
  } catch {
    res.status(400).json({ error: 'Already claimed.' });
    return;
  }
  res.json({ ok: true, region, gold, gems });
});

export default router;
