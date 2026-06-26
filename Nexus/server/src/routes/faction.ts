import { Router } from 'express';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { logFromRequest } from '../lib/logger';
import type { Character } from '../types/domain';

/**
 * Three factions with reputation tracks. Players earn rep through quest
 * turn-ins, region-specific kill counts (hooked from hunting.ts), and
 * the Realm Boss strikes. Each faction has six rep tiers; each tier
 * unlocks a vendor stock entry that is otherwise unreachable.
 *
 * The factions:
 *   - Iron Watch — the kingdom's standing army. Rep from killing bandits,
 *     orcs, raiders, and clearing Hammerhand Pass APEX. Vendor sells
 *     premium plate sets at substantial gold discount.
 *   - Conclave — the magical academy that survived Aedric's rebellion.
 *     Rep from clearing the Conclave APEX, defeating Voidshade/Mooncradle
 *     bosses, and turning in arcane quest objectives. Vendor sells
 *     mage-class items + enchanting reagents.
 *   - Wyrmkin — the dragon-touched clans of Emberreach. Rep from
 *     killing dragons, fire elementals, and clearing Emberreach and
 *     Worldspine APEX. Vendor sells dragon-themed mounts + axes.
 */

const router = Router();
router.use(authRequired);

export const FACTIONS = [
  { slug: 'iron_watch', name: 'The Iron Watch',     motto: 'Hold the line. Hold the road.' },
  { slug: 'conclave',   name: 'The Conclave',       motto: 'Read what is written. Know what is not.' },
  { slug: 'wyrmkin',    name: 'The Wyrmkin Clans',  motto: 'The fire remembers its first hand.' },
] as const;

/** Six tiers. Rep thresholds chosen so a casual player hits the cap on
 *  one faction in ~6 months of focused play. */
export const FACTION_TIERS = [
  { tier: 0, name: 'Stranger',  rep_required: 0 },
  { tier: 1, name: 'Initiate',  rep_required: 500 },
  { tier: 2, name: 'Trusted',   rep_required: 1_800 },
  { tier: 3, name: 'Esteemed',  rep_required: 4_500 },
  { tier: 4, name: 'Honoured',  rep_required: 9_000 },
  { tier: 5, name: 'Exalted',   rep_required: 16_000 },
];

export function tierFor(rep: number): { tier: number; name: string } {
  for (let i = FACTION_TIERS.length - 1; i >= 0; i--) {
    if (rep >= FACTION_TIERS[i].rep_required) return { tier: FACTION_TIERS[i].tier, name: FACTION_TIERS[i].name };
  }
  return { tier: 0, name: 'Stranger' };
}

/** Atomic rep grant — used from quest/hunt routes when a player earns
 *  reputation. Idempotent CAS upsert. */
export function grantFactionRep(characterId: number, factionSlug: string, amount: number): void {
  if (!amount) return;
  const db = getDb();
  db.prepare(
    `INSERT INTO character_faction_rep (character_id, faction_slug, rep, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(character_id, faction_slug) DO UPDATE SET
       rep = rep + excluded.rep,
       updated_at = excluded.updated_at`,
  ).run(characterId, factionSlug, amount, Date.now());
}

/** Tally faction rep on a hunt-kill. Mapping is by monster family +
 *  region — humanoid raiders feed Iron Watch, dragons + fire elementals
 *  feed Wyrmkin, magic / aberration feed Conclave. */
