import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import type { Character, Item, InventoryEntry } from '../types/domain';
import { logFromRequest } from '../lib/logger';

const router = Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const rows = db
    .prepare(
      `SELECT inv.id as inv_id, inv.quantity, inv.equipped, inv.slot, inv.soul_bound, inv.listed,
              COALESCE(e.enchant_count, 0) AS enchant_count,
              COALESCE(e.bonuses_json, '{}') AS enchant_bonuses_json,
              items.*
       FROM inventory inv
       JOIN items ON inv.item_id = items.id
       LEFT JOIN inventory_enchants e ON e.inventory_id = inv.id
       WHERE inv.character_id = ? AND inv.vaulted_guild_id = 0
       ORDER BY inv.equipped DESC, items.category`,
    )
    .all(char.id) as any[];
  res.json({ items: rows });
});

const equipSchema = z.object({ inventoryId: z.number().int() });

const slotForCategory: Record<string, string> = {
  weapon: 'weapon',
  shield: 'offhand',
  helm: 'helm',
  armor: 'armor',
  gloves: 'gloves',
  boots: 'boots',
  ring: 'ring',
  amulet: 'amulet',
};

router.post('/equip', (req, res) => {
  const parse = equipSchema.safeParse(req.body);
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
  const row = db
    .prepare(
      `SELECT inv.id as inv_id, inv.equipped, inv.slot, inv.listed, items.* FROM inventory inv
       JOIN items ON inv.item_id = items.id
       WHERE inv.id = ? AND inv.character_id = ?`,
    )
    .get(parse.data.inventoryId, char.id) as any;
  if (!row) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }
  // A market-listed item is committed to its listing; equipping it would
  // give the seller the stats of an item that's also exposed for sale,
  // which is the small bypass the audit flagged. Cancel the listing
  // first or wait for it to sell.
  if (row.listed) {
    res.status(409).json({ error: 'Cancel the marketplace listing before equipping this item.' });
    return;
  }
  if (row.level_req > char.level) {
    res.status(400).json({ error: `Requires level ${row.level_req}` });
    return;
  }
  if (row.class_req && row.class_req !== char.class) {
    res.status(400).json({ error: `Requires class ${row.class_req}` });
    return;
  }
  const slot = slotForCategory[row.category];
  if (!slot) {
    res.status(400).json({ error: 'This item cannot be equipped' });
    return;
  }
  // Unequip anything currently in that slot
  db.prepare("UPDATE inventory SET equipped = 0, slot = '' WHERE character_id = ? AND slot = ?").run(char.id, slot);
  db.prepare('UPDATE inventory SET equipped = 1, slot = ? WHERE id = ?').run(slot, row.inv_id);
  logFromRequest(req, {
    category: 'inventory',
    action: 'equipped',
    character_id: char.id,
    target_id: row.id,
    target_type: 'item',
    message: `${char.name} equipped ${row.name}`,
    meta: { slot, item_name: row.name, rarity: row.rarity, tier: row.tier },
  });
  res.json({ ok: true });
});

router.post('/unequip', (req, res) => {
  const parse = equipSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.flatten() });
    return;
  }
  const db = getDb();
  const char = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  db.prepare("UPDATE inventory SET equipped = 0, slot = '' WHERE id = ? AND character_id = ?").run(
    parse.data.inventoryId,
    char.id,
  );
  res.json({ ok: true });
});

