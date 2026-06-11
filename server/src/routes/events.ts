import { Router } from 'express';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { logFromRequest } from '../lib/logger';
import type { Character } from '../types/domain';

/**
 * Seasonal events — four UTC windows per year. While a season is active
 * every hunt-kill against a season-tagged enemy family pays season
 * points. Points redeem at the event vendor for cosmetic-only rewards
 * (frames, avatars, mounts) plus a single tier-9 equipment trophy
 * unique to each season.
 *
 * Window dates are fixed UTC, so the active season is derived from
 * today's date — no scheduler needed.
 */

const router = Router();
router.use(authRequired);

interface SeasonDef {
  key: string;                // ISO-year prefix gets prepended at runtime
  slug: string;               // 'frostmoot'
  name: string;
  flavor: string;
  // Inclusive UTC date range, MM-DD.
  start: string;
  end: string;
  // Enemy family that pays points; humanoid/giant in winter, beast in
  // spring, dragon/elemental in summer, undead/demon in autumn.
  point_families: string[];
  // 4 reward slugs (cosmetic) + 1 season trophy item slug.
  rewards: Array<{ slug: string; name: string; kind: 'frame' | 'avatar' | 'mount' | 'trophy'; cost: number; flavor: string }>;
}

export const SEASONS: SeasonDef[] = [
  {
    key: 'frostmoot', slug: 'frostmoot', name: 'Frostmoot',
    flavor: 'The mid-winter rite. The realm hunts giants for hide; the giants hunt back.',
    start: '01-15', end: '02-15',
    point_families: ['giant', 'humanoid'],
    rewards: [
      { slug: 'cosmetic_frame_frostmoot', name: 'Frostmoot Wreath frame', kind: 'frame',   cost: 250,  flavor: 'Carved hawthorn rimmed in silver.' },
      { slug: 'cosmetic_avatar_frostmoot', name: 'Mid-Winter Hunter avatar', kind: 'avatar', cost: 400, flavor: 'Painted in the colours of the Frostmoot procession.' },
      { slug: 'cosmetic_mount_frostmoot', name: 'Frostmoot Direstag mount', kind: 'mount',   cost: 1200, flavor: 'Antlers the size of greatswords. Tame, mostly.' },
      { slug: 'season_trophy_frostmoot', name: 'Frostmoot Ledger of the Hunt', kind: 'trophy', cost: 800, flavor: 'A T9 amulet, season-locked.' },
    ],
  },
  {
    key: 'bloomtide', slug: 'bloomtide', name: 'Bloomtide',
    flavor: 'The thaw. Beasts wake hungry; the realm hunts them back to balance.',
    start: '04-01', end: '04-30',
    point_families: ['beast'],
    rewards: [
      { slug: 'cosmetic_frame_bloomtide', name: 'Bloomtide Garland frame',   kind: 'frame',  cost: 250,  flavor: 'Petals and hawthorn thorn.' },
      { slug: 'cosmetic_avatar_bloomtide', name: 'Spring Marshal avatar',    kind: 'avatar', cost: 400,  flavor: 'Sashed green, eyes bright.' },
      { slug: 'cosmetic_mount_bloomtide', name: 'Bloomtide Wolf-Mare mount', kind: 'mount',  cost: 1200, flavor: 'Half pelt, half temper.' },
      { slug: 'season_trophy_bloomtide', name: "Bloomtide Hunter's Wreath",  kind: 'trophy', cost: 800,  flavor: 'A T9 cloak, season-locked.' },
    ],
  },
  {
    key: 'sunhigh', slug: 'sunhigh', name: 'Sunhigh',
    flavor: 'High summer. The Wyrmkin clans ride. The Conclave throws open the gates.',
    start: '07-01', end: '07-31',
    point_families: ['dragon', 'elemental'],
    rewards: [
      { slug: 'cosmetic_frame_sunhigh', name: 'Sunhigh Halo frame',          kind: 'frame',  cost: 250,  flavor: 'A summer corona, gold on gold.' },
      { slug: 'cosmetic_avatar_sunhigh', name: 'Sunhigh Pyromancer avatar',  kind: 'avatar', cost: 400,  flavor: 'Burnt sienna, no apology.' },
      { slug: 'cosmetic_mount_sunhigh', name: 'Sunhigh Ember-Drake mount',   kind: 'mount',  cost: 1200, flavor: 'A young drake with too many opinions.' },
      { slug: 'season_trophy_sunhigh', name: "Sunhigh Ember-Crown",          kind: 'trophy', cost: 800,  flavor: 'A T9 helm, season-locked.' },
    ],
  },
  {
    key: 'emberfall', slug: 'emberfall', name: 'Emberfall',
    flavor: 'Autumn. The dead walk longer; the courts settle their debts.',
    start: '10-15', end: '11-15',
    point_families: ['undead', 'demon'],
    rewards: [
      { slug: 'cosmetic_frame_emberfall', name: 'Emberfall Ash-Halo frame',   kind: 'frame',  cost: 250,  flavor: 'Charred laurel, copper rivets.' },
      { slug: 'cosmetic_avatar_emberfall', name: 'Emberfall Reaper avatar',   kind: 'avatar', cost: 400,  flavor: 'Hood up, hand out.' },
      { slug: 'cosmetic_mount_emberfall', name: 'Emberfall Nightmare mount',  kind: 'mount',  cost: 1200, flavor: "A revenant horse that walks the line." },
      { slug: 'season_trophy_emberfall', name: "Emberfall Reaper's Ring",     kind: 'trophy', cost: 800,  flavor: 'A T9 ring, season-locked.' },
    ],
  },
];

