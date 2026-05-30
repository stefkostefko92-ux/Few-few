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
      `SELECT inv.id as inv_id, inv.quantity, inv.equipped, inv.slot, inv.soul_bound, inv.listed, items.* FROM inventory inv
       JOIN items ON inv.item_id = items.id WHERE inv.character_id = ? ORDER BY inv.equipped DESC, items.category`,
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
      `SELECT inv.id as inv_id, inv.equipped, inv.slot, items.* FROM inventory inv
       JOIN items ON inv.item_id = items.id
       WHERE inv.id = ? AND inv.character_id = ?`,
    )
    .get(parse.data.inventoryId, char.id) as any;
  if (!row) {
    res.status(404).json({ error: 'Item not found' });
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
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const row = db
    .prepare(
      `SELECT inv.id as inv_id, inv.quantity, items.* FROM inventory inv
       JOIN items ON inv.item_id = items.id WHERE inv.id = ? AND inv.character_id = ?`,
    )
    .get(parse.data.inventoryId, char.id) as any;
  if (!row || row.category !== 'potion') {
    res.status(400).json({ error: 'Not a usable item' });
    return;
  }
  // Parse buff potions: sub_type "buff:<stat>:<percent>:<minutes>"
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
  if (row.quantity > 1) {
    db.prepare('UPDATE inventory SET quantity = quantity - 1 WHERE id = ?').run(row.inv_id);
  } else {
    db.prepare('DELETE FROM inventory WHERE id = ?').run(row.inv_id);
  }
  res.json({ ok: true, hp: newHp, mp: newMp, buff: buffApplied });
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
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const row = db
    .prepare(
      `SELECT inv.id as inv_id, inv.quantity, inv.equipped, items.* FROM inventory inv
       JOIN items ON inv.item_id = items.id WHERE inv.id = ? AND inv.character_id = ?`,
    )
    .get(parse.data.inventoryId, char.id) as any;
  if (!row) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }
  if (row.equipped) {
    res.status(400).json({ error: 'Unequip before selling' });
    return;
  }
  const price = row.sell_price;
  db.prepare('UPDATE characters SET gold = gold + ? WHERE id = ?').run(price, char.id);
  if (row.quantity > 1) {
    db.prepare('UPDATE inventory SET quantity = quantity - 1 WHERE id = ?').run(row.inv_id);
  } else {
    db.prepare('DELETE FROM inventory WHERE id = ?').run(row.inv_id);
  }
  res.json({ ok: true, gold: char.gold + price });
});

export default router;
