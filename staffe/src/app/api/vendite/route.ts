import type { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { created, meta, ok, pagination, readBody, route } from '@/lib/api';
import { nextDocumentNumber } from '@/lib/sequence';
import { creaOrdineVenditaSchema, testoONull } from '@/lib/validation/vendite';
import {
  erroreDati,
  isStatoVendita,
  periodoWhere,
  preparaRighe,
  totaliOrdine,
} from './_lib';

/**
 * Elenco degli ordini di vendita, con filtri per stato, cliente e periodo.
 * I totali sono calcolati qui: la lista mostra gli stessi numeri del dettaglio
 * perché nascono dalla stessa funzione.
 */
export const GET = route(async (request: Request) => {
  await requirePermission('vendite:leggi');

  const url = new URL(request.url);
  const p = pagination(url);
  const stato = url.searchParams.get('stato');
  const cliente = url.searchParams.get('cliente');
  const q = (url.searchParams.get('q') ?? '').trim();
  const periodo = periodoWhere(url.searchParams.get('da'), url.searchParams.get('a'));

  const where: Prisma.SalesOrderWhereInput = {
    ...(isStatoVendita(stato) ? { status: stato } : {}),
    ...(cliente ? { customerId: cliente } : {}),
    ...(periodo ?? {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: 'insensitive' as const } },
            { customer: { name: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };

  const [ordini, totale] = await Promise.all([
    prisma.salesOrder.findMany({
      where,
      include: {
        customer: { select: { id: true, code: true, name: true } },
        lines: {
          select: { qty: true, unitPriceCents: true, discountBp: true, vatRateBp: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      skip: p.skip,
      take: p.take,
    }),
    prisma.salesOrder.count({ where }),
  ]);

  return ok(
    ordini.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      customer: o.customer,
      orderedAt: o.orderedAt,
      confirmedAt: o.confirmedAt,
      createdAt: o.createdAt,
      righe: o.lines.length,
      totali: totaliOrdine(o.lines, o),
    })),
    meta(p, totale),
  );
});

/**
 * Nuovo ordine di vendita. Nasce come documento di lavoro (bozza o preventivo):
 * la merce si impegna solo alla conferma, non qui.
 */
export const POST = route(async (request: Request) => {
  const utente = await requirePermission('vendite:scrivi');
  const dati = await readBody(request, creaOrdineVenditaSchema);

  const ordine = await prisma.$transaction(async (tx) => {
    const cliente = await tx.customer.findUnique({
      where: { id: dati.customerId },
      select: { id: true, name: true, active: true, discountBp: true },
    });
    if (!cliente || !cliente.active) {
      throw erroreDati('Cliente inesistente o non più attivo.', ['customerId']);
    }

    const righe = await preparaRighe(tx, cliente.discountBp, dati.lines);
    const number = await nextDocumentNumber(tx, 'ordineVendita');

    return tx.salesOrder.create({
      data: {
        number,
        customerId: cliente.id,
        status: dati.status ?? 'BOZZA',
        orderedAt: dati.orderedAt ?? null,
        shippingCents: dati.shippingCents ?? 0,
        discountBp: dati.discountBp ?? 0,
        notes: testoONull(dati.notes),
        createdById: utente.id,
        lines: { create: righe },
      },
      include: { lines: true },
    });
  });

  await audit({
    userId: utente.id,
    action: 'CREATE',
    entity: 'SalesOrder',
    entityId: ordine.id,
    summary: `Ordine di vendita ${ordine.number} creato (${ordine.lines.length} righe).`,
    changes: { status: ordine.status, customerId: ordine.customerId },
  });

  return created({
    id: ordine.id,
    number: ordine.number,
    status: ordine.status,
    totali: totaliOrdine(ordine.lines, ordine),
  });
});