export function applyFactionRepFromHunt(characterId: number, monster: { region: string; family: string; level: number; slug: string }): { faction_slug: string; rep: number } | null {
  // Tier-aware base rep so a lv 350 player isn't gaining only +1 per kill.
  const base = Math.max(1, Math.floor(monster.level / 8));
  let slug: string | null = null;
  let mult = 1;

  // APEX bosses pay 20x to the matching faction.
  const APEX_FACTION: Record<string, string> = {
    'emberreach_apex_khalad':     'wyrmkin',
    'hammerhand_apex_gorvak':     'iron_watch',
    'conclave_apex_vex':          'conclave',
    'saltmarsh_apex_sunken_king': 'iron_watch',
    'frostvale_apex_snowtooth':   'iron_watch',
    'blackspire_apex_azhtek':     'conclave',
    'stormpeaks_apex_karna':      'wyrmkin',
    'voidshade_apex_caethra':     'conclave',
    'mooncradle_apex_selan':      'conclave',
    'worldspine_apex_vhastar':    'wyrmkin',
    'throne_apex_unname':         'wyrmkin',
  };
  if (APEX_FACTION[monster.slug]) {
    slug = APEX_FACTION[monster.slug];
    mult = 20;
  } else if (monster.family === 'dragon' || monster.family === 'elemental') {
    slug = 'wyrmkin';
  } else if (monster.family === 'magic' || monster.family === 'aberration') {
    slug = 'conclave';
  } else if (monster.family === 'humanoid' || monster.family === 'undead' || monster.family === 'demon') {
    slug = 'iron_watch';
  }
  if (!slug) return null;
  const rep = base * mult;
  grantFactionRep(characterId, slug, rep);
  return { faction_slug: slug, rep };
}

router.get('/', (req, res) => {
  const db = getDb();
  const ch = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!ch) { res.status(404).json({ error: 'No character' }); return; }
  const rows = db.prepare('SELECT faction_slug, rep, updated_at FROM character_faction_rep WHERE character_id = ?').all(ch.id) as { faction_slug: string; rep: number; updated_at: number }[];
  const out = FACTIONS.map((f) => {
    const r = rows.find((x) => x.faction_slug === f.slug);
    const rep = r?.rep || 0;
    const t = tierFor(rep);
    const next = FACTION_TIERS.find((tt) => tt.rep_required > rep);
    return {
      slug: f.slug,
      name: f.name,
      motto: f.motto,
      rep,
      tier: t.tier,
      tier_name: t.name,
      next_tier_rep: next ? next.rep_required : null,
      next_tier_name: next ? next.name : null,
    };
  });
  res.json({ factions: out, tiers: FACTION_TIERS });
});

/** Faction vendor: each tier unlocks one piece of stock. Stock is
 *  hand-built rather than reading from items table so we can label
 *  each entry with the unlocking tier. */
const VENDOR_STOCK: Record<string, Array<{ slug: string; tier: number; gold: number; gems: number; note: string }>> = {
  iron_watch: [
    { slug: 'elite_armor_4',    tier: 1, gold: 1200, gems: 0,  note: 'Quartermaster discount on standard plate.' },
    { slug: 'elite_helm_4',     tier: 1, gold: 1200, gems: 0,  note: '' },
    { slug: 'adept_armor_5',    tier: 2, gold: 3200, gems: 0,  note: 'Reserved for sworn members.' },
    { slug: 'mythic_armor_6',   tier: 3, gold: 9000, gems: 0,  note: 'Plate of the King\'s Own.' },
    { slug: 'sunken_king_trident', tier: 4, gold: 0,  gems: 80, note: 'Exalted-only — gem-priced.' },
    { slug: 'gorvak_mace',      tier: 5, gold: 0,    gems: 200, note: 'Exalted-only — only awarded to the most committed sword.' },
  ],
  conclave: [
    { slug: 'elite_staff_4',    tier: 1, gold: 1200, gems: 0,  note: 'Apprentice stipend.' },
    { slug: 'adept_staff_5',    tier: 2, gold: 3200, gems: 0,  note: '' },
    { slug: 'mythic_staff_6',   tier: 3, gold: 9000, gems: 0,  note: 'The deans noticed you.' },
    { slug: 'vex_staff',        tier: 4, gold: 0,    gems: 100, note: 'Exalted-only.' },
    { slug: 'caethra_crown',    tier: 5, gold: 0,    gems: 300, note: 'Exalted-only — the dean would advise against this.' },
  ],
  wyrmkin: [
    { slug: 'elite_axe_4',      tier: 1, gold: 1200, gems: 0,  note: 'Clan welcome-axe.' },
    { slug: 'adept_axe_5',      tier: 2, gold: 3200, gems: 0,  note: '' },
    { slug: 'mythic_axe_6',     tier: 3, gold: 9000, gems: 0,  note: 'Cleavebreaker, clan-cast.' },
    { slug: 'khalad_fang',      tier: 4, gold: 0,    gems: 100, note: 'Exalted-only.' },
    { slug: 'snowtooth_axe',    tier: 5, gold: 0,    gems: 250, note: 'Exalted-only — taken from a rival clan.' },
  ],
};

