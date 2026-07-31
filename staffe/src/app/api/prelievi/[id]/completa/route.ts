import type { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { fail, ok, readBody, route } from '@/lib/api';
import { StockError, applyMovement, checkLowStock, release } from '@/lib/stock';
import { completaPrelievoSchema, testoONull } from '@/lib/validation/vendite';
import { erroreDati } from '../../../vendite/_lib';

type Contesto = { params: Promise<{ id: string }> };

/**
 * Scarica dalla giacenza la quantità prelevata da una ubicazione, spezzandola
 * per lotto.
 *
 * `PickListLine` non porta il lotto (la lista dice *dove*, non *quale colata*),
 * ma `StockItem` è per prodotto × ubicazione × lotto: senza questa ripartizione
 * un prodotto tracciato a lotti non si scaricherebbe affatto, perché la chiave
 * con lotto nullo non esisterebbe.
 */
async function scaricaDaUbicazione(
  tx: Prisma.TransactionClient,
  input: {
    productId: string;
    locationId: string;
    qty: number;
    unitCostCents: number;
    reason: string;
    refId: string;
    userId: string;
  },
): Promise<void> {
  const items = await tx.stockItem.findMany({
    where: { productId: input.productId, locationId: input.locationId, qty: { gt: 0 } },
    orderBy: [{ qty: 'asc' }],
  });

  let residuo = input.qty;
  for (const item of items) {
    if (residuo <= 0) break;
    const quota = Math.min(item.qty, residuo);
    await applyMovement(tx, {
      productId: input.productId,
      qty: quota,
      type: 'PRELIEVO',
      fromLocationId: input.locationId,
      batchId: item.batchId,
      unitCostCents: input.unitCostCents,
      reason: input.reason,
      refType: 'PickList',
      refId: input.refId,
      userId: input.userId,
    });
    residuo -= quota;
  }
  if (residuo > 0) {
    throw new StockError(
      `Giacenza insufficiente nell’ubicazione di prelievo: mancano ${residuo} unità.`,
    );
  }
}

/**
 * Chiusura del prelievo — tutto in **una** transazione: movimenti di magazzino,
 * rilascio dell'impegno, avanzamento dell'ordine e stato della lista. Se una
 * riga non si scarica, non deve restare né il movimento né l'impegno liberato.
 */
export const POST = route(async (request: Request, { params }: Contesto) => {
  const utente = await requirePermission('prelievi:scrivi');
  const { id } = await params;
  const dati = await readBody(request, completaPrelievoSchema);
  const motivo = testoONull(dati.motivoNonVerificate);

  const esistente = await prisma.pickList.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!esistente) return fail(404, 'Lista di prelievo non trovata.', 'non_trovato');
  if (esistente.status !== 'APERTA' && esistente.status !== 'IN_CORSO') {
    return fail(409, 'La lista di prelievo è già chiusa o annullata.', 'stato');
  }

  const esito = await prisma.$transaction(async (tx) => {
    const lista = await tx.pickList.findUnique({
      where: { id },
      include: {
        lines: { include: { product: { select: { sku: true, costCents: true } } } },
        salesOrder: { select: { id: true, number: true, status: true } },
      },
    });
    if (!lista) throw erroreDati('Lista di prelievo non trovata.');
    if (lista.status !== 'APERTA' && lista.status !== 'IN_CORSO') {
      throw erroreDati('La lista di prelievo è già chiusa o annullata.');
    }

    const daScaricare = lista.lines.filter((r) => r.pickedQty > 0);
    if (daScaricare.length === 0) {
      throw erroreDati('Nessuna riga prelevata: non c’è niente da chiudere.');
    }

    // Guardia del prelievo controllato: una riga senza scansione si chiude solo
    // con un motivo esplicito, che finisce nella traccia di controllo.
    const nonVerificate = daScaricare.filter((r) => !r.verified);
    if (nonVerificate.length > 0 && (motivo === null || motivo.length < 5)) {
      throw erroreDati(
        `${nonVerificate.length} righe sono state prelevate senza scansione: indicare il motivo (almeno 5 caratteri) per chiudere la lista.`,
        ['motivoNonVerificate'],
      );
    }

    for (const riga of daScaricare) {
      await scaricaDaUbicazione(tx, {
        productId: riga.productId,
        locationId: riga.locationId,
        qty: riga.pickedQty,
        unitCostCents: riga.product.costCents,
        reason: `Prelievo ${lista.number} per ordine ${lista.salesOrder.number}`,
        refId: lista.id,
        userId: utente.id,
      });
      // L'impegno ha fatto il suo lavoro: la merce ora è fisicamente uscita.
      await release(tx, riga.productId, riga.pickedQty);
      await tx.salesOrderLine.update({
        where: { id: riga.salesOrderLineId },
        data: { pickedQty: { increment: riga.pickedQty } },
      });
    }

    await tx.pickList.update({
      where: { id: lista.id },
      data: { status: 'COMPLETATA', completedAt: new Date() },
    });

    const righeOrdine = await tx.salesOrderLine.findMany({
      where: { orderId: lista.salesOrder.id },
      select: { qty: true, pickedQty: true },
    });
    const completo = righeOrdine.every((r) => r.pickedQty >= r.qty);
    await tx.salesOrder.update({
      where: { id: lista.salesOrder.id },
      data: { status: completo ? 'IMBALLATO' : 'IN_PRELIEVO' },
    });

    for (const productId of new Set(daScaricare.map((r) => r.productId))) {
      await checkLowStock(tx, productId);
    }

    return {
      id: lista.id,
      number: lista.number,
      salesOrderId: lista.salesOrder.id,
      salesOrderNumber: lista.salesOrder.number,
      statoOrdine: completo ? ('IMBALLATO' as const) : ('IN_PRELIEVO' as const),
      righe: daScaricare.length,
      nonVerificate: nonVerificate.length,
    };
  });

  await audit({
    userId: utente.id,
    action: 'COMPLETA',
    entity: 'PickList',
    entityId: esito.id,
    summary: `Prelievo ${esito.number} completato per l’ordine ${esito.salesOrderNumber} (${esito.righe} righe, ${esito.nonVerificate} senza scansione).`,
    changes: { statoOrdine: esito.statoOrdine, motivoNonVerificate: motivo },
  });

  return ok(esito);
});
