import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fail, ok, readBody, route } from '@/lib/api';
import { audit } from '@/lib/audit';
import { confermaOrdineSchema, puoPassareA } from '@/lib/validation/acquisti';

type Contesto = { params: Promise<{ id: string }> };

/**
 * BOZZA → ORDINATO. Da qui l'ordine è un impegno verso il fornitore: le righe
 * si congelano e diventano il metro con cui si misura la merce in arrivo.
 */
export const POST = route(async (request: Request, { params }: Contesto) => {
  const utente = await requirePermission('acquisti:scrivi');
  const { id } = await params;
  const dati = await readBody(request, confermaOrdineSchema);

  const ordine = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      status: true,
      expectedAt: true,
      supplier: { select: { name: true, active: true } },
      _count: { select: { lines: true } },
    },
  });
  if (!ordine) return fail(404, 'Ordine di acquisto non trovato.', 'non_trovato');

  if (!puoPassareA(ordine.status, 'ORDINATO')) {
    return fail(409, 'Solo un ordine in bozza può essere confermato.', 'stato');
  }
  if (ordine._count.lines === 0) {
    return fail(422, 'Un ordine senza righe non può essere confermato.', 'righe');
  }
  if (!ordine.supplier.active) {
    return fail(422, 'Il fornitore è disattivato: non è possibile confermare l’ordine.', 'fornitore');
  }

  const aggiornato = await prisma.purchaseOrder.update({
    where: { id },
    data: {
      status: 'ORDINATO',
      orderedAt: new Date(),
      expectedAt: dati.expectedAt ?? ordine.expectedAt,
    },
  });

  await audit({
    userId: utente.id,
    action: 'CONFERMA',
    entity: 'PurchaseOrder',
    entityId: id,
    summary: `Ordine di acquisto ${aggiornato.number} confermato — ${ordine.supplier.name}`,
    changes: { da: 'BOZZA', a: 'ORDINATO' },
  });

  return ok(aggiornato);
});
