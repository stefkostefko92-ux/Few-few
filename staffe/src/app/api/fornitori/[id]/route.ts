import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fail, ok, readBody, route } from '@/lib/api';
import { audit } from '@/lib/audit';
import {
  aggiornaFornitoreSchema,
  type CreaFornitore,
} from '@/lib/validation/acquisti';

type Contesto = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Contesto) => {
  await requirePermission('acquisti:leggi');
  const { id } = await params;

  const fornitore = await prisma.supplier.findUnique({
    where: { id },
    include: {
      _count: { select: { products: true, purchaseOrders: true, goodsReceipts: true } },
      products: {
        where: { active: true },
        select: { id: true, sku: true, name: true, costCents: true, uom: true },
        orderBy: { sku: 'asc' },
        take: 200,
      },
    },
  });
  if (!fornitore) return fail(404, 'Fornitore non trovato.', 'non_trovato');

  return ok(fornitore);
});

export const PATCH = route(async (request: Request, { params }: Contesto) => {
  const utente = await requirePermission('anagrafiche:scrivi');
  const { id } = await params;
  // Come nella creazione: il tipo utile è quello d'USCITA dello schema.
  const dati = (await readBody(request, aggiornaFornitoreSchema)) as Partial<
    CreaFornitore
  > & { active?: boolean };

  const esistente = await prisma.supplier.findUnique({ where: { id } });
  if (!esistente) return fail(404, 'Fornitore non trovato.', 'non_trovato');

  const fornitore = await prisma.supplier.update({ where: { id }, data: dati });

  await audit({
    userId: utente.id,
    action: 'UPDATE',
    entity: 'Supplier',
    entityId: id,
    summary: `Fornitore ${fornitore.code} aggiornato`,
    changes: dati,
  });

  return ok(fornitore);
});

/**
 * Non si cancella: si disattiva. Ordini, ricevimenti e movimenti storici
 * devono restare leggibili (tracciabilità), quindi la riga resta a database e
 * sparisce solo dagli elenchi di scelta.
 */
export const DELETE = route(async (_request: Request, { params }: Contesto) => {
  const utente = await requirePermission('anagrafiche:scrivi');
  const { id } = await params;

  const esistente = await prisma.supplier.findUnique({ where: { id } });
  if (!esistente) return fail(404, 'Fornitore non trovato.', 'non_trovato');
  if (!esistente.active) return ok(esistente);

  const fornitore = await prisma.supplier.update({
    where: { id },
    data: { active: false },
  });

  await audit({
    userId: utente.id,
    action: 'DISATTIVA',
    entity: 'Supplier',
    entityId: id,
    summary: `Fornitore ${fornitore.code} disattivato`,
  });

  return ok(fornitore);
});
