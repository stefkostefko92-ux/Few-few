import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import type { Character, Item } from '../types/domain';
import { logFromRequest } from '../lib/logger';

const router = Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT level FROM characters WHERE user_id = ?').get(req.auth!.uid) as { level: number } | undefined;
  const lvl = char?.level ?? 1;
  const items = db
    .prepare(`SELECT * FROM items WHERE buy_price > 0 AND level_req <= ? ORDER BY category, level_req, buy_price`)
    .all(lvl + 5);
  res.json({ items });
});

const buySchema = z.object({ itemId: z.number().int(), quantity: z.number().int().min(1).max(99).default(1) });

router.post('/buy', (req, res) => {
  const parse = buySchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.flatten() });
    return;
  }
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(parse.data.itemId) as Item | undefined;
  if (!item || item.buy_price <= 0) {
    res.status(404).json({ error: 'Item not for sale' });
    return;
  }
  if (item.level_req > char.level) {
    res.status(400).json({ error: `Requires level ${item.level_req}` });
    return;
  }
  const cost = item.buy_price * parse.data.quantity;
  // Atomic check-then-spend: UPDATE only succeeds if the character still has the gold.
  // This guards against two interleaved buys both passing the JS-side check.
  const tx = db.transaction(() => {
    const spent = db
      .prepare('UPDATE characters SET gold = gold - ? WHERE id = ? AND gold >= ?')
      .run(cost, char.id, cost);
    if (spent.changes !== 1) throw new Error('Not enough gold');
    if (item.category === 'potion') {
      const existing = db
        .prepare('SELECT id, quantity FROM inventory WHERE character_id = ? AND item_id = ? AND equipped = 0')
        .get(char.id, item.id) as { id: number; quantity: number } | undefined;
      if (existing) {
        db.prepare('UPDATE inventory SET quantity = quantity + ? WHERE id = ?').run(parse.data.quantity, existing.id);
      } else {
        db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, ?, 0, '')").run(
          char.id,
          item.id,
          parse.data.quantity,
        );
      }
    } else {
      const ins = db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, '')");
      for (let i = 0; i < parse.data.quantity; i++) ins.run(char.id, item.id);
    }
  });
  try {
    tx();
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'Purchase failed' });
    return;
  }
  logFromRequest(req, {
    category: 'inventory',
    action: 'shop_buy',
    character_id: char.id,
    target_id: item.id,
    target_type: 'item',
    message: `${char.name} bought ${parse.data.quantity}x ${item.name} for ${cost}g`,
    meta: { item_id: item.id, item_name: item.name, quantity: parse.data.quantity, unit_price: item.buy_price, cost },
  });
  res.json({ ok: true, gold: char.gold - cost });
});

export default router;
