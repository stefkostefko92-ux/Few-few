import 'server-only';
import { prisma } from '@/lib/db';
import type { ClienteOpzione, ProdottoOpzione } from './OrdineEditor';

/**
 * Dati per l'editor dell'ordine: clienti attivi e catalogo con la
 * **disponibilità** (giacenza meno impegnato).
 *
 * La disponibilità arriva da un solo `groupBy` invece che da una query per
 * prodotto: con qualche centinaio di articoli la differenza fra una query e
 * trecento è la differenza fra una pagina che si apre e una che non si apre.
 */
export async function opzioniEditor(): Promise<{
  clienti: ClienteOpzione[];
  prodotti: ProdottoOpzione[];
}> {
  const [clienti, prodotti, giacenze] = await Promise.all([
    prisma.customer.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true, discountBp: true },
      orderBy: { name: 'asc' },
      take: 1000,
    }),
    prisma.product.findMany({
      where: { active: true },
      select: { id: true, sku: true, name: true, uom: true, priceCents: true, vatRateBp: true },
      orderBy: { sku: 'asc' },
      take: 1000,
    }),
    prisma.stockItem.groupBy({
      by: ['productId'],
      _sum: { qty: true, reservedQty: true },
    }),
  ]);

  const disponibile = new Map(
    giacenze.map((g) => [g.productId, (g._sum.qty ?? 0) - (g._sum.reservedQty ?? 0)]),
  );

  return {
    clienti,
    prodotti: prodotti.map((p) => ({ ...p, disponibile: disponibile.get(p.id) ?? 0 })),
  };
}
