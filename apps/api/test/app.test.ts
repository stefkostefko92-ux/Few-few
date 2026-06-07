import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

/**
 * Тестове на ниво HTTP, които не докосват база/опашка: проверяват ранните
 * клонове на рутерите (валидация, honeypot, auth guard, 404). Така
 * договорът на API-то е под защита и в CI без външни услуги.
 */
const app = createApp();

describe('POST /reports', () => {
  it('приема тихо при задействан honeypot, без да записва', async () => {
    const res = await request(app).post('/reports').field('website', 'spam-bot');
    expect(res.status).toBe(201);
    expect(typeof res.body.publicCode).toBe('string');
    expect(res.body.publicCode.length).toBeGreaterThan(0);
  });

  it('връща 400 с issues при липсващи задължителни полета', async () => {
    const res = await request(app).post('/reports').field('foo', 'bar');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Невалидни данни.');
    expect(Array.isArray(res.body.issues)).toBe(true);
    const fields = res.body.issues.map((i: { field: string }) => i.field);
    expect(fields).toContain('categorySlug');
    expect(fields).toContain('settlementSlug');
  });

  it('връща 400, когато данните са валидни, но липсва медия', async () => {
    const res = await request(app)
      .post('/reports')
      .field('categorySlug', 'smet')
      .field('settlementSlug', 'bobov-dol');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Добави поне една снимка или клип.');
  });
});

describe('admin guard', () => {
  it('връща 401 за /admin/reports без сесия', async () => {
    const res = await request(app).get('/admin/reports');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Изисква се вписване.');
  });

  it('връща 401 при невалиден сесиен токен', async () => {
    const res = await request(app)
      .get('/admin/reports')
      .set('Cookie', 'pomagam_session=not-a-real-jwt');
    expect(res.status).toBe(401);
  });
});

describe('маршрутизация', () => {
  it('връща 404 с JSON за непознат маршрут', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Не е намерено.');
  });
});
