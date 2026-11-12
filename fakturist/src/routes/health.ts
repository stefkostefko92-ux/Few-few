import { Router } from 'express';
import { prisma } from '../db.js';

/** `/health` — 200 само ако базата отговаря (сондата на деплоя и на nginx). */
export function healthRouter(): Router {
  const router = Router();
  router.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.set('Cache-Control', 'no-store').json({ ok: true });
    } catch {
      res.status(503).set('Cache-Control', 'no-store').json({ ok: false });
    }
  });
  return router;
}
