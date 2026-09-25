// Регресия: наметалата (category 'cloak') не можеха да се екипират —
// slotForCategory в routes/inventory.ts нямаше 'cloak'. Изолирана in-memory база;
// роутерът се зарежда динамично след DB_PATH (виж admin.test.ts).
process.env.DB_PATH = ':memory:';

import test, { after, before } from 'node:test';
import assert from 'node:assert';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { getDb } from '../../db';
import { signToken } from '../../middleware/auth';
import { loadEquipped } from '../equipment';

let server: Server;
let base = '';
let token = '';
let charId = 0;
let invId = 0;

before(async () => {
  const inventoryRouter = (await import('../../routes/inventory')).default;
  const db = getDb();
  const now = Date.now();
  const uid = Number(db.prepare("INSERT INTO users (username, email, password_hash, created_at, last_seen_at) VALUES ('CloakUser', 'cloak@example.com', 'x', ?, ?)").run(now, now).lastInsertRowid);
  charId = Number(db.prepare("INSERT INTO characters (user_id, name, class, level, energy_updated_at, created_at) VALUES (?, 'CloakHero', 'warrior', 30, 0, 0)").run(uid).lastInsertRowid);
  const itemId = Number(db.prepare("INSERT INTO items (slug, name, category, defense, hp_bonus, level_req) VALUES ('test_cloak', 'Test Cloak', 'cloak', 40, 120, 1)").run().lastInsertRowid);
  invId = Number(db.prepare('INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, \'\')').run(charId, itemId).lastInsertRowid);
  token = signToken({ uid, username: 'CloakUser' });
  const app = express();
  app.use(express.json());
  app.use('/api/inventory', inventoryRouter);
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { server?.close(); });

test('наметалото се екипира в слот „cloak“ и влиза в статовете', async () => {
  const r = await fetch(`${base}/api/inventory/equip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ inventoryId: invId }),
  });
  assert.equal(r.status, 200, await r.text());
  const row = getDb().prepare('SELECT equipped, slot FROM inventory WHERE id = ?').get(invId) as { equipped: number; slot: string };
  assert.deepEqual(row, { equipped: 1, slot: 'cloak' });
  const eq = loadEquipped(charId);
  assert.ok(eq.some((s) => s.item.category === 'cloak'), 'наметалото е сред екипираните при смятане на статовете');
});
