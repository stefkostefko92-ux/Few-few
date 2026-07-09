import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import type { Character, Item } from '../types/domain';
import { logFromRequest } from '../lib/logger';
import { trackBattlePass } from './battlepass';

const router = Router();
router.use(authRequired);

function getChar(uid: number): Character | undefined {
  return getDb().prepare('SELECT * FROM characters WHERE user_id = ?').get(uid) as Character | undefined;
}

const MARKET_FEE_PCT = 5;       // seller pays 5% on completion
const PRICE_MIN = 1;
const PRICE_MAX = 1_000_000;

/* ===== Browse ===== */
router.get('/', (req, res) => {
  const db = getDb();
  const category = (req.query.category as string) || '';
  const q = (req.query.q as string)?.trim() || '';
  const params: any[] = [];
  let where = "WHERE m.status = 'active'";
  if (category) {
    where += ' AND items.category = ?';
    params.push(category);
  }
  if (q) {
    where += ' AND items.name LIKE ?';
    params.push(`%${q}%`);
  }
  const rows = db
    .prepare(
      `SELECT m.id AS listing_id, m.price_gold, m.listed_at, m.seller_id,
              items.*, s.name AS seller_name, s.class AS seller_class, s.level AS seller_level
       FROM marketplace_listings m
       JOIN items ON items.id = m.item_id
       JOIN characters s ON s.id = m.seller_id
       ${where}
       ORDER BY m.listed_at DESC LIMIT 100`,
    )
    .all(...params);
  res.json({ listings: rows });
});

