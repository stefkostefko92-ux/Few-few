import type { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { fail, ok, readBody, route } from '@/lib/api';
import { applyMovement, checkLowStock } from '@/lib/stock';
import { aggiornaSpedizioneSchema, testoONull } from '@/lib/validation/vendite';
import { erroreDati } from '../../vendite/_lib';

type Contesto = { params: Promise<{ id: string }> };

/**
 * Merce ancora ferma in una ubicazione di spedizione.
 *
 * Se il flusso di magazzino porta il prelevato in una baia di spedizione invece
 * di scaricarlo subito, alla partenza del corriere resta un'uscita da
 * registrare: senza questo movimento la baia resterebbe piena a sistema per
 * sempre. Se non c'è nulla, la merce è già uscita col prelievo e non si
 * registra un doppio scarico.
 */
async function scaricaBaiaSpedizione(
  tx: Prisma.TransactionClient,
  input: { productId: string; qty: number; refId: string; reason: string; userId: string },
): Promise<number> {
  const items = await tx.stockItem.findMany({
    where: {
      productId: input.productId,
      qty: { gt: 0 },
      location: { kind: 'SPEDIZIONE' },
    },
    orderBy: [{ qty: 'asc' }],
  });

  let residuo = input.qty;
  for (const item of items) {
    if (residuo <= 0) break;
    const quota = Math.min(item.qty, residuo);
    await applyMovement(tx, {
      productId: input.productId,
      qty: quota,
      type: 'SPEDIZIONE',
      fromLocationId: item.locationId,
      batchId: item.batchId,
      reason: input.reason,
      refType: 'Shipment',
      refId: input.refId,
      userId: input.userId,
    });
    residuo -= quota;
  }
  return input.qty - residuo;
}

export const PATCH = route(async (request: Request, { params }: Contesto) => {
  const utente = await requirePermission('spedizioni:scrivi');
  const { id } = await params;
  const dati = await readBody(request, aggiornaSpedizioneSchema);

  const esistente = await prisma.shipment.findUnique({
    where: { id },
    select: { id: true, shippedAt: true, deliveredAt: true },
  });
  if (!esistente) return fail(404, 'Spedizione non trovata.', 'non_trovato');
  if (esistente.deliveredAt && dati.stato && dati.stato !== 'CONSEGNATA') {
    return fail(409, 'La spedizione è già consegnata.', 'stato');
  }

  const esito = await prisma.$transaction(async (tx) => {
    const spedizione = await tx.shipment.findUnique({
      where: { id },
      include: {
        salesOrder: {
          select: {
            id: true,
            number: true,
            status: true,
            customer: { select: { name: true } },
            lines: { select: { productId: true, pickedQty: true } },
          },
        },
      },
    });
    if (!spedizione) throw erroreDati('Spedizione non trovata.');

    const adesso = new Date();
    const dataSpedizione: Prisma.ShipmentUpdateInput = {
      ...(dati.carrier !== undefined ? { carrier: testoONull(dati.carrier) } : {}),
      ...(dati.trackingNumber !== undefined
        ? { trackingNumber: testoONull(dati.trackingNumber) }
        : {}),
      ...(dati.packagesCount !== undefined ? { packagesCount: dati.packagesCount } : {}),
      ...(dati.weightGrams !== undefined ? { weightGrams: dati.weightGrams } : {}),
      ...(dati.notes !== undefined ? { notes: testoONull(dati.notes) } : {}),
    };

    let scaricato = 0;

    if (dati.stato === 'IMBALLATA') {
      dataSpedizione.packedAt = spedizione.packedAt ?? adesso;
      if (spedizione.salesOrder.status === 'IN_PRELIEVO' || spedizione.salesOrder.status === 'CONFERMATO') {
        await tx.salesOrder.update({
          where: { id: spedizione.salesOrder.id },
          data: { status: 'IMBALLATO' },
        });
      }
    }

    if (dati.stato === 'SPEDITA') {
      if (spedizione.salesOrder.status === 'ANNULLATO') {
        throw erroreDati('L’ordine è annullato: non si spedisce.');
      }
      if (!spedizione.trackingNumber && !testoONull(dati.trackingNumber)) {
        // Non è un blocco burocratico: senza tracciatura il cliente non ha modo
        // di sapere dov'è la merce e l'assistenza non ha nulla da controllare.
        throw erroreDati(
          'Indicare il numero di tracking prima di segnare la spedizione come partita.',
          ['trackingNumber'],
        );
      }
      dataSpedizione.packedAt = spedizione.packedAt ?? adesso;
      dataSpedizione.shippedAt = spedizione.shippedAt ?? adesso;

      for (const riga of spedizione.salesOrder.lines) {
        if (riga.pickedQty <= 0) continue;
        scaricato += await scaricaBaiaSpedizione(tx, {
          productId: riga.productId,
          qty: riga.pickedQty,
          refId: spedizione.id,
          reason: `Spedizione ${spedizione.number} per ordine ${spedizione.salesOrder.number}`,
          userId: utente.id,
        });
        await checkLowStock(tx, riga.productId);
      }

      await tx.salesOrder.update({
        where: { id: spedizione.salesOrder.id },
        data: { status: 'SPEDITO', shippedAt: adesso },
      });

      await tx.notification.create({
        data: {
          type: 'SPEDIZIONE_PRONTA',
          level: 'INFO',
          title: `Spedizione partita: ${spedizione.number}`,
          body: `Ordine ${spedizione.salesOrder.number} — ${spedizione.salesOrder.customer.name}${
            spedizione.trackingNumber ?? testoONull(dati.trackingNumber)
              ? ` · tracking ${spedizione.trackingNumber ?? testoONull(dati.trackingNumber)}`
              : ''
          }.`,
          entity: 'Shipment',
          entityId: spedizione.id,
        },
      });
    }

    if (dati.stato === 'CONSEGNATA') {
      if (!spedizione.shippedAt && !dataSpedizione.shippedAt) {
        throw erroreDati('Una spedizione non ancora partita non può risultare consegnata.');
      }
      dataSpedizione.deliveredAt = spedizione.deliveredAt ?? adesso;
      await tx.salesOrder.update({
        where: { id: spedizione.salesOrder.id },
        data: { status: 'CONSEGNATO', deliveredAt: adesso },
      });
    }

    const aggiornata = await tx.shipment.update({
      where: { id },
      data: dataSpedizione,
    });
    return { aggiornata, scaricato, ordine: spedizione.salesOrder.number };
  });

  await audit({
    userId: utente.id,
    action: dati.stato ? `SPEDIZIONE_${dati.stato}` : 'UPDATE',
    entity: 'Shipment',
    entityId: esito.aggiornata.id,
    summary: `Spedizione ${esito.aggiornata.number} (ordine ${esito.ordine}) aggiornata${
      esito.scaricato > 0 ? `: ${esito.scaricato} unità scaricate dalla baia di spedizione` : ''
    }.`,
    changes: {
      stato: dati.stato ?? null,
      carrier: esito.aggiornata.carrier,
      trackingNumber: esito.aggiornata.trackingNumber,
      colli: esito.aggiornata.packagesCount,
    },
  });

  return ok(esito.aggiornata);
});