router.get('/:slug/vendor', (req, res) => {
  const slug = String(req.params.slug);
  if (!VENDOR_STOCK[slug]) { res.status(404).json({ error: 'Unknown faction' }); return; }
  const db = getDb();
  const ch = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!ch) { res.status(404).json({ error: 'No character' }); return; }
  const row = db.prepare('SELECT rep FROM character_faction_rep WHERE character_id = ? AND faction_slug = ?').get(ch.id, slug) as { rep: number } | undefined;
  const rep = row?.rep || 0;
  const t = tierFor(rep);
  const stock = VENDOR_STOCK[slug].map((s) => ({ ...s, unlocked: t.tier >= s.tier }));
  res.json({ faction: slug, rep, tier: t.tier, tier_name: t.name, stock });
});

const buySchema = (() => { try { return require('zod').z.object({ slug: require('zod').z.string() }); } catch { return null; } })();
router.post('/:slug/vendor/buy', (req, res) => {
  const slug = String(req.params.slug);
  const itemSlug = String((req.body || {}).slug || '');
  if (!VENDOR_STOCK[slug]) { res.status(404).json({ error: 'Unknown faction' }); return; }
  const offer = VENDOR_STOCK[slug].find((s) => s.slug === itemSlug);
  if (!offer) { res.status(404).json({ error: 'Item not on this vendor' }); return; }
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  try {
    db.transaction(() => {
      const row = db.prepare('SELECT rep FROM character_faction_rep WHERE character_id = ? AND faction_slug = ?').get(char.id, slug) as { rep: number } | undefined;
      const rep = row?.rep || 0;
      const t = tierFor(rep);
      if (t.tier < offer.tier) { const e: any = new Error(`Need ${FACTION_TIERS.find(x => x.tier === offer.tier)?.name || 'higher'} reputation.`); e.clientSafe = true; e.status = 403; throw e; }
      if (offer.gold > 0) {
        const dec = db.prepare('UPDATE characters SET gold = gold - ? WHERE id = ? AND gold >= ?').run(offer.gold, char.id, offer.gold);
        if (dec.changes !== 1) { const e: any = new Error(`Need ${offer.gold}g.`); e.clientSafe = true; e.status = 400; throw e; }
      }
      if (offer.gems > 0) {
        const dec = db.prepare('UPDATE characters SET gems = gems - ?, total_gems_spent = total_gems_spent + ? WHERE id = ? AND gems >= ?').run(offer.gems, offer.gems, char.id, offer.gems);
        if (dec.changes !== 1) { const e: any = new Error(`Need ${offer.gems} gems.`); e.clientSafe = true; e.status = 400; throw e; }
      }
      const item = db.prepare('SELECT id FROM items WHERE slug = ?').get(itemSlug) as { id: number } | undefined;
      if (!item) { const e: any = new Error('Item missing from catalog'); e.clientSafe = true; e.status = 500; throw e; }
      db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, '')").run(char.id, item.id);
    }).immediate();
    logFromRequest(req, {
      category: 'inventory', action: 'faction_buy',
      character_id: char.id,
      message: `${char.name} bought ${offer.slug} from ${slug} vendor`,
      meta: { faction: slug, item: offer.slug, gold: offer.gold, gems: offer.gems },
    });
    res.json({ ok: true });
  } catch (e: any) {
    if (e?.clientSafe) { res.status(e.status || 400).json({ error: e.message }); return; }
    throw e;
  }
});

export default router;
