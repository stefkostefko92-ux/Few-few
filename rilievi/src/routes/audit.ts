import { Router } from 'express';
import { prisma } from '../db.js';
import { principalOf, requireCapability } from '../auth/guards.js';
import { registroWhere } from '../auth/registro.js';
import { scopeFor, spansAziende } from '../auth/scope.js';
import { aziendaFilterOf, aziendeOf } from './schede-shared.js';

export const auditRouter: Router = Router();

/**
 * Страницата на всяко изчисление от регистъра (визуалната проверка, 16 ноември 2026: всеки запис „calcolo“ водеше
 * към `/calcolo-argano/<id>` — изчислението на ограничителя и изтритото бяха 404). Без карта — страницата на
 * изчислението; на карта — изчислението в картата; изчисление, което го няма вече, — без връзка. Страницата сама
 * проверява правата на гледащия.
 */
async function pagineCalcoli(ids: string[]): Promise<Map<string, string>> {
  const pagine = new Map<string, string>();
  if (ids.length === 0) return pagine;
  const where = { id: { in: ids } };
  const select = { id: true, schedaId: true } as const;
  const [argano, limitatore] = await Promise.all([
    prisma.calcoloArgano.findMany({ where, select }),
    prisma.calcoloLimitatore.findMany({ where, select }),
  ]);
  for (const c of argano)
    pagine.set(
      c.id,
      c.schedaId ? `/schede/${c.schedaId}/calcolo-argano` : `/calcolo-argano/${c.id}`,
    );
  for (const c of limitatore)
    pagine.set(
      c.id,
      c.schedaId ? `/schede/${c.schedaId}/calcolo-limitatore` : `/calcolo-limitatore/${c.id}`,
    );
  return pagine;
}

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
  const calcoli = await pagineCalcoli(
    entries.flatMap((e) => (e.targetType === 'calcolo' && e.targetId ? [e.targetId] : [])),
  );
  res.render('audit/index', {
    entries: entries.map((entry) => ({
      ...entry,
      paginaCalcolo:
        entry.targetType === 'calcolo' && entry.targetId ? calcoli.get(entry.targetId) : undefined,
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
