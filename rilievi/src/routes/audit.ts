import { Router } from 'express';
import { prisma } from '../db.js';
import { principalOf, requireCapability } from '../auth/guards.js';
import { registroWhere } from '../auth/registro.js';
import { scopeFor, spansAziende } from '../auth/scope.js';
import { aziendaFilterOf, aziendeOf } from './schede-shared.js';

export const auditRouter: Router = Router();

const PER_PAGE = 50;

/**
 * Одитът: кой, какво, кога. Който има правото (ADMIN, или роля, на която фирмата го е дала), вижда във
 * всяка своя фирма своите действия и тези на ролите под своята (auth/registro.ts; с филтър, ако фирмите
 * са няколко); MASTER — всички (и тези на самия портал). MASTER не се вижда по име извън своя изглед —
 * за останалите е „Amministrazione del portale“. Само четене — маршрут за промяна няма.
 */
auditRouter.get('/registro', requireCapability('audit:view'), async (req, res) => {
  const viewer = principalOf(req).user;
  const scope = scopeFor(viewer, 'audit:view');
  const raw = typeof req.query.p === 'string' ? Number.parseInt(req.query.p, 10) : 1;
  const page = Number.isInteger(raw) && raw >= 1 && raw <= 10_000 ? raw : 1;
  const filter = aziendaFilterOf(req, scope);
  const where = registroWhere(viewer, scope, filter);
  const [total, entries] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { at: 'desc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        actor: { select: { name: true, master: true } },
        azienda: { select: { name: true } },
      },
    }),
  ]);
  const portal = res.locals.t('users.portalAdmin');
  res.render('audit/index', {
    entries: entries.map((entry) => ({
      ...entry,
      actor: entry.actor && {
        name: entry.actor.master && !viewer.master ? portal : entry.actor.name,
      },
    })),
    page,
    pages: Math.max(1, Math.ceil(total / PER_PAGE)),
    showAzienda: spansAziende(scope),
    aziende: await aziendeOf(req, scope),
    aziendaFilter: filter ?? '',
  });
});
