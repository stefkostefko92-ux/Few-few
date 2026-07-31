import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { created, meta, ok, pagination, readBody, route } from '@/lib/api';
import { prodottoCreaSchema, statoScortaSchema } from '@/lib/validation/prodotti';
import {
  GIACENZA_ZERO,
  giacenzePerProdotto,
  idsPerStatoScorta,
  whereProdotti,
} from '@/components/prodotti/dati';

/**
 * Catalogo prodotti.
 *
 * La giacenza non è un campo del prodotto: viene sempre aggregata al momento
 * dalla tabella `StockItem`, così la lista non può mostrare un numero rimasto
 * indietro rispetto ai movimenti.
 */

export const GET = route(async (request: Request) => {
  const user = await requirePermission('prodotti:leggi');
  const url = new URL(request.url);
  const p = pagination(url);

  const where = whereProdotti({
    q: url.searchParams.get('q'),
    categoriaId: url.searchParams.get('categoriaId'),
    fornitoreId: url.searchParams.get('fornitoreId'),
    soloAttivi: url.searchParams.get('attivi') !== '0',
  });

  const stato = statoScortaSchema.parse(url.searchParams.get('stato') ?? 'tutti');
  const idsStato = await idsPerStatoScorta(stato, where);
  if (idsStato !== null) where.id = { in: idsStato };

  const [total, prodotti] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: {
        category: { select: { id: true, code: true, name: true } },
        supplier: { select: { id: true, code: true, name: true } },
        defaultLocation: { select: { id: true, code: true } },
      },
      orderBy: [{ sku: 'asc' }],
      skip: p.skip,
      take: p.take,
    }),
  ]);

  const giacenze = await giacenzePerProdotto(prodotti.map((x) => x.id));
  // I costi d'acquisto e il margine sono riservati: il magazziniere non li vede.
  const vedeCosti = can(user.role, 'costi:leggi');

  return ok(
    prodotti.map(({ costCents, ...prodotto }) => ({
      ...prodotto,
      ...(vedeCosti ? { costCents } : {}),
      giacenza: giacenze.get(prodotto.id) ?? GIACENZA_ZERO,
    })),
    meta(p, total),
  );
});

export const POST = route(async (request: Request) => {
  const user = await requirePermission('prodotti:scrivi');
  const dati = await readBody(request, prodottoCreaSchema);

  const prodotto = await prisma.product.create({ data: dati });

  await audit({
    userId: user.id,
    action: 'CREATE',
    entity: 'Product',
    entityId: prodotto.id,
    summary: `Creato prodotto ${prodotto.sku} — ${prodotto.name}`,
    changes: dati,
  });

  return created(prodotto);
});
