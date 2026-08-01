import { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { meta, ok, pagination, route } from '@/lib/api';
import { leggiFiltriAudit, periodoAudit } from '@/lib/validation/inventario';

/**
 * Consultazione della traccia di controllo. Sola lettura: l'audit non si
 * modifica e non si cancella dall'applicazione, altrimenti non sarebbe una
 * traccia ma un appunto.
 */
export const GET = route(async (request: Request) => {
  await requirePermission('audit:leggi');

  const url = new URL(request.url);
  const p = pagination(url, 50);
  const filtri = leggiFiltriAudit(url.searchParams);
  const periodo = periodoAudit(filtri);

  const where: Prisma.AuditLogWhereInput = {};
  if (filtri.userId) where.userId = filtri.userId;
  if (filtri.entity) where.entity = filtri.entity;
  if (filtri.action) where.action = filtri.action;
  if (periodo.gte || periodo.lte) where.createdAt = periodo;

  const [totale, righe] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: p.skip,
      take: p.take,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        summary: true,
        changes: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  return ok(righe, meta(p, totale));
});
