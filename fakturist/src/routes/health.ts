import { Router } from 'express';
import { prisma } from '../db.js';

/**
 * `/health` — 200 само ако базата отговаря (сондата на деплоя и на nginx). Маркерът `app` казва КОЙ
 * отговаря на порта (fakturist/deploy/deploy.sh го проверява).
 */
export function healthRouter(): Router {
  const router = Router();
  router.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.set('Cache-Control', 'no-store').json({ ok: true, app: 'fakturist' });
    } catch {
      res.status(503).set('Cache-Control', 'no-store').json({ ok: false, app: 'fakturist' });
    }
  });
  return router;
}
