// Изолирана in-memory база — задай ПРЕДИ първия getDb().
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-not-for-prod';

import test from 'node:test';
import assert from 'node:assert';
import express from 'express';
import request from 'supertest';
import authRouter from '../auth';
import accountRouter from '../account';
import characterRouter from '../character';

/**
 * Одит (backend round): GET /account/export (GDPR чл. 20 — право на
 * преносимост) четеше `email_verified, email_verified_at` — колони, които
 * НИКОГА не са съществували в users (schema.ts) и не се ползват никъде
 * другаде в кода (няма внедрена имейл-верификация). Резултат: ВСЯКА заявка
 * към експорта хвърляше 500 "no such column: email_verified" — правото на
 * преносимост на данни беше изцяло счупено, не само в тестова среда
 * (липсващите колони важат за всяка инсталация, не за конкретна БД).
 */

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/account', accountRouter);
  app.use('/api/character', characterRouter);
  return app;
}

async function registerAndCreateChar(app: express.Express, username: string) {
  const reg = await request(app).post('/api/auth/register').send({
    username, email: `${username}@example.com`, password: 'Testpass123', dateOfBirth: '1990-05-20', country: 'BG',
  });
  assert.equal(reg.status, 201);
  const token = reg.body.token as string;
  const char = await request(app).post('/api/character/create').set('Authorization', `Bearer ${token}`).send({ name: `Hero${Math.floor(Math.random() * 1e6)}`, class: 'warrior' });
  assert.equal(char.status, 201);
  return token;
}

test('GET /account/export: връща 200 с героя, датата на раждане/държавата, без password_hash', async () => {
  const app = buildApp();
  const token = await registerAndCreateChar(app, `exportuser${Date.now()}${Math.floor(Math.random() * 1e6)}`.slice(0, 20));
  const res = await request(app).get('/api/account/export').set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.user.date_of_birth, '1990-05-20');
  assert.equal(res.body.user.country, 'BG');
  assert.ok(res.body.characters.length >= 1);
  const raw = JSON.stringify(res.body);
  assert.ok(!raw.includes('password_hash'), 'password_hash must never leave the export');
});

test('GET /account/export: неавтентикирано → 401, не 500', async () => {
  const app = buildApp();
  const res = await request(app).get('/api/account/export');
  assert.equal(res.status, 401);
});
