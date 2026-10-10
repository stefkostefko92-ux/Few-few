// Изолирана in-memory база — задай ПРЕДИ първия getDb().
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-not-for-prod';

import test from 'node:test';
import assert from 'node:assert';
import express from 'express';
import request from 'supertest';
import authRouter from '../auth';
import characterRouter from '../character';
import dungeonRouter from '../dungeon';
import { getDb } from '../../db';
import { DUNGEONS } from '../../seed/dungeons';

/**
 * Регресия: claim-ът триеше `dungeon_run ... AND id = ?`, а таблицата няма колона id
 * (PK е character_id) → ВСЕКИ claim беше 500 и наградата за изчистено подземие никога
 * не се изплащаше. Тук: изчистен run → 200, златото расте, run-ът изчезва, втори claim → 400.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/character', characterRouter);
  app.use('/api/dungeon', dungeonRouter);
  return app;
}

test('POST /dungeon/claim: изчистено подземие изплаща наградата и не е 500', async () => {
  const app = buildApp();
  const username = `dgn${Date.now()}`.slice(0, 20);
  const reg = await request(app).post('/api/auth/register').send({
    username, email: `${username}@example.com`, password: 'Testpass123', dateOfBirth: '1990-05-20', country: 'BG',
  });
  assert.equal(reg.status, 201);
  const token = reg.body.token as string;
  const created = await request(app).post('/api/character/create').set('Authorization', `Bearer ${token}`).send({ name: `Delver${Math.floor(Math.random() * 1e6)}`, class: 'warrior' });
  assert.equal(created.status, 201);

  const db = getDb();
  const ch = db.prepare('SELECT id, gold FROM characters ORDER BY id DESC LIMIT 1').get() as { id: number; gold: number };
  const dungeon = DUNGEONS[0];
  db.prepare(
    "INSERT INTO dungeon_run (character_id, slug, stage, hp, hp_max, gold_pile, xp_pile, items_json, started_at) VALUES (?, ?, ?, 50, 100, 40, 30, '[]', ?)",
  ).run(ch.id, dungeon.slug, dungeon.stages.length, Date.now());

  const res = await request(app).post('/api/dungeon/claim').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  const after = db.prepare('SELECT gold FROM characters WHERE id = ?').get(ch.id) as { gold: number };
  assert.ok(after.gold > ch.gold, 'claim must pay out gold');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM dungeon_run WHERE character_id = ?').get(ch.id).n, 0);

  const again = await request(app).post('/api/dungeon/claim').set('Authorization', `Bearer ${token}`);
  assert.equal(again.status, 400);
});
