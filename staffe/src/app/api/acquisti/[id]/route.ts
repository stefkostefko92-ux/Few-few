import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fail, ok, readBody, route } from '@/lib/api';
import { audit } from '@/lib/audit';
import { aggiornaOrdineAcquistoSchema } from '@/lib/validation/acquisti';

type Contesto = { params: Promise<{ id: string }> };

const DETTAGLIO = {
  supplier: true,
  createdBy: { select: { id: true, name: true } },
  lines: {
    include: {
      product: { select: { id: true, sku: true, name: true, uom: true, batchTracked: true } },
    },
  },
  receipts: {
    select: { id: true, number: true, receivedAt: true, invoiceNumber: true },
    orderBy: { receivedAt: 'desc' as const },
  },
} as const;

export const GET = route(async (_request: Request, { params }: Contesto) => {
  await requirePermission('acquisti:leggi');
  const { id } = await params;

  const ordine = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: DETTAGLIO,
  });
  if (!ordine) return fail(404, 'Ordine di acquisto non trovato.', 'non_trovato');

  return ok(ordine);
});

/**
 * Modifica dell'ordine: **solo in BOZZA**. Dopo la conferma l'ordine è un
 * impegno verso il fornitore e le righe sono il riferimento con cui si
 * controlla la merce in arrivo: cambiarle a posteriori renderebbe il confronto
 * ordinato/ricevuto una finzione.
 */
export const PATCH = route(async (request: Request, { params }: Contesto) => {
  const utente = await requirePermission('acquisti:scrivi');
  const { id } = await params;
  const dati = await readBody(request, aggiornaOrdineAcquistoSchema);

  const esistente = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: { id: true, number: true, status: true },
  });
  if (!esistente) return fail(404, 'Ordine di acquisto non trovato.', 'non_trovato');
  if (esistente.status !== 'BOZZA') {
    return fail(
      409,
      'Solo un ordine in bozza può essere modificato. Annullare l’ordine e crearne uno nuovo.',
      'stato',
    );
  }

  if (dati.supplierId) {
    const fornitore = await prisma.supplier.findUnique({
      where: { id: dati.supplierId },
      select: { id: true, active: true },
    });
    if (!fornitore) return fail(422, 'Fornitore non trovato.', 'fornitore');
    if (!fornitore.active) return fail(422, 'Il fornitore è disattivato.', 'fornitore');
  }

  if (dati.righe) {
    const idProdotti = [...new Set(dati.righe.map((r) => r.productId))];
    const prodotti = await prisma.product.findMany({
      where: { id: { in: idProdotti } },
      select: { id: true, sku: true, active: true },
    });
    const perId = new Map(prodotti.map((p) => [p.id, p]));
    for (const idProdotto of idProdotti) {
      const prodotto = perId.get(idProdotto);
      if (!prodotto) return fail(422, 'Una delle righe indica un prodotto inesistente.', 'prodotto');
      if (!prodotto.active) {
        return fail(422, `Il prodotto ${prodotto.sku} è disattivato.`, 'prodotto');
      }
    }
  }

  const ordine = await prisma.$transaction(async (tx) => {
    if (dati.righe) {
      // In bozza `receivedQty` è sempre 0: sostituire il corpo dell'ordine non
      // perde nulla di ricevuto.
      await tx.purchaseOrderLine.deleteMany({ where: { orderId: id } });
      await tx.purchaseOrderLine.createMany({
        data: dati.righe.map((r) => ({
          orderId: id,
          productId: r.productId,
          qty: r.qty,
          unitCostCents: r.unitCostCents,
          discountBp: r.discountBp,
          vatRateBp: r.vatRateBp,
          note: r.note,
        })),
      });
    }
    return tx.purchaseOrder.update({
      where: { id },
      data: {
        supplierId: dati.supplierId,
        expectedAt: dati.expectedAt,
        shippingCents: dati.shippingCents,
        notes: dati.notes,
      },
      include: DETTAGLIO,
    });
  });

  await audit({
    userId: utente.id,
    action: 'UPDATE',
    entity: 'PurchaseOrder',
    entityId: id,
    summary: `Ordine di acquisto ${ordine.number} modificato (bozza)`,
    changes: { righe: dati.righe?.length ?? null, shippingCents: dati.shippingCents ?? null },
  });

  return ok(ordine);
});
