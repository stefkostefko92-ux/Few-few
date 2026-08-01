import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { fail, ok, readBody, route } from '@/lib/api';
import { stockOf } from '@/lib/stock';
import { aggiornaOrdineVenditaSchema, testoONull } from '@/lib/validation/vendite';
import { erroreDati, preparaRighe, STATI_MODIFICABILI, totaliOrdine } from '../_lib';

type Contesto = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Contesto) => {
  await requirePermission('vendite:leggi');
  const { id } = await params;

  const ordine = await prisma.salesOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      lines: { include: { product: { select: { id: true, sku: true, name: true, uom: true } } } },
      pickLists: { select: { id: true, number: true, status: true, createdAt: true } },
      shipments: true,
    },
  });
  if (!ordine) return fail(404, 'Ordine di vendita non trovato.', 'non_trovato');

  // Disponibilità riga per riga: il commerciale deve vedere subito se sta
  // promettendo merce che non c'è.
  const disponibilita = await Promise.all(
    ordine.lines.map(async (r) => [r.id, await stockOf(r.productId)] as const),
  );

  return ok({
    ...ordine,
    totali: totaliOrdine(ordine.lines, ordine),
    disponibilita: Object.fromEntries(disponibilita),
  });
});

/**
 * Modifica dell'ordine. Le righe si riscrivono solo finché il documento è di
 * lavoro (bozza/preventivo): dopo la conferma la merce è impegnata e cambiare
 * le quantità qui lascerebbe l'impegno scollegato dall'ordine.
 */
export const PATCH = route(async (request: Request, { params }: Contesto) => {
  const utente = await requirePermission('vendite:scrivi');
  const { id } = await params;
  const dati = await readBody(request, aggiornaOrdineVenditaSchema);

  const attuale = await prisma.salesOrder.findUnique({
    where: { id },
    select: { id: true, number: true, status: true, customerId: true },
  });
  if (!attuale) return fail(404, 'Ordine di vendita non trovato.', 'non_trovato');

  const modificabile = STATI_MODIFICABILI.includes(attuale.status);
  const soloNote =
    dati.lines === undefined &&
    dati.customerId === undefined &&
    dati.status === undefined &&
    dati.shippingCents === undefined &&
    dati.discountBp === undefined &&
    dati.orderedAt === undefined;

  if (!modificabile && !soloNote) {
    return fail(
      409,
      'Ordine già confermato: si possono aggiornare solo le note. Per cambiare le righe annullare e rifare l’ordine.',
      'stato',
    );
  }

  const ordine = await prisma.$transaction(async (tx) => {
    const customerId = dati.customerId ?? attuale.customerId;
    const cliente = await tx.customer.findUnique({
      where: { id: customerId },
      select: { id: true, active: true, discountBp: true },
    });
    if (!cliente || !cliente.active) {
      throw erroreDati('Cliente inesistente o non più attivo.', ['customerId']);
    }

    if (dati.lines) {
      const righe = await preparaRighe(tx, cliente.discountBp, dati.lines);
      // Sostituzione integrale: più semplice e più sicuro di un diff riga a riga,
      // e in bozza nessun documento a valle punta ancora a queste righe.
      await tx.salesOrderLine.deleteMany({ where: { orderId: id } });
      await tx.salesOrderLine.createMany({
        data: righe.map((r) => ({ ...r, orderId: id })),
      });
    }

    return tx.salesOrder.update({
      where: { id },
      data: {
        customerId,
        ...(dati.status !== undefined ? { status: dati.status } : {}),
        ...(dati.orderedAt !== undefined ? { orderedAt: dati.orderedAt ?? null } : {}),
        ...(dati.shippingCents !== undefined ? { shippingCents: dati.shippingCents } : {}),
        ...(dati.discountBp !== undefined ? { discountBp: dati.discountBp } : {}),
        ...(dati.notes !== undefined ? { notes: testoONull(dati.notes) } : {}),
      },
      include: { lines: true },
    });
  });

  await audit({
    userId: utente.id,
    action: 'UPDATE',
    entity: 'SalesOrder',
    entityId: ordine.id,
    summary: `Ordine di vendita ${ordine.number} aggiornato.`,
    changes: {
      status: ordine.status,
      righe: dati.lines ? ordine.lines.length : undefined,
    },
  });

  return ok({
    id: ordine.id,
    number: ordine.number,
    status: ordine.status,
    totali: totaliOrdine(ordine.lines, ordine),
  });
});
