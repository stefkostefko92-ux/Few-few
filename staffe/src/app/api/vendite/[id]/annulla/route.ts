import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { fail, ok, readBody, route } from '@/lib/api';
import { release } from '@/lib/stock';
import { annullaOrdineSchema } from '@/lib/validation/vendite';
import { erroreDati, STATI_ANNULLABILI } from '../../_lib';

type Contesto = { params: Promise<{ id: string }> };

/**
 * Annullamento dell'ordine: libera l'impegno **non ancora prelevato**.
 *
 * La quota già prelevata è uscita dalla giacenza al prelievo e il suo impegno è
 * stato liberato in quel momento: liberarlo di nuovo qui gonfierebbe la
 * disponibilità di merce che fisicamente non c'è più.
 */
export const POST = route(async (request: Request, { params }: Contesto) => {
  const utente = await requirePermission('vendite:scrivi');
  const { id } = await params;
  const { motivo } = await readBody(request, annullaOrdineSchema);

  const esistente = await prisma.salesOrder.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!esistente) return fail(404, 'Ordine di vendita non trovato.', 'non_trovato');
  if (!STATI_ANNULLABILI.includes(esistente.status)) {
    return fail(
      409,
      'Ordine già imballato o spedito: la merce è uscita dal magazzino, serve un reso da cliente.',
      'stato',
    );
  }

  const ordine = await prisma.$transaction(async (tx) => {
    const corrente = await tx.salesOrder.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!corrente) throw erroreDati('Ordine di vendita non trovato.');
    if (!STATI_ANNULLABILI.includes(corrente.status)) {
      throw erroreDati('L’ordine non è più annullabile.');
    }

    if (corrente.status === 'CONFERMATO' || corrente.status === 'IN_PRELIEVO') {
      for (const riga of corrente.lines) {
        const residuo = riga.qty - riga.pickedQty;
        if (residuo > 0) await release(tx, riga.productId, residuo);
      }
    }

    // Le liste di prelievo ancora aperte non hanno più un ordine da servire.
    await tx.pickList.updateMany({
      where: { salesOrderId: id, status: { in: ['APERTA', 'IN_CORSO'] } },
      data: { status: 'ANNULLATA' },
    });

    return tx.salesOrder.update({
      where: { id },
      data: {
        status: 'ANNULLATO',
        notes: corrente.notes
          ? `${corrente.notes}\n[Annullato] ${motivo}`
          : `[Annullato] ${motivo}`,
      },
      select: { id: true, number: true, status: true },
    });
  });

  await audit({
    userId: utente.id,
    action: 'ANNULLA',
    entity: 'SalesOrder',
    entityId: ordine.id,
    summary: `Ordine di vendita ${ordine.number} annullato: impegno liberato.`,
    changes: { motivo },
  });

  return ok(ordine);
});
