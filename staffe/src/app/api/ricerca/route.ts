import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ok, route } from '@/lib/api';

/**
 * Ricerca globale su SKU, codice a barre, nome, descrizione, categoria,
 * materiale, marca, modello compatibile, numeri documento e codici ubicazione.
 *
 * Il termine passa sempre come parametro Prisma (mai concatenato in SQL) e la
 * risposta è limitata: una ricerca deve restare una ricerca, non un'esportazione
 * dell'intero catalogo.
 */
const LIMITE_PER_TIPO = 5;

export const GET = route(async (request: Request) => {
  await requireUser();

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return ok([]);

  const contiene = { contains: q, mode: 'insensitive' as const };

  const [prodotti, ubicazioni, acquisti, vendite] = await Promise.all([
    prisma.product.findMany({
      where: {
        active: true,
        OR: [
          { sku: contiene },
          { barcode: contiene },
          { name: contiene },
          { description: contiene },
          { brand: contiene },
          { compatibility: contiene },
          { category: { name: contiene } },
        ],
      },
      select: { id: true, sku: true, name: true },
      take: LIMITE_PER_TIPO,
      orderBy: { name: 'asc' },
    }),
    prisma.location.findMany({
      where: { active: true, code: contiene },
      select: { id: true, code: true, zone: true, aisle: true },
      take: LIMITE_PER_TIPO,
    }),
    prisma.purchaseOrder.findMany({
      where: { number: contiene },
      select: { id: true, number: true, supplier: { select: { name: true } } },
      take: LIMITE_PER_TIPO,
    }),
    prisma.salesOrder.findMany({
      where: { number: contiene },
      select: { id: true, number: true, customer: { select: { name: true } } },
      take: LIMITE_PER_TIPO,
    }),
  ]);

  return ok([
    ...prodotti.map((p) => ({
      tipo: 'prodotto' as const,
      titolo: `${p.sku} — ${p.name}`,
      sottotitolo: 'Prodotto',
      href: `/prodotti/${p.id}`,
    })),
    ...ubicazioni.map((l) => ({
      tipo: 'ubicazione' as const,
      titolo: l.code,
      sottotitolo: `Ubicazione · zona ${l.zone}, corsia ${l.aisle}`,
      href: `/ubicazioni/${l.id}`,
    })),
    ...acquisti.map((o) => ({
      tipo: 'ordine-acquisto' as const,
      titolo: o.number,
      sottotitolo: `Ordine di acquisto · ${o.supplier.name}`,
      href: `/acquisti/${o.id}`,
    })),
    ...vendite.map((o) => ({
      tipo: 'ordine-vendita' as const,
      titolo: o.number,
      sottotitolo: `Ordine di vendita · ${o.customer.name}`,
      href: `/vendite/${o.id}`,
    })),
  ]);
});
