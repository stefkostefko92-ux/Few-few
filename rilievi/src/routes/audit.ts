import { Router } from 'express';
import { prisma } from '../db.js';
import { requireCapability } from '../auth/guards.js';

export const auditRouter: Router = Router();

const PER_PAGE = 50;

/** Одитът за ADMIN и нагоре: кой, какво, кога. Само четене — маршрут за промяна няма. */
auditRouter.get('/registro', requireCapability('audit:view'), async (req, res) => {
  const raw = typeof req.query.p === 'string' ? Number.parseInt(req.query.p, 10) : 1;
  const page = Number.isInteger(raw) && raw >= 1 && raw <= 10_000 ? raw : 1;
  const [total, entries] = await prisma.$transaction([
    prisma.auditLog.count(),
    prisma.auditLog.findMany({
      orderBy: { at: 'desc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { actor: { select: { name: true } } },
    }),
  ]);
  res.render('audit/index', {
    entries,
    page,
    pages: Math.max(1, Math.ceil(total / PER_PAGE)),
  });
});
