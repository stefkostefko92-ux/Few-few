import { Router } from 'express';
import { prisma } from '../db.js';
import { principalOf, requireCapability } from '../auth/guards.js';
import { aziendaWhere, scopeOf } from '../auth/scope.js';
import { allAziendeNames, isAziendaId } from '../aziende/service.js';

export const auditRouter: Router = Router();

const PER_PAGE = 50;

/**
 * Одитът: кой, какво, кога. Администраторът на фирма вижда само записите на своята фирма; MASTER —
 * всички (и тези на самия портал) с филтър по фирма. Само четене — маршрут за промяна няма.
 */
auditRouter.get('/registro', requireCapability('audit:view'), async (req, res) => {
  const scope = scopeOf(principalOf(req).user);
  const raw = typeof req.query.p === 'string' ? Number.parseInt(req.query.p, 10) : 1;
  const page = Number.isInteger(raw) && raw >= 1 && raw <= 10_000 ? raw : 1;
  const filter = scope.all && isAziendaId(req.query.azienda) ? req.query.azienda : null;
  const where = aziendaWhere(scope, filter);
  const [total, entries] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { at: 'desc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { actor: { select: { name: true } }, azienda: { select: { name: true } } },
    }),
  ]);
  res.render('audit/index', {
    entries,
    page,
    pages: Math.max(1, Math.ceil(total / PER_PAGE)),
    showAzienda: scope.all,
    aziende: scope.all ? await allAziendeNames() : [],
    aziendaFilter: filter ?? '',
  });
});
