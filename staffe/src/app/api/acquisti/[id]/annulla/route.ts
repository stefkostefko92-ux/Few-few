import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fail, ok, readBody, route } from '@/lib/api';
import { audit } from '@/lib/audit';
import { annullaOrdineSchema, puoPassareA } from '@/lib/validation/acquisti';

type Contesto = { params: Promise<{ id: string }> };

/**
 * Annullamento dell'ordine.
 *
 * Si annulla solo prima che entri merce: se anche una sola riga ha una quantità
 * ricevuta, il magazzino contiene già pezzi giustificati da questo ordine e
 * annullarlo lascerebbe movimenti senza documento. In quel caso la strada
 * corretta è il reso al fornitore, non l'annullamento.
 */
export const POST = route(async (request: Request, { params }: Contesto) => {
  const utente = await requirePermission('acquisti:scrivi');
  const { id } = await params;
  const { motivo } = await readBody(request, annullaOrdineSchema);

  const ordine = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      status: true,
      notes: true,
      lines: { select: { receivedQty: true } },
    },
  });
  if (!ordine) return fail(404, 'Ordine di acquisto non trovato.', 'non_trovato');

  if (!puoPassareA(ordine.status, 'ANNULLATO')) {
    return fail(
      409,
      ordine.status === 'ANNULLATO'
        ? 'L’ordine è già annullato.'
        : 'Un ordine con merce già ricevuta non può essere annullato: registrare un reso al fornitore.',
      'stato',
    );
  }
  if (ordine.lines.some((r) => r.receivedQty > 0)) {
    return fail(
      409,
      'Un ordine con merce già ricevuta non può essere annullato: registrare un reso al fornitore.',
      'stato',
    );
  }

  const note = motivo
    ? [ordine.notes, `Annullato: ${motivo}`].filter(Boolean).join('\n')
    : ordine.notes;

  const aggiornato = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: 'ANNULLATO', notes: note },
  });

  await audit({
    userId: utente.id,
    action: 'ANNULLA',
    entity: 'PurchaseOrder',
    entityId: id,
    summary: `Ordine di acquisto ${aggiornato.number} annullato`,
    changes: { da: ordine.status, a: 'ANNULLATO', motivo: motivo ?? null },
  });

  return ok(aggiornato);
});
