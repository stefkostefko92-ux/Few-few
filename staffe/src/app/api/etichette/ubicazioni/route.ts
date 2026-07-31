import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { meta, ok, pagination, route } from '@/lib/api';

/**
 * `GET /api/etichette/ubicazioni?q=&page=&perPage=` — elenco delle ubicazioni
 * attive per il selettore di stampa etichette da scaffale (codice, zona,
 * corsia, scaffale, ripiano, vano).
 */
export const GET = route(async (request: Request) => {
  await requirePermission('ubicazioni:leggi');

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const p = pagination(url, 20);

  const where = {
    active: true,
    ...(q.length >= 1 ? { code: { contains: q, mode: 'insensitive' as const } } : {}),
  };

  const [ubicazioni, total] = await Promise.all([
    prisma.location.findMany({
      where,
      select: { id: true, code: true, zone: true, aisle: true, rack: true, shelf: true, bin: true },
      orderBy: [{ pickOrder: 'asc' }, { code: 'asc' }],
      skip: p.skip,
      take: p.take,
    }),
    prisma.location.count({ where }),
  ]);

  return ok(ubicazioni, meta(p, total));
});
