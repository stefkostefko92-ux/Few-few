import { Router } from 'express';
import { prisma } from '../db.js';

export const healthRouter: Router = Router();

/**
 * Жив ли е процесът и отговаря ли базата. Без подробности навън — само състояние и името: деплоят
 * проверява `"app":"rilievi"`, защото код 200 сам не казва КОЙ отговаря на порта.
 */
healthRouter.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.set('Cache-Control', 'no-store').json({ status: 'ok', app: 'rilievi' });
  } catch {
    res.status(503).set('Cache-Control', 'no-store').json({ status: 'db', app: 'rilievi' });
  }
});

/** Порталът е само за поканени — търсачките нямат работа тук (и не бива да издават, че съществува). */
healthRouter.get('/robots.txt', (_req, res) => {
  res
    .type('text/plain')
    .set('Cache-Control', 'public, max-age=86400')
    .send('User-agent: *\nDisallow: /\n');
});

healthRouter.get('/favicon.ico', (_req, res) => {
  res.redirect(301, '/static/img/favicon.svg');
});
