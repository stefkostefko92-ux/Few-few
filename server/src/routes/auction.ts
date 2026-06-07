import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { logFromRequest } from '../lib/logger';
import type { Character, Item } from '../types/domain';

const router = Router();
router.use(authRequired);

/* =========================================================================
 * Auction House — premium-currency only, item rotates hourly.
 *
 *   The hour bucket is `floor(Date.now() / 3_600_000)`. Each hour exactly
 *   one item is listed; the previous listing is settled (winning bidder
 *   gets the item, losers get their gems back). The daily 20:00 UTC
 *   "reset" is the auction immediately following that boundary — it gets
 *   a fresh draw from the unique-only pool, replacing whatever was up.
 *
 *   Bids are gem-only. Outbidding refunds the previous bidder's gems
 *   automatically. The current top bid + bidder name are public.
 * ======================================================================= */

interface ListingRow {
  id: number;
  hour_bucket: number;
  item_slug: string;
  item_id: number;
  starts_at: number;
  ends_at: number;
  starting_bid: number;
  current_bid: number;
  bidder_id: number | null;
  bidder_name: string | null;
  settled: number;
}

const HOUR_MS = 3_600_000;
const RESET_HOUR_UTC = 20;

function currentHourBucket(now = Date.now()): number {
  return Math.floor(now / HOUR_MS);
}

/** True if this hour is the daily 20:00 reset slot. */
function isResetHour(hourBucket: number): boolean {
  return new Date(hourBucket * HOUR_MS).getUTCHours() === RESET_HOUR_UTC;
}

/* ----- pool of items the auction can draw from -----
 * Rotating pool of items the auction may pull from. Reset slots get a
 * curated "premium" pool that's juicier (legendary/epic gear). Other
 * hours get a mid-tier rotation so there's always something worth bidding
 * on, just not always a relic. */
const POOL_PREMIUM_SLUGS = ['voidwhisper', 'dragonbane', 'shadowfang_bow', 'archmage_staff', 'flameblade', 'ring_of_power', 'amulet_of_warding'];
const POOL_REGULAR_SLUGS = ['steel_longsword', 'sapphire_staff', 'elven_bow', 'plate_helm', 'plate_armor', 'kite_shield', 'silver_ring', 'mage_robe', 'health_potion'];

function pickItemForHour(hourBucket: number): { item_id: number; item_slug: string; starting_bid: number } | null {
  const db = getDb();
  const pool = isResetHour(hourBucket) ? POOL_PREMIUM_SLUGS : POOL_REGULAR_SLUGS;
  // Pull all candidates that actually exist in the items table.
  const rows = db
    .prepare(`SELECT id, slug, tier, rarity FROM items WHERE slug IN (${pool.map(() => '?').join(',')})`)
    .all(...pool) as { id: number; slug: string; tier: number; rarity: string }[];
  if (rows.length === 0) return null;
  // Deterministic pick per hour bucket so every player sees the same item.
  const idx = hourBucket % rows.length;
  const pick = rows[idx];
  // Starting bid scales with rarity.
  const startingByRarity: Record<string, number> = {
    common: 5, uncommon: 10, rare: 20, epic: 40, legendary: 80,
  };
  const starting = (startingByRarity[pick.rarity] || 5) * (isResetHour(hourBucket) ? 2 : 1);
  return { item_id: pick.id, item_slug: pick.slug, starting_bid: starting };
}

/** Settle every listing whose hour has passed and that isn't already settled. */
function settleClosedListings(): void {
  const db = getDb();
  const cutoff = Date.now();
  const closed = db
    .prepare('SELECT * FROM auction_listings WHERE settled = 0 AND ends_at <= ?')
    .all(cutoff) as ListingRow[];
  for (const row of closed) {
    // Audit (backend round): the old code did INSERT inventory + INSERT
    // mail BEFORE setting settled=1, all outside a transaction. Two
    // concurrent GET /auction calls both passed the WHERE settled=0
    // read and granted the prize + mail twice (and once the second
    // UPDATE landed it was already settled, so the double grant
    // persisted). Now each listing is settled in its own transaction
    // gated by an atomic UPDATE that only the first parallel caller
    // can win — the loser sees changes === 0 and skips the grant.
    db.transaction(() => {
      const claim = db.prepare('UPDATE auction_listings SET settled = 1 WHERE id = ? AND settled = 0').run(row.id);
      if (claim.changes !== 1) return;
      if (row.bidder_id) {
        const item = db.prepare('SELECT id, name FROM items WHERE id = ?').get(row.item_id) as any;
        db.prepare(
          `INSERT INTO inventory (character_id, item_id, quantity, equipped, slot, soul_bound) VALUES (?, ?, 1, 0, '', 1)`,
        ).run(row.bidder_id, row.item_id);
        db.prepare(
          `INSERT INTO mail (character_id, from_name, subject, body, created_at) VALUES (?, ?, ?, ?, ?)`,
        ).run(
          row.bidder_id,
          'Auction House',
          `Won: ${item?.name || row.item_slug}`,
          `Your bid of ${row.current_bid} gems for ${item?.name || row.item_slug} won. The item is in your bag, soul-bound.`,
          Date.now(),
        );
      }
    }).immediate();
  }
}

