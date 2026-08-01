import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { meta, ok, pagination, route } from '@/lib/api';

/**
 * `GET /api/etichette/prodotti?q=&page=&perPage=` — elenco dei prodotti attivi
 * per il selettore di stampa etichette (SKU, nome, categoria, ubicazione
 * predefinita). Distinta dalla ricerca globale: qui serve una lista completa
 * e paginabile, non le prime righe per un menù a tendina.
 */
export const GET = route(async (request: Request) => {
  await requirePermission('prodotti:leggi');

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const p = pagination(url, 20);

  const where = {
    active: true,
    ...(q.length >= 1
      ? {
          OR: [
            { sku: { contains: q, mode: 'insensitive' as const } },
            { name: { contains: q, mode: 'insensitive' as const } },
            { barcode: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [prodotti, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: {
        id: true,
        sku: true,
        name: true,
        barcode: true,
        category: { select: { name: true } },
        defaultLocation: { select: { code: true } },
      },
      orderBy: { sku: 'asc' },
      skip: p.skip,
      take: p.take,
    }),
    prisma.product.count({ where }),
  ]);

  return ok(
    prodotti.map((prod) => ({
      id: prod.id,
      sku: prod.sku,
      name: prod.name,
      barcode: prod.barcode,
      categoria: prod.category.name,
      ubicazione: prod.defaultLocation?.code ?? null,
    })),
    meta(p, total),
  );
});