/** Current active season — or null between windows. */
export function currentSeason(now = new Date()): { def: SeasonDef; season_key: string } | null {
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const today = `${mm}-${dd}`;
  for (const s of SEASONS) {
    if (today >= s.start && today <= s.end) {
      const year = now.getUTCFullYear();
      return { def: s, season_key: `${year}-${s.slug}` };
    }
  }
  return null;
}

/** Ensure the season's cosmetic + trophy item rows exist on demand. */
function ensureSeasonItems(s: SeasonDef) {
  const db = getDb();
  for (const r of s.rewards) {
    const have = db.prepare('SELECT 1 FROM items WHERE slug = ?').get(r.slug);
    if (have) continue;
    if (r.kind === 'trophy') {
      // Map trophy kind by season — fixed in the SeasonDef flavor text.
      const map: Record<string, { cat: string; sub: string; def: number; hp: number; mp: number; stat: number }> = {
        season_trophy_frostmoot:  { cat: 'amulet', sub: '',     def: 60, hp: 280, mp: 220, stat: 18 },
        season_trophy_bloomtide:  { cat: 'cloak',  sub: '',     def: 72, hp: 320, mp: 180, stat: 18 },
        season_trophy_sunhigh:    { cat: 'helm',   sub: '',     def: 95, hp: 300, mp: 150, stat: 20 },
        season_trophy_emberfall:  { cat: 'ring',   sub: '',     def: 40, hp: 260, mp: 200, stat: 20 },
      };
      const m = map[r.slug]!;
      db.prepare(
        `INSERT INTO items (slug, name, category, sub_type, tier, rarity, level_req, class_req,
           atk_min, atk_max, defense, hp_bonus, mp_bonus, str_bonus, dex_bonus, con_bonus,
           int_bonus, cha_bonus, wis_bonus, heal_hp, heal_mp, buy_price, sell_price, icon, description, set_slug)
         VALUES (?, ?, ?, ?, 9, 'legendary', 220, '', 0, 0, ?, ?, ?, ?, 0, ?, ?, 0, ?, 0, 0, 0, 0, ?, ?, '')`,
      ).run(r.slug, r.name, m.cat, m.sub, m.def, m.hp, m.mp, m.stat, m.stat, m.stat, m.stat, m.cat, r.flavor);
    } else {
      // Cosmetics — handled by a "cosmetic" category with no combat
      // bonuses. The profile page renders frame/avatar/mount slots from
      // these item slugs.
      db.prepare(
        `INSERT INTO items (slug, name, category, sub_type, tier, rarity, level_req, class_req,
           atk_min, atk_max, defense, hp_bonus, mp_bonus, str_bonus, dex_bonus, con_bonus,
           int_bonus, cha_bonus, wis_bonus, heal_hp, heal_mp, buy_price, sell_price, icon, description, set_slug)
         VALUES (?, ?, 'cosmetic', ?, 5, 'rare', 1, '', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ?, ?, '')`,
      ).run(r.slug, r.name, r.kind, r.kind, r.flavor);
    }
  }
}

/** Awarded from hunting.ts when a kill matches the active season's
 *  enemy family. Returns points granted so the response can surface a
 *  toast. */