/** Return the current hour's listing, creating it on demand. */
function getOrCreateCurrent(): ListingRow | null {
  const db = getDb();
  const hour = currentHourBucket();
  let row = db.prepare('SELECT * FROM auction_listings WHERE hour_bucket = ?').get(hour) as ListingRow | undefined;
  if (row) return row;

  const pick = pickItemForHour(hour);
  if (!pick) return null;
  const starts = hour * HOUR_MS;
  const ends = starts + HOUR_MS;
  db.prepare(
    `INSERT INTO auction_listings (hour_bucket, item_slug, item_id, starts_at, ends_at, starting_bid, current_bid, settled)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
  ).run(hour, pick.item_slug, pick.item_id, starts, ends, pick.starting_bid, pick.starting_bid);
  row = db.prepare('SELECT * FROM auction_listings WHERE hour_bucket = ?').get(hour) as ListingRow;
  return row;
}

router.get('/', (_req, res) => {
  settleClosedListings();
  const listing = getOrCreateCurrent();
  if (!listing) { res.json({ listing: null }); return; }
  const item = getDb()
    .prepare('SELECT slug, name, description, category, sub_type, tier, rarity, icon, atk_min, atk_max, defense, hp_bonus, mp_bonus, str_bonus, dex_bonus, con_bonus, int_bonus, wis_bonus, cha_bonus FROM items WHERE id = ?')
    .get(listing.item_id) as Item;
  const recent = getDb()
    .prepare(
      `SELECT al.hour_bucket, al.item_slug, items.name AS item_name, al.current_bid, al.bidder_name
       FROM auction_listings al JOIN items ON items.id = al.item_id
       WHERE al.settled = 1 ORDER BY al.hour_bucket DESC LIMIT 6`,
    )
    .all();
  const nextHour = (listing.hour_bucket + 1) * HOUR_MS;
  res.json({
    listing: { ...listing, item, reset_hour: isResetHour(listing.hour_bucket) },
    next_hour_at: nextHour,
    server_now: Date.now(),
    recent,
  });
});

const bidSchema = z.object({ amount: z.number().int().min(1) });
router.post('/bid', (req, res) => {
  const parse = bidSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  settleClosedListings();
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const listing = getOrCreateCurrent();
  if (!listing) { res.status(404).json({ error: 'No auction running' }); return; }
  if (listing.bidder_id === char.id) {
    res.status(400).json({ error: 'You are already the top bidder.' });
    return;
  }
  if (parse.data.amount <= listing.current_bid) {
    res.status(400).json({ error: `Bid must exceed ${listing.current_bid} gems.` });
    return;
  }
  if (((char as any).gems || 0) < parse.data.amount) {
    res.status(400).json({ error: `You only have ${(char as any).gems || 0} gems.` });
    return;
  }

  const tx = db.transaction(() => {
    // Refund previous bidder (if any).
    if (listing.bidder_id && listing.bidder_id !== char.id) {
      db.prepare('UPDATE characters SET gems = gems + ? WHERE id = ?').run(listing.current_bid, listing.bidder_id);
    }
    // Debit current bidder atomically.
    const debit = db
      .prepare('UPDATE characters SET gems = gems - ?, total_gems_spent = total_gems_spent + ? WHERE id = ? AND gems >= ?')
      .run(parse.data.amount, parse.data.amount, char.id, parse.data.amount);
    if (debit.changes !== 1) throw new Error('Gem balance changed — retry.');
    db.prepare('UPDATE auction_listings SET current_bid = ?, bidder_id = ?, bidder_name = ? WHERE id = ?')
      .run(parse.data.amount, char.id, char.name, listing.id);
  });
  try { tx(); } catch (e: any) { res.status(400).json({ error: e.message }); return; }

  logFromRequest(req, {
    category: 'market', action: 'auction_bid',
    character_id: char.id,
    target_id: listing.id,
    target_type: 'auction_listing',
    message: `${char.name} bid ${parse.data.amount} gems on ${listing.item_slug}`,
    meta: { listing_id: listing.id, amount: parse.data.amount, item_slug: listing.item_slug },
  });

  res.json({ ok: true, current_bid: parse.data.amount });
});

export default router;
