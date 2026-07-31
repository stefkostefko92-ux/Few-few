import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { fail, ok, readBody, route } from '@/lib/api';
import { inventarioAggiornaSchema } from '@/lib/validation/inventario';

type Contesto = { params: Promise<{ id: string }> };

/** Dettaglio del conteggio con le righe, in ordine di percorrenza del magazzino. */
export const GET = route(async (_request: Request, ctx: Contesto) => {
  const user = await requirePermission('inventario:leggi');
  const { id } = await ctx.params;

  const conteggio = await prisma.inventoryCount.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      type: true,
      status: true,
      startedAt: true,
      closedAt: true,
      notes: true,
      user: { select: { id: true, name: true } },
      lines: {
        select: {
          id: true,
          expectedQty: true,
          countedQty: true,
          verified: true,
          note: true,
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              barcode: true,
              uom: true,
              costCents: true,
            },
          },
          location: {
            select: { id: true, code: true, zone: true, pickOrder: true },
          },
        },
        orderBy: [{ location: { pickOrder: 'asc' } }, { product: { sku: 'asc' } }],
      },
    },
  });

  if (!conteggio) return fail(404, 'Inventario non trovato.', 'non_trovato');

  // Il costo esce solo per chi ha il permesso: il magazziniere conta i pezzi,
  // la marginalità non è affare suo. Si toglie qui, dopo la lettura, perché una
  // `select` costruita a pezzi perderebbe i tipi generati da Prisma.
  const vedeCosti = can(user.role, 'costi:leggi');
  return ok({
    ...conteggio,
    lines: conteggio.lines.map((riga) => ({
      ...riga,
      product: vedeCosti
        ? riga.product
        : { ...riga.product, costCents: undefined },
    })),
  });
});

/**
 * Note e cambio di stato manuale (presa in carico, annullamento). La chiusura
 * NON passa da qui: muove giacenze e ha una rotta propria.
 */
export const PATCH = route(async (request: Request, ctx: Contesto) => {
  const user = await requirePermission('inventario:scrivi');
  const { id } = await ctx.params;
  const input = await readBody(request, inventarioAggiornaSchema);

  const attuale = await prisma.inventoryCount.findUnique({
    where: { id },
    select: { id: true, number: true, status: true },
  });
  if (!attuale) return fail(404, 'Inventario non trovato.', 'non_trovato');
  // Un inventario chiuso è un documento contabile: le sue righe hanno già
  // generato rettifiche di giacenza e non si riaprono.
  if (attuale.status === 'CHIUSO') {
    return fail(409, 'Inventario chiuso: non è più modificabile.', 'chiuso');
  }
  if (attuale.status === 'ANNULLATO') {
    return fail(409, 'Inventario annullato: non è più modificabile.', 'annullato');
  }

  const conteggio = await prisma.inventoryCount.update({
    where: { id },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
    select: { id: true, number: true, status: true, notes: true },
  });

  await audit({
    userId: user.id,
    action: 'UPDATE',
    entity: 'InventoryCount',
    entityId: conteggio.id,
    summary: `Inventario ${conteggio.number}: ${input.status ? `stato ${input.status}` : 'note aggiornate'}`,
    changes: { da: attuale.status, a: conteggio.status },
  });

  return ok(conteggio);
});
