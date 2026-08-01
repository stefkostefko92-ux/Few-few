import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { fail, ok, readBody, route } from '@/lib/api';
import { prodottoAggiornaSchema } from '@/lib/validation/prodotti';
import { selectMovimento } from '@/lib/costi';
import { GIACENZA_ZERO, giacenzePerProdotto, ubicazioniDeiProdotti } from '@/components/prodotti/dati';

type Contesto = { params: Promise<{ id: string }> };

const ULTIMI_MOVIMENTI = 20;

export const GET = route(async (_request: Request, { params }: Contesto) => {
  const user = await requirePermission('prodotti:leggi');
  const { id } = await params;

  const prodotto = await prisma.product.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, code: true, name: true } },
      supplier: { select: { id: true, code: true, name: true } },
      defaultLocation: { select: { id: true, code: true } },
    },
  });
  if (!prodotto) return fail(404, 'Prodotto non trovato.', 'non_trovato');

  const [giacenze, righe, movimenti, allegati] = await Promise.all([
    giacenzePerProdotto([id]),
    ubicazioniDeiProdotti([id]),
    prisma.stockMovement.findMany({
      where: { productId: id },
      select: {
        ...selectMovimento(user.role),
        fromLocation: { select: { id: true, code: true } },
        toLocation: { select: { id: true, code: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: ULTIMI_MOVIMENTI,
    }),
    prisma.attachment.findMany({
      where: { productId: id },
      select: { id: true, kind: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const { costCents, ...pubblico } = prodotto;
  const vedeCosti = can(user.role, 'costi:leggi');

  return ok({
    ...pubblico,
    ...(vedeCosti ? { costCents } : {}),
    giacenza: giacenze.get(id) ?? GIACENZA_ZERO,
    ubicazioni: righe,
    movimenti,
    allegati,
  });
});

export const PATCH = route(async (request: Request, { params }: Contesto) => {
  const user = await requirePermission('prodotti:scrivi');
  const { id } = await params;
  const dati = await readBody(request, prodottoAggiornaSchema);

  const attuale = await prisma.product.findUnique({ where: { id } });
  if (!attuale) return fail(404, 'Prodotto non trovato.', 'non_trovato');

  // Il vincolo min ≤ max vale anche sulla modifica parziale: va verificato sui
  // valori risultanti, non solo su quelli inviati.
  const minStock = dati.minStock ?? attuale.minStock;
  const maxStock = dati.maxStock === undefined ? attuale.maxStock : dati.maxStock;
  if (maxStock !== null && maxStock < minStock) {
    return fail(422, 'La scorta massima non può essere inferiore alla minima.', 'validazione');
  }

  const prodotto = await prisma.product.update({ where: { id }, data: dati });

  await audit({
    userId: user.id,
    action: 'UPDATE',
    entity: 'Product',
    entityId: prodotto.id,
    summary: `Modificato prodotto ${prodotto.sku}`,
    changes: dati,
  });

  return ok(prodotto);
});

/**
 * Disattivazione, non cancellazione: movimenti e righe d'ordine storiche
 * puntano al prodotto e devono restare leggibili (tracciabilità).
 */
export const DELETE = route(async (_request: Request, { params }: Contesto) => {
  const user = await requirePermission('prodotti:scrivi');
  const { id } = await params;

  const prodotto = await prisma.product.findUnique({ where: { id } });
  if (!prodotto) return fail(404, 'Prodotto non trovato.', 'non_trovato');

  const giacenza = await prisma.stockItem.aggregate({
    where: { productId: id },
    _sum: { qty: true },
  });
  if ((giacenza._sum.qty ?? 0) > 0) {
    return fail(
      409,
      'Il prodotto ha ancora giacenza in magazzino: azzerala prima di disattivarlo.',
      'giacenza',
    );
  }

  const aggiornato = await prisma.product.update({
    where: { id },
    data: { active: false },
  });

  await audit({
    userId: user.id,
    action: 'DELETE',
    entity: 'Product',
    entityId: id,
    summary: `Disattivato prodotto ${aggiornato.sku}`,
  });

  return ok({ id, active: false });
});
