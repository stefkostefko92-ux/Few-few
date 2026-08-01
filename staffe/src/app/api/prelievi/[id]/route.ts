import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fail, ok, route } from '@/lib/api';

type Contesto = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Contesto) => {
  await requirePermission('prelievi:leggi');
  const { id } = await params;

  const lista = await prisma.pickList.findUnique({
    where: { id },
    include: {
      salesOrder: {
        select: {
          id: true,
          number: true,
          status: true,
          customer: { select: { id: true, code: true, name: true } },
        },
      },
      assignedTo: { select: { id: true, name: true } },
      lines: {
        // L'ordine di percorrenza è il senso stesso della lista: si legge sempre
        // per `sortIndex`, mai per data di creazione.
        orderBy: { sortIndex: 'asc' },
        include: {
          product: {
            select: { id: true, sku: true, barcode: true, name: true, uom: true },
          },
          location: { select: { id: true, code: true, zone: true, aisle: true, pickOrder: true } },
        },
      },
    },
  });
  if (!lista) return fail(404, 'Lista di prelievo non trovata.', 'non_trovato');

  return ok(lista);
});
