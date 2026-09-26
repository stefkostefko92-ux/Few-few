// Изолирана in-memory база — задай ПРЕДИ първия getDb().
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-not-for-prod';

import test from 'node:test';
import assert from 'node:assert';
import express from 'express';
import request from 'supertest';
import authRouter from '../auth';

/**
 * Одит (backend round): /auth/register четеше „вече съществува ли" ПРЕДИ да
 * вмъкне реда — две паралелни заявки за същия username минаваха проверката
 * (нито една не беше вмъкнала още), втората удряше UNIQUE constraint на
 * INSERT. Handler-ът беше bare `async (req,res)=>{}` без try/catch и без
 * никакъв wrapper → Express 4 НЕ хваща reject от async handler → заявката
 * увисваше ЗАВИНАГИ (потвърдено на живо: curl никога не получи отговор,
 * логът показа "unhandledRejection" вместо HTTP отговор).
 *
 * Поправка: withMonitoring() (lib/observability.ts) обвива handler-а като
 * generic safety net + изричен catch за SQLITE_CONSTRAINT_UNIQUE, който
 * връща чист 409 вместо да увисне.
 */

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

test('register: конкурентна дублирана заявка получава 409, НЕ увисва', async () => {
  const app = buildApp();
  // Случайно суфиксирано име ВСЕКИ run (не литерал) — изолация между
  // тестове/run-ове; литерал тук веднъж предизвика UNIQUE колизия с
  // остатъчен ред от друг run на същия процес и разкри втори, независим
  // проблем (флейки тест заради споделено име), маскиращ се като провал
  // на самата concurrency защита.
  const username = `racecond_${Date.now()}_${Math.floor(Math.random() * 1e6)}`.slice(0, 20);
  const body = {
    username,
    email: `race_a_${Date.now()}@example.com`,
    password: 'Testpass123',
    dateOfBirth: '2000-01-01',
    country: 'BG',
  };
  const body2 = { ...body, email: `race_b_${Date.now()}@example.com` }; // same username, different email

  // Симулира реалната надпревара: и двете заявки тръгват "паралелно"
  // (Promise.all) към ЕДИН и същ express app instance/DB — точно каквото
  // видяхме на живо срещу истинския сървър.
  const [r1, r2] = await Promise.all([
    request(app).post('/api/auth/register').send(body),
    request(app).post('/api/auth/register').send(body2),
  ]);

  // И двете заявки ТРЯБВА да отговорят (нито една не увисва) — точно това
  // гарантира тестът: и двата промиса на Promise.all() трябва да се
  // resolve-нат в разумно време (node:test-ът има собствен таймаут; преди
  // фикса единият заглъхваше и целият тест изтичаше). Точната подредба на
  // 201/409 зависи от реалния bcrypt-тайминг (истинска надпревара, не
  // симулирана) — инвариантът, който проверяваме, е точно ЕДИН победител,
  // никога 500, никога и двата 201 (double-register).
  const statuses = [r1.status, r2.status];
  assert.ok(statuses.every((s) => s === 201 || s === 409), `очаквах само 201/409, получих ${statuses}`);
  const winners = [r1, r2].filter((r) => r.status === 201);
  assert.equal(winners.length, 1, `точно ЕДИН победител очакван, получих ${winners.length} (${statuses})`);
  const loser = r1.status === 201 ? r2 : r1;
  assert.equal(winners[0].body.user.username, username);
  assert.match(loser.body.error, /already in use/i);
});

test('register: невалидно тяло → 400 (не 500/hang)', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/auth/register').send({ username: 'ab' });
  assert.equal(res.status, 400);
});

test('register: непълнолетен според държавата → 403', async () => {
  const app = buildApp();
  const res = await request(app).post('/api/auth/register').send({
    username: 'toddler_hero',
    email: 'toddler@example.com',
    password: 'Testpass123',
    dateOfBirth: new Date(Date.now() - 5 * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10), // 5 г.
    country: 'BG',
  });
  assert.equal(res.status, 403);
});