/* ===== Mine ===== */
router.get('/mine', (req, res) => {
  const char = getChar(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const rows = getDb()
    .prepare(
      `SELECT m.id AS listing_id, m.price_gold, m.listed_at, m.status, m.sold_at,
              items.*, b.name AS buyer_name
       FROM marketplace_listings m
       JOIN items ON items.id = m.item_id
       LEFT JOIN characters b ON b.id = m.buyer_id
       WHERE m.seller_id = ?
       ORDER BY m.listed_at DESC LIMIT 100`,
    )
    .all(char.id);
  res.json({ listings: rows });
});

/* ===== List for sale ===== */
const sellSchema = z.object({
  inventoryId: z.number().int(),
  priceGold: z.number().int().min(PRICE_MIN).max(PRICE_MAX),
});

router.post('/sell', (req, res) => {
  const parse = sellSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const char = getChar(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const row = db
    .prepare(
      `SELECT inv.id AS inv_id, inv.equipped, inv.soul_bound, inv.listed, inv.vaulted_guild_id, items.*
       FROM inventory inv JOIN items ON items.id = inv.item_id
       WHERE inv.id = ? AND inv.character_id = ?`,
    )
    .get(parse.data.inventoryId, char.id) as any;
  if (!row) { res.status(404).json({ error: 'Item not found in your bag' }); return; }
  if (row.vaulted_guild_id) { res.status(400).json({ error: 'Withdraw the item from the guild vault first.' }); return; }
  if (row.soul_bound) { res.status(400).json({ error: 'Soul-bound items cannot be re-listed.' }); return; }
  if (row.listed) { res.status(400).json({ error: 'Already listed.' }); return; }
  if (row.equipped) { res.status(400).json({ error: 'Unequip the item before listing.' }); return; }
  if (row.category === 'potion') { res.status(400).json({ error: 'Consumables cannot be listed.' }); return; }

  const now = Date.now();
  db.prepare(
    `INSERT INTO marketplace_listings (inventory_id, item_id, seller_id, price_gold, status, listed_at)
     VALUES (?, ?, ?, ?, 'active', ?)`,
  ).run(row.inv_id, row.id, char.id, parse.data.priceGold, now);
  db.prepare('UPDATE inventory SET listed = 1 WHERE id = ?').run(row.inv_id);
  logFromRequest(req, {
    category: 'market',
    action: 'listing_created',
    character_id: char.id,
    target_id: row.id,
    target_type: 'item',
    message: `${char.name} listed ${row.name} for ${parse.data.priceGold}g`,
    meta: { inventory_id: row.inv_id, item_id: row.id, price_gold: parse.data.priceGold, item_name: row.name, category: row.category, rarity: row.rarity },
  });
  res.json({ ok: true });
});

/* ===== Buy ===== */
const buySchema = z.object({ listingId: z.number().int() });

router.post('/buy', (req, res) => {
  const parse = buySchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const char = getChar(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const listing = db
    .prepare(`SELECT * FROM marketplace_listings WHERE id = ? AND status = 'active'`)
    .get(parse.data.listingId) as any;
  if (!listing) { res.status(404).json({ error: 'Listing not found' }); return; }
  if (listing.seller_id === char.id) { res.status(400).json({ error: 'You cannot buy your own listing.' }); return; }
  if (char.gold < listing.price_gold) { res.status(400).json({ error: 'Not enough gold' }); return; }

  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(listing.item_id) as Item | undefined;
  if (!item) { res.status(404).json({ error: 'Item vanished' }); return; }

  // Apply respect for char level requirements
  if (item.level_req > char.level) {
    res.status(400).json({ error: `You must be level ${item.level_req} to take this item.` });
    return;
  }

  const sellerCut = listing.price_gold - Math.ceil(listing.price_gold * MARKET_FEE_PCT / 100);
  const now = Date.now();
  const tx = db.transaction(() => {
    // Atomic check-then-debit: only spend if the buyer still has enough gold
    // (defends against two interleaved buys both passing the earlier JS check).
    const debit = db.prepare('UPDATE characters SET gold = gold - ? WHERE id = ? AND gold >= ?')
      .run(listing.price_gold, char.id, listing.price_gold);
    if (debit.changes !== 1) throw new Error('Not enough gold');
    // Also guard against double-buy of the same listing.
    const close = db.prepare(`UPDATE marketplace_listings SET status = 'sold', buyer_id = ?, sold_at = ? WHERE id = ? AND status = 'active'`)
      .run(char.id, now, listing.id);
    if (close.changes !== 1) throw new Error('Listing already sold');
    db.prepare('UPDATE characters SET gold = gold + ?, total_gold_earned = total_gold_earned + ? WHERE id = ?')
      .run(sellerCut, sellerCut, listing.seller_id);
    // Guard the transfer with changes===1: if the underlying item row was
    // deleted between listing and purchase (e.g. shattered in the forge),
    // this yields 0 changes and we roll the whole tx back instead of
    // charging the buyer for a phantom item. Also clear any stale vault
    // linkage so a vault-listed item cannot be double-owned.
    const moved = db.prepare(`UPDATE inventory SET character_id = ?, equipped = 0, slot = '', listed = 0, soul_bound = 1, vaulted_guild_id = 0 WHERE id = ?`)
      .run(char.id, listing.inventory_id);
    if (moved.changes !== 1) throw new Error('Item is no longer available');
    db.prepare('DELETE FROM guild_vault WHERE inventory_id = ?').run(listing.inventory_id);
    // Mail the seller a notification
    db.prepare('INSERT INTO mail (character_id, from_name, subject, body, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(
        listing.seller_id,
        'Player Market',
        `Sale — ${item.name}`,
        `Your listing of ${item.name} sold for ${listing.price_gold}g. After the ${MARKET_FEE_PCT}% market fee you received ${sellerCut}g.`,
        Date.now(),
      );
  });
  try { tx(); }
  catch (e: any) { res.status(400).json({ error: e.message || 'Purchase failed' }); return; }
  // The SELLER's pass progresses on the sale (they earned the gold).
  trackBattlePass(listing.seller_id, 'market_sale', 1);
  logFromRequest(req, {
    category: 'market',
    action: 'purchased',
    character_id: char.id,
    target_id: listing.seller_id,
    target_type: 'character',
    message: `${char.name} bought ${item.name} for ${listing.price_gold}g`,
    meta: {
      listing_id: listing.id, item_id: item.id, item_name: item.name, rarity: item.rarity,
      price_gold: listing.price_gold, seller_id: listing.seller_id, seller_cut: sellerCut, market_fee_pct: MARKET_FEE_PCT,
    },
  });
  res.json({ ok: true, item_name: item.name, paid: listing.price_gold });
});

/* ===== Cancel ===== */
const cancelSchema = z.object({ listingId: z.number().int() });

router.post('/cancel', (req, res) => {
  const parse = cancelSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const char = getChar(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const listing = db
    .prepare(`SELECT * FROM marketplace_listings WHERE id = ? AND status = 'active'`)
    .get(parse.data.listingId) as any;
  if (!listing) { res.status(404).json({ error: 'Listing not found' }); return; }
  if (listing.seller_id !== char.id) { res.status(403).json({ error: 'Not your listing' }); return; }
  const tx = db.transaction(() => {
    db.prepare(`UPDATE marketplace_listings SET status = 'cancelled' WHERE id = ?`).run(listing.id);
    db.prepare('UPDATE inventory SET listed = 0 WHERE id = ?').run(listing.inventory_id);
  });
  tx();
  logFromRequest(req, {
    category: 'market',
    action: 'listing_cancelled',
    character_id: char.id,
    target_id: listing.id,
    target_type: 'listing',
    message: `${char.name} cancelled listing #${listing.id}`,
    meta: { listing_id: listing.id, inventory_id: listing.inventory_id, price_gold: listing.price_gold },
  });
  res.json({ ok: true });
});

export default router;
