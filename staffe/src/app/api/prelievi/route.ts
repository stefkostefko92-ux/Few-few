import type { PickListStatus, Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { created, meta, ok, pagination, readBody, route } from '@/lib/api';
import { nextDocumentNumber } from '@/lib/sequence';
import { suggestPickLocations, type Allocazioni } from '@/lib/stock';
import { creaPrelievoSchema, testoONull } from '@/lib/validation/vendite';
import { erroreDati } from '../vendite/_lib';

function isStatoPrelievo(value: string | null): value is PickListStatus {
  return value !== null && ['APERTA', 'IN_CORSO', 'COMPLETATA', 'ANNULLATA'].includes(value);
}

export const GET = route(async (request: Request) => {
  await requirePermission('prelievi:leggi');

  const url = new URL(request.url);
  const p = pagination(url);
  const stato = url.searchParams.get('stato');
  const ordine = url.searchParams.get('ordine');

  const where: Prisma.PickListWhereInput = {
    ...(isStatoPrelievo(stato) ? { status: stato } : {}),
    ...(ordine ? { salesOrderId: ordine } : {}),
  };

  const [liste, totale] = await Promise.all([
    prisma.pickList.findMany({
      where,
      include: {
        salesOrder: {
          select: { id: true, number: true, customer: { select: { name: true } } },
        },
        assignedTo: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
      skip: p.skip,
      take: p.take,
    }),
    prisma.pickList.count({ where }),
  ]);

  return ok(liste, meta(p, totale));
});

/**
 * Genera la lista di prelievo da un ordine confermato.
 *
 * Il valore della lista non è l'elenco, è l'**ordine di percorrenza**: le righe
 * si ordinano per `Location.pickOrder`, così il magazziniere attraversa il
 * capannone una volta sola invece di tornare indietro a ogni riga.
 */
export const POST = route(async (request: Request) => {
  const utente = await requirePermission('prelievi:scrivi');
  const dati = await readBody(request, creaPrelievoSchema);

  const lista = await prisma.$transaction(async (tx) => {
    const ordine = await tx.salesOrder.findUnique({
      where: { id: dati.salesOrderId },
      include: { lines: true },
    });
    if (!ordine) throw erroreDati('Ordine di vendita non trovato.', ['salesOrderId']);
    if (ordine.status !== 'CONFERMATO' && ordine.status !== 'IN_PRELIEVO') {
      throw erroreDati(
        'La lista di prelievo si genera solo da un ordine confermato.',
        ['salesOrderId'],
      );
    }

    const aperta = await tx.pickList.findFirst({
      where: { salesOrderId: ordine.id, status: { in: ['APERTA', 'IN_CORSO'] } },
      select: { number: true },
    });
    if (aperta) {
      throw erroreDati(
        `Esiste già una lista di prelievo aperta per questo ordine (${aperta.number}).`,
        ['salesOrderId'],
      );
    }

    // Righe suggerite dal motore delle giacenze: si svuotano prima i vani
    // parziali, poi si riordina tutto per percorso.
    const grezze: Array<{
      salesOrderLineId: string;
      productId: string;
      locationId: string;
      qty: number;
    }> = [];
    // Registro condiviso fra le righe: due righe dello stesso prodotto non
    // devono ricevere due volte la stessa giacenza (le quantità si scaricano
    // solo alla chiusura del prelievo, quindi il database non le «vede» ancora).
    const allocate: Allocazioni = new Map();
    for (const riga of ordine.lines) {
      const residuo = riga.qty - riga.pickedQty;
      if (residuo <= 0) continue;
      const suggerite = await suggestPickLocations(riga.productId, residuo, tx, allocate);
      for (const s of suggerite) {
        grezze.push({
          salesOrderLineId: riga.id,
          productId: riga.productId,
          locationId: s.locationId,
          qty: s.qty,
        });
      }
    }
    if (grezze.length === 0) {
      throw erroreDati('Non resta nulla da prelevare su questo ordine.', ['salesOrderId']);
    }

    const ubicazioni = await tx.location.findMany({
      where: { id: { in: [...new Set(grezze.map((g) => g.locationId))] } },
      select: { id: true, code: true, pickOrder: true },
    });
    const percorso = new Map(ubicazioni.map((u) => [u.id, u]));
    grezze.sort((a, b) => {
      const ua = percorso.get(a.locationId);
      const ub = percorso.get(b.locationId);
      const diff = (ua?.pickOrder ?? 0) - (ub?.pickOrder ?? 0);
      // A parità di ordine di percorso si va per codice: il giro resta comunque
      // deterministico e la lista stampata è sempre uguale a quella a video.
      return diff !== 0 ? diff : (ua?.code ?? '').localeCompare(ub?.code ?? '');
    });

    const number = await nextDocumentNumber(tx, 'prelievo');
    const creata = await tx.pickList.create({
      data: {
        number,
        salesOrderId: ordine.id,
        status: 'APERTA',
        assignedToId: dati.assignedToId ?? null,
        notes: testoONull(dati.notes),
        lines: {
          create: grezze.map((g, i) => ({
            salesOrderLineId: g.salesOrderLineId,
            productId: g.productId,
            locationId: g.locationId,
            qty: g.qty,
            sortIndex: i,
          })),
        },
      },
      include: { lines: true },
    });

    if (ordine.status !== 'IN_PRELIEVO') {
      await tx.salesOrder.update({
        where: { id: ordine.id },
        data: { status: 'IN_PRELIEVO' },
      });
    }

    return creata;
  });

  await audit({
    userId: utente.id,
    action: 'CREATE',
    entity: 'PickList',
    entityId: lista.id,
    summary: `Lista di prelievo ${lista.number} generata (${lista.lines.length} righe).`,
    changes: { salesOrderId: lista.salesOrderId },
  });

  return created({ id: lista.id, number: lista.number, righe: lista.lines.length });
});
