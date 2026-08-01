import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { selectRigaAcquisto } from '@/lib/costi';
import { created, fail, meta, ok, pagination, readBody, route } from '@/lib/api';
import { audit } from '@/lib/audit';
import { nextDocumentNumber } from '@/lib/sequence';
import { creaOrdineAcquistoSchema, whereOrdiniAcquisto } from '@/lib/validation/acquisti';

/**
 * Ordini di acquisto — elenco e creazione.
 *
 * Un ordine nasce sempre in BOZZA: finché non è confermato non impegna nessuno
 * e resta modificabile. Il numero documento (OA-AAAA-NNNN) si prende dentro la
 * transazione con `nextDocumentNumber`, mai prima: due utenti che salvano nello
 * stesso istante devono ottenere due numeri diversi.
 */

export const GET = route(async (request: Request) => {
  const utente = await requirePermission('acquisti:leggi');

  const url = new URL(request.url);
  const p = pagination(url);
  const where = whereOrdiniAcquisto({
    stato: url.searchParams.get('stato'),
    fornitore: url.searchParams.get('fornitore'),
    dal: url.searchParams.get('dal'),
    al: url.searchParams.get('al'),
    q: url.searchParams.get('q'),
  });

  const [ordini, totale] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: p.skip,
      take: p.take,
      include: {
        supplier: { select: { id: true, code: true, name: true } },
        lines: { select: selectRigaAcquisto(utente.role) },
        _count: { select: { receipts: true } },
      },
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  return ok(ordini, meta(p, totale));
});

export const POST = route(async (request: Request) => {
  const utente = await requirePermission('acquisti:scrivi');
  const dati = await readBody(request, creaOrdineAcquistoSchema);

  const fornitore = await prisma.supplier.findUnique({
    where: { id: dati.supplierId },
    select: { id: true, code: true, name: true, active: true },
  });
  if (!fornitore) return fail(422, 'Fornitore non trovato.', 'fornitore');
  if (!fornitore.active) {
    return fail(422, 'Il fornitore è disattivato: non è possibile ordinare.', 'fornitore');
  }

  const idProdotti = [...new Set(dati.righe.map((r) => r.productId))];
  const prodotti = await prisma.product.findMany({
    where: { id: { in: idProdotti } },
    select: { id: true, sku: true, active: true },
  });
  const perId = new Map(prodotti.map((p) => [p.id, p]));
  for (const id of idProdotti) {
    const prodotto = perId.get(id);
    if (!prodotto) return fail(422, 'Una delle righe indica un prodotto inesistente.', 'prodotto');
    if (!prodotto.active) {
      return fail(422, `Il prodotto ${prodotto.sku} è disattivato: non può essere ordinato.`, 'prodotto');
    }
  }

  const ordine = await prisma.$transaction(async (tx) => {
    const numero = await nextDocumentNumber(tx, 'ordineAcquisto');
    return tx.purchaseOrder.create({
      data: {
        number: numero,
        supplierId: fornitore.id,
        status: 'BOZZA',
        expectedAt: dati.expectedAt,
        shippingCents: dati.shippingCents,
        notes: dati.notes,
        createdById: utente.id,
        lines: {
          create: dati.righe.map((r) => ({
            productId: r.productId,
            qty: r.qty,
            unitCostCents: r.unitCostCents,
            discountBp: r.discountBp,
            vatRateBp: r.vatRateBp,
            note: r.note,
          })),
        },
      },
      include: { lines: true, supplier: { select: { id: true, code: true, name: true } } },
    });
  });

  await audit({
    userId: utente.id,
    action: 'CREATE',
    entity: 'PurchaseOrder',
    entityId: ordine.id,
    summary: `Ordine di acquisto ${ordine.number} (bozza) — ${fornitore.name}`,
    changes: { righe: dati.righe.length, shippingCents: dati.shippingCents },
  });

  return created(ordine);
});
