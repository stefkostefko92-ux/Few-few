import { Router } from 'express';
import { prisma } from '../db.js';

export const healthRouter: Router = Router();

/**
 * Жив ли е процесът и отговаря ли базата. Без подробности навън — само състояние и името: деплоят
 * проверява `"app":"korpora"`, защото код 200 сам не казва КОЙ отговаря на порта.
 */
healthRouter.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.set('Cache-Control', 'no-store').json({ status: 'ok', app: 'korpora' });
  } catch {
    res.status(503).set('Cache-Control', 'no-store').json({ status: 'db', app: 'korpora' });
  }
});