export function awardSeasonPointsFromHunt(characterId: number, monsterFamily: string, monsterLevel: number): { season_key: string; points: number } | null {
  const c = currentSeason();
  if (!c) return null;
  if (!c.def.point_families.includes(monsterFamily)) return null;
  ensureSeasonItems(c.def);
  // 1 point per kill for trash; APEX (lv >= 200 boss-family) bonus
  // already happens through the regular APEX_DROPS path. Scale with
  // monster level so endgame kills aren't worthless.
  const points = Math.max(1, Math.floor(monsterLevel / 12));
  getDb()
    .prepare(
      `INSERT INTO character_event_progress (character_id, season_key, points, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(character_id, season_key) DO UPDATE SET
         points = points + excluded.points,
         updated_at = excluded.updated_at`,
    )
    .run(characterId, c.season_key, points, Date.now());
  return { season_key: c.season_key, points };
}

router.get('/', (req, res) => {
  const db = getDb();
  const c = currentSeason();
  const ch = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!c) {
    // Between windows — show countdown to the next season.
    const now = new Date();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const today = `${mm}-${dd}`;
    const next = SEASONS.find((s) => s.start > today) || SEASONS[0];
    res.json({ active: false, next_season: { name: next.name, slug: next.slug, starts: next.start } });
    return;
  }
  ensureSeasonItems(c.def);
  const progress = ch ? db.prepare('SELECT points, claimed_json FROM character_event_progress WHERE character_id = ? AND season_key = ?').get(ch.id, c.season_key) as { points: number; claimed_json: string } | undefined : undefined;
  const claimed: string[] = progress ? JSON.parse(progress.claimed_json || '[]') : [];
  res.json({
    active: true,
    season_key: c.season_key,
    season: {
      slug: c.def.slug, name: c.def.name, flavor: c.def.flavor,
      window: { start: c.def.start, end: c.def.end },
      point_families: c.def.point_families,
    },
    points: progress?.points || 0,
    rewards: c.def.rewards.map((r) => ({ ...r, owned: claimed.includes(r.slug) })),
  });
});

router.post('/claim', (req, res) => {
  const rewardSlug = String((req.body || {}).slug || '');
  if (!rewardSlug) { res.status(400).json({ error: 'slug required' }); return; }
  const c = currentSeason();
  if (!c) { res.status(400).json({ error: 'No season is active.' }); return; }
  const reward = c.def.rewards.find((r) => r.slug === rewardSlug);
  if (!reward) { res.status(404).json({ error: 'Reward not on this season vendor.' }); return; }
  ensureSeasonItems(c.def);
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  try {
    db.transaction(() => {
      // Atomic claim — gate on points >= cost AND not already claimed.
      const prog = db.prepare('SELECT points, claimed_json FROM character_event_progress WHERE character_id = ? AND season_key = ?').get(char.id, c.season_key) as { points: number; claimed_json: string } | undefined;
      const currentPoints = prog?.points || 0;
      const claimed: string[] = prog ? JSON.parse(prog.claimed_json || '[]') : [];
      if (claimed.includes(rewardSlug)) { const e: any = new Error('Already redeemed this season.'); e.clientSafe = true; e.status = 400; throw e; }
      if (currentPoints < reward.cost) { const e: any = new Error(`Need ${reward.cost} season points (have ${currentPoints}).`); e.clientSafe = true; e.status = 400; throw e; }
      claimed.push(rewardSlug);
      const upd = db.prepare(
        'UPDATE character_event_progress SET points = points - ?, claimed_json = ?, updated_at = ? WHERE character_id = ? AND season_key = ? AND points >= ?',
      ).run(reward.cost, JSON.stringify(claimed), Date.now(), char.id, c.season_key, reward.cost);
      if (upd.changes !== 1) { const e: any = new Error('Already redeemed this season.'); e.clientSafe = true; e.status = 400; throw e; }
      // Grant the item.
      const item = db.prepare('SELECT id FROM items WHERE slug = ?').get(rewardSlug) as { id: number } | undefined;
      if (!item) { const e: any = new Error('Item missing from catalog'); e.clientSafe = true; e.status = 500; throw e; }
      db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, '')").run(char.id, item.id);
    }).immediate();
    logFromRequest(req, {
      category: 'inventory', action: 'season_claim',
      character_id: char.id,
      message: `${char.name} redeemed ${reward.name} from ${c.def.name}`,
      meta: { season_key: c.season_key, slug: rewardSlug, kind: reward.kind, cost: reward.cost },
    });
    res.json({ ok: true, granted: reward });
  } catch (e: any) {
    if (e?.clientSafe) { res.status(e.status || 400).json({ error: e.message }); return; }
    throw e;
  }
});

export default router;