router.post('/use', (req, res) => {
  const parse = equipSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.flatten() });
    return;
  }
  const db = getDb();
  const ch = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!ch) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  // Audit (backend round): two parallel /use calls with the same
  // inventory id both read quantity, both healed, both decremented.
  // The decrement is now an atomic CAS gated on quantity >= 1, run
  // first inside a transaction. If two callers race, the second
  // sees changes === 0 and bails before the heal applies.
  try {
    const result = db.transaction(() => {
      const row = db
        .prepare(
          `SELECT inv.id as inv_id, inv.quantity, items.* FROM inventory inv
           JOIN items ON inv.item_id = items.id WHERE inv.id = ? AND inv.character_id = ?`,
        )
        .get(parse.data.inventoryId, ch.id) as any;
      if (!row || row.category !== 'potion') { const e: any = new Error('Not a usable item'); e.clientSafe = true; e.status = 400; throw e; }
      const dec = db.prepare('UPDATE inventory SET quantity = quantity - 1 WHERE id = ? AND character_id = ? AND quantity >= 1').run(row.inv_id, ch.id);
      if (dec.changes !== 1) { const e: any = new Error('No charges left'); e.clientSafe = true; e.status = 400; throw e; }
      // Trim the now-empty stack.
      db.prepare('DELETE FROM inventory WHERE id = ? AND quantity <= 0').run(row.inv_id);
      const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(ch.id) as Character;
      let buffApplied: any = null;
      if (typeof row.sub_type === 'string' && row.sub_type.startsWith('buff:')) {
        const [, stat, pctStr, minStr] = row.sub_type.split(':');
        const percent = Number(pctStr);
        const minutes = Number(minStr);
        if (stat && Number.isFinite(percent) && Number.isFinite(minutes)) {
          let buffs: Array<{ stat: string; percent: number; expires_at: number }> = [];
          try { buffs = JSON.parse((char as any).active_buffs || '[]'); } catch { buffs = []; }
          const now = Date.now();
          buffs = buffs.filter((b) => b.expires_at > now && b.stat !== stat);
          const expires_at = now + minutes * 60_000;
          buffs.push({ stat, percent, expires_at });
          buffApplied = { stat, percent, expires_at, minutes };
          db.prepare('UPDATE characters SET active_buffs = ? WHERE id = ?').run(JSON.stringify(buffs), char.id);
        }
      }
      const newHp = Math.min(char.hp_max, char.hp + row.heal_hp);
      const newMp = Math.min(char.mp_max, char.mp + row.heal_mp);
      if (row.heal_hp || row.heal_mp) {
        db.prepare('UPDATE characters SET hp = ?, mp = ? WHERE id = ?').run(newHp, newMp, char.id);
      }
      return { newHp, newMp, buffApplied };
    }).immediate();
    res.json({ ok: true, hp: result.newHp, mp: result.newMp, buff: result.buffApplied });
  } catch (e: any) {
    if (e?.clientSafe) { res.status(e.status || 400).json({ error: e.message }); return; }
    throw e;
  }
});

router.get('/buffs', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT id, active_buffs FROM characters WHERE user_id = ?').get(req.auth!.uid) as any;
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  let buffs: any[] = [];
  try { buffs = JSON.parse(char.active_buffs || '[]'); } catch { buffs = []; }
  const now = Date.now();
  const active = buffs.filter((b) => b.expires_at > now);
  if (active.length !== buffs.length) {
    db.prepare('UPDATE characters SET active_buffs = ? WHERE id = ?').run(JSON.stringify(active), char.id);
  }
  res.json({ buffs: active });
});

router.post('/sell', (req, res) => {
  const parse = equipSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.flatten() });
    return;
  }
  const db = getDb();
  const ch = db.prepare('SELECT id, name FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number; name: string } | undefined;
  if (!ch) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  // Audit (backend round): two parallel /sell calls on the same row
  // both credited gold while only one DELETE could win; the loser
  // still got the gold. Also `listed` items were sellable, letting a
  // seller pocket the vendor price AND keep the market listing alive
  // — now the WHERE includes listed = 0 too. The CAS is the first
  // write and is what gates gold credit + log emit.
  try {
    const result = db.transaction(() => {
      const row = db
        .prepare(
          `SELECT inv.id as inv_id, inv.quantity, inv.equipped, inv.listed, items.* FROM inventory inv
           JOIN items ON inv.item_id = items.id WHERE inv.id = ? AND inv.character_id = ?`,
        )
        .get(parse.data.inventoryId, ch.id) as any;
      if (!row) { const e: any = new Error('Item not found'); e.clientSafe = true; e.status = 404; throw e; }
      if (row.equipped) { const e: any = new Error('Unequip before selling'); e.clientSafe = true; e.status = 400; throw e; }
      if (row.listed) { const e: any = new Error('Cancel the market listing first'); e.clientSafe = true; e.status = 400; throw e; }
      const dec = db.prepare(
        'UPDATE inventory SET quantity = quantity - 1 WHERE id = ? AND character_id = ? AND quantity >= 1 AND equipped = 0 AND listed = 0',
      ).run(row.inv_id, ch.id);
      if (dec.changes !== 1) { const e: any = new Error('Item not found'); e.clientSafe = true; e.status = 404; throw e; }
      db.prepare('DELETE FROM inventory WHERE id = ? AND quantity <= 0').run(row.inv_id);
      const price = row.sell_price;
      db.prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(price, ch.id);
      return { row, price };
    }).immediate();
    logFromRequest(req, {
      category: 'inventory', action: 'sell', character_id: ch.id, target_id: result.row.id, target_type: 'item',
      message: `${ch.name} sold ${result.row.name} for ${result.price}g`,
      meta: { item_id: result.row.id, item_name: result.row.name, rarity: result.row.rarity, gold: result.price },
    });
    const gold = (db.prepare('SELECT gold FROM characters WHERE id = ?').get(ch.id) as { gold: number }).gold;
    res.json({ ok: true, gold });
  } catch (e: any) {
    if (e?.clientSafe) { res.status(e.status || 400).json({ error: e.message }); return; }
    throw e;
  }
});

export default router;
