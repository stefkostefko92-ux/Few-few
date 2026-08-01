import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { fail, ok, readBody, route } from '@/lib/api';
import { reserve } from '@/lib/stock';
import { formatCents } from '@/lib/money';
import { confermaOrdineSchema } from '@/lib/validation/vendite';
import { erroreDati, STATI_MODIFICABILI, totaliOrdine } from '../../_lib';

type Contesto = { params: Promise<{ id: string }> };

/**
 * Conferma dell'ordine: da qui la merce è **impegnata**.
 *
 * Impegno, cambio di stato e notifica stanno in una sola transazione: se
 * l'impegno di una riga fallisce (disponibilità insufficiente → `StockError` →
 * 409) l'ordine non deve restare «confermato» con la merce non riservata,
 * altrimenti due ordini vendono lo stesso pezzo.
 */
export const POST = route(async (request: Request, { params }: Contesto) => {
  const utente = await requirePermission('vendite:scrivi');
  const { id } = await params;
  const dati = await readBody(request, confermaOrdineSchema);

  const esistente = await prisma.salesOrder.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!esistente) return fail(404, 'Ordine di vendita non trovato.', 'non_trovato');
  if (!STATI_MODIFICABILI.includes(esistente.status)) {
    return fail(
      409,
      'Solo una bozza o un preventivo può essere confermato.',
      'stato',
    );
  }

  const ordine = await prisma.$transaction(async (tx) => {
    const corrente = await tx.salesOrder.findUnique({
      where: { id },
      include: { lines: true, customer: { select: { name: true } } },
    });
    if (!corrente) throw erroreDati('Ordine di vendita non trovato.');
    if (!STATI_MODIFICABILI.includes(corrente.status)) {
      throw erroreDati('Ordine già confermato o annullato.');
    }
    if (corrente.lines.length === 0) {
      throw erroreDati('Non si conferma un ordine senza righe.', ['lines']);
    }

    // Impegno della merce, riga per riga: `reserve` lancia se la disponibilità
    // non basta e fa cadere l'intera transazione.
    for (const riga of corrente.lines) {
      await reserve(tx, riga.productId, riga.qty);
    }

    const adesso = new Date();
    const aggiornato = await tx.salesOrder.update({
      where: { id },
      data: {
        status: 'CONFERMATO',
        confirmedAt: adesso,
        orderedAt: corrente.orderedAt ?? adesso,
        ...(dati.notes !== undefined && dati.notes !== null
          ? { notes: dati.notes.trim() || null }
          : {}),
      },
      include: { lines: true },
    });

    const totali = totaliOrdine(aggiornato.lines, aggiornato);
    await tx.notification.create({
      data: {
        type: 'NUOVO_ORDINE',
        level: 'INFO',
        title: `Nuovo ordine confermato: ${aggiornato.number}`,
        body: `${corrente.customer.name} — ${aggiornato.lines.length} righe, ${formatCents(totali.totalCents)}.`,
        entity: 'SalesOrder',
        entityId: aggiornato.id,
      },
    });

    return aggiornato;
  });

  await audit({
    userId: utente.id,
    action: 'CONFERMA',
    entity: 'SalesOrder',
    entityId: ordine.id,
    summary: `Ordine di vendita ${ordine.number} confermato: merce impegnata.`,
    changes: { status: ordine.status, righe: ordine.lines.length },
  });

  return ok({
    id: ordine.id,
    number: ordine.number,
    status: ordine.status,
    totali: totaliOrdine(ordine.lines, ordine),
  });
});
