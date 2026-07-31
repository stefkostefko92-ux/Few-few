import { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { nextDocumentNumber } from '@/lib/sequence';
import { StockError } from '@/lib/stock';
import { created, fail, meta, ok, pagination, readBody, route } from '@/lib/api';
import {
  MAX_RIGHE_INVENTARIO,
  STATI_INVENTARIO,
  TIPI_INVENTARIO,
  inventarioCreaSchema,
} from '@/lib/validation/inventario';

/** Elenco dei conteggi, dal più recente. */
export const GET = route(async (request: Request) => {
  await requirePermission('inventario:leggi');

  const url = new URL(request.url);
  const p = pagination(url);
  const stato = url.searchParams.get('stato');
  const tipo = url.searchParams.get('tipo');

  const where: Prisma.InventoryCountWhereInput = {};
  if (stato && (STATI_INVENTARIO as readonly string[]).includes(stato)) {
    where.status = stato as (typeof STATI_INVENTARIO)[number];
  }
  if (tipo && (TIPI_INVENTARIO as readonly string[]).includes(tipo)) {
    where.type = tipo as (typeof TIPI_INVENTARIO)[number];
  }

  const [totale, righe] = await Promise.all([
    prisma.inventoryCount.count({ where }),
    prisma.inventoryCount.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: p.skip,
      take: p.take,
      select: {
        id: true,
        number: true,
        type: true,
        status: true,
        startedAt: true,
        closedAt: true,
        notes: true,
        user: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
    }),
  ]);

  return ok(righe, meta(p, totale));
});

/**
 * Apre un conteggio e ne fotografa la giacenza attesa.
 *
 * La fotografia si scatta DENTRO la transazione che crea il documento: se
 * leggessimo le giacenze prima, un ricevimento arrivato nel frattempo
 * comparirebbe come eccedenza inventata al momento della chiusura.
 *
 * Le righe si aggregano per (prodotto × ubicazione) perché
 * `InventoryCountLine` non ha il lotto: due lotti nella stessa ubicazione
 * violerebbero il vincolo `@@unique([countId, productId, locationId])`.
 */
export const POST = route(async (request: Request) => {
  const user = await requirePermission('inventario:scrivi');
  const input = await readBody(request, inventarioCreaSchema);
  const tipo = input.type ?? 'CICLICO';
  const prodottiScelti = input.productIds ?? [];

  const where: Prisma.StockItemWhereInput = { location: { active: true } };
  if (tipo === 'CICLICO') {
    if (input.zone) where.location = { active: true, zone: input.zone };
    const prodotto: Prisma.ProductWhereInput = {};
    if (input.categoryId) prodotto.categoryId = input.categoryId;
    if (prodottiScelti.length > 0) prodotto.id = { in: prodottiScelti };
    if (Object.keys(prodotto).length > 0) where.product = prodotto;
  }

  // Controllo preventivo solo per dare un messaggio utile: la fotografia buona
  // è quella scattata dentro la transazione, qui sotto.
  const quante = await prisma.stockItem.count({ where });
  if (quante === 0) {
    return fail(
      422,
      'Nessuna giacenza corrisponde ai criteri scelti: non c’è nulla da contare.',
      'inventario_vuoto',
    );
  }

  const conteggio = await prisma.$transaction(
    async (tx) => {
      const items = await tx.stockItem.findMany({
        where,
        select: { productId: true, locationId: true, qty: true },
      });

      const righe = new Map<
        string,
        { productId: string; locationId: string; expectedQty: number }
      >();
      for (const item of items) {
        const chiave = `${item.productId}:${item.locationId}`;
        const riga = righe.get(chiave);
        if (riga) riga.expectedQty += item.qty;
        else
          righe.set(chiave, {
            productId: item.productId,
            locationId: item.locationId,
            expectedQty: item.qty,
          });
      }

      if (righe.size === 0) {
        throw new StockError(
          'Nessuna giacenza corrisponde ai criteri scelti: non c’è nulla da contare.',
        );
      }
      if (righe.size > MAX_RIGHE_INVENTARIO) {
        throw new StockError(
          `Il conteggio genererebbe ${righe.size} righe (massimo ${MAX_RIGHE_INVENTARIO}): restringere i criteri, per esempio contando una zona alla volta.`,
        );
      }

      const number = await nextDocumentNumber(tx, 'inventario');
      return tx.inventoryCount.create({
        data: {
          number,
          type: tipo,
          notes: input.notes,
          userId: user.id,
          lines: { createMany: { data: [...righe.values()] } },
        },
        select: {
          id: true,
          number: true,
          type: true,
          status: true,
          startedAt: true,
          _count: { select: { lines: true } },
        },
      });
    },
    { timeout: 30_000 },
  );

  await audit({
    userId: user.id,
    action: 'CREATE',
    entity: 'InventoryCount',
    entityId: conteggio.id,
    summary: `Apertura inventario ${conteggio.number} (${conteggio.type.toLowerCase()}, ${conteggio._count.lines} righe)`,
    changes: {
      type: tipo,
      zone: input.zone,
      categoryId: input.categoryId,
      prodottiSelezionati: prodottiScelti.length,
    },
  });

  return created(conteggio);
});
