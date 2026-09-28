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
 *  each entry with the unlocking tier.
 *
 *  Без „плати, за да спечелиш": ВСИЧКО с боен ефект се купува със ЗЛАТО —
 *  рангът във фракцията е спечеленият гейт. Преди Honoured/Exalted
 *  уникатите бяха само за гемове (премиум валута) и ~2× над кривата.
 *  Цените продължават прогресията на тира (×~2.7–2.8): 1200 → 3200 → 9000
 *  → 25 000 → 70 000. Предметите са по кривата на уникатите
 *  (game/itemCurve.ts); по-високият ранг отключва по-високото ниво. Всяка
 *  цена > продажната (купи→продай винаги е на загуба; econFixes.test.ts). */
export const FACTION_TIER_GOLD: Record<number, number> = { 1: 1200, 2: 3200, 3: 9000, 4: 25_000, 5: 70_000 };
export interface VendorOffer { slug: string; tier: number; gold: number; note: string }
const vendorOffer = (slug: string, tier: number, note = ''): VendorOffer => ({ slug, tier, gold: FACTION_TIER_GOLD[tier], note });
export const VENDOR_STOCK: Record<string, VendorOffer[]> = {
  iron_watch: [
    vendorOffer('elite_armor_4', 1, 'Quartermaster discount on standard plate.'),
    vendorOffer('elite_helm_4', 1),
    vendorOffer('adept_armor_5', 2, 'Reserved for sworn members.'),
    vendorOffer('mythic_armor_6', 3, 'Plate of the King\'s Own.'),
    vendorOffer('gorvak_mace', 4, 'Honoured-only — only awarded to the most committed sword.'),
    vendorOffer('sunken_king_trident', 5, 'Exalted-only.'),
  ],
  conclave: [
    vendorOffer('elite_staff_4', 1, 'Apprentice stipend.'),
    vendorOffer('adept_staff_5', 2),
    vendorOffer('mythic_staff_6', 3, 'The deans noticed you.'),
    vendorOffer('vex_staff', 4, 'Honoured-only.'),
    vendorOffer('caethra_crown', 5, 'Exalted-only — the dean would advise against this.'),
  ],
  wyrmkin: [
    vendorOffer('elite_axe_4', 1, 'Clan welcome-axe.'),
    vendorOffer('adept_axe_5', 2),
    vendorOffer('mythic_axe_6', 3, 'Cleavebreaker, clan-cast.'),
    vendorOffer('khalad_fang', 4, 'Honoured-only.'),
    vendorOffer('snowtooth_axe', 5, 'Exalted-only — taken from a rival clan.'),
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
      const dec = db.prepare('UPDATE characters SET gold = gold - ? WHERE id = ? AND gold >= ?').run(offer.gold, char.id, offer.gold);
      if (dec.changes !== 1) { const e: any = new Error(`Need ${offer.gold}g.`); e.clientSafe = true; e.status = 400; throw e; }
      const item = db.prepare('SELECT id FROM items WHERE slug = ?').get(itemSlug) as { id: number } | undefined;
      if (!item) { const e: any = new Error('Item missing from catalog'); e.clientSafe = true; e.status = 500; throw e; }
      // Само злато → обикновен предмет (като APEX дропа на същия уникат):
      // злато → предмет → по-малко злато е загуба, гем→злато конвертор няма.
      db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, '')")
        .run(char.id, item.id);
    }).immediate();
    logFromRequest(req, {
      category: 'inventory', action: 'faction_buy',
      character_id: char.id,
      message: `${char.name} bought ${offer.slug} from ${slug} vendor`,
      meta: { faction: slug, item: offer.slug, gold: offer.gold },
    });
    res.json({ ok: true });
  } catch (e: any) {
    if (e?.clientSafe) { res.status(e.status || 400).json({ error: e.message }); return; }
    throw e;
  }
});

export default router;
