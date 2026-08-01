import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ok, route } from '@/lib/api';

/**
 * Categorie merceologiche — sola lettura: alimentano i filtri e i menu a
 * tendina del catalogo. `?attive=0` include anche quelle disattivate, perché
 * un prodotto storico può ancora puntarci.
 */
export const GET = route(async (request: Request) => {
  await requirePermission('prodotti:leggi');
  const url = new URL(request.url);
  const soloAttive = url.searchParams.get('attive') !== '0';

  const categorie = await prisma.category.findMany({
    where: soloAttive ? { active: true } : undefined,
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      sortOrder: true,
      active: true,
      _count: { select: { products: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  return ok(
    categorie.map(({ _count, ...c }) => ({ ...c, prodotti: _count.products })),
  );
});
