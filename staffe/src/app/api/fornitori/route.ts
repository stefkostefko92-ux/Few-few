import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { created, meta, ok, pagination, readBody, route } from '@/lib/api';
import { audit } from '@/lib/audit';
import {
  creaFornitoreSchema,
  whereFornitori,
  type CreaFornitore,
} from '@/lib/validation/acquisti';

/**
 * Anagrafica fornitori.
 *
 * Lettura con `acquisti:leggi` (anche il magazziniere deve sapere da chi arriva
 * la merce che riceve); scrittura con `anagrafiche:scrivi`.
 */

export const GET = route(async (request: Request) => {
  await requirePermission('acquisti:leggi');

  const url = new URL(request.url);
  const p = pagination(url);
  const where = whereFornitori({
    q: url.searchParams.get('q'),
    attivo: url.searchParams.get('attivo'),
  });

  const [fornitori, totale] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      skip: p.skip,
      take: p.take,
      include: { _count: { select: { products: true, purchaseOrders: true } } },
    }),
    prisma.supplier.count({ where }),
  ]);

  return ok(fornitori, meta(p, totale));
});

export const POST = route(async (request: Request) => {
  const utente = await requirePermission('anagrafiche:scrivi');
  // `readBody` deduce il tipo d'INGRESSO dello schema; dopo il parse i valori
  // sono quelli d'USCITA — default applicati e stringhe vuote diventate `null`.
  const dati = (await readBody(request, creaFornitoreSchema)) as CreaFornitore;

  const fornitore = await prisma.supplier.create({ data: dati });

  await audit({
    userId: utente.id,
    action: 'CREATE',
    entity: 'Supplier',
    entityId: fornitore.id,
    summary: `Fornitore ${fornitore.code} — ${fornitore.name}`,
    changes: dati,
  });

  return created(fornitore);
});
