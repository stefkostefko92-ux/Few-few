import type { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { created, meta, ok, pagination, readBody, route } from '@/lib/api';
import { nextDocumentNumber } from '@/lib/sequence';
import { creaSpedizioneSchema, testoONull } from '@/lib/validation/vendite';
import { erroreDati } from '../vendite/_lib';

/** Ordini da cui una spedizione può nascere: merce già confermata e impegnata. */
const STATI_SPEDIBILI = ['CONFERMATO', 'IN_PRELIEVO', 'IMBALLATO'] as const;

export const GET = route(async (request: Request) => {
  await requirePermission('vendite:leggi');

  const url = new URL(request.url);
  const p = pagination(url);
  const stato = url.searchParams.get('stato'); // da_imballare | pronte | spedite | consegnate
  const q = (url.searchParams.get('q') ?? '').trim();

  const where: Prisma.ShipmentWhereInput = {
    ...(stato === 'da_imballare' ? { packedAt: null } : {}),
    ...(stato === 'pronte' ? { packedAt: { not: null }, shippedAt: null } : {}),
    ...(stato === 'spedite' ? { shippedAt: { not: null }, deliveredAt: null } : {}),
    ...(stato === 'consegnate' ? { deliveredAt: { not: null } } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: 'insensitive' as const } },
            { trackingNumber: { contains: q, mode: 'insensitive' as const } },
            { salesOrder: { number: { contains: q, mode: 'insensitive' as const } } },
            {
              salesOrder: {
                customer: { name: { contains: q, mode: 'insensitive' as const } },
              },
            },
          ],
        }
      : {}),
  };

  const [spedizioni, totale] = await Promise.all([
    prisma.shipment.findMany({
      where,
      include: {
        salesOrder: {
          select: {
            id: true,
            number: true,
            status: true,
            customer: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      skip: p.skip,
      take: p.take,
    }),
    prisma.shipment.count({ where }),
  ]);

  return ok(spedizioni, meta(p, totale));
});

export const POST = route(async (request: Request) => {
  const utente = await requirePermission('spedizioni:scrivi');
  const dati = await readBody(request, creaSpedizioneSchema);

  const spedizione = await prisma.$transaction(async (tx) => {
    const ordine = await tx.salesOrder.findUnique({
      where: { id: dati.salesOrderId },
      select: { id: true, number: true, status: true },
    });
    if (!ordine) throw erroreDati('Ordine di vendita non trovato.', ['salesOrderId']);
    if (!(STATI_SPEDIBILI as readonly string[]).includes(ordine.status)) {
      throw erroreDati(
        'La spedizione si crea da un ordine confermato, in prelievo o imballato.',
        ['salesOrderId'],
      );
    }

    const number = await nextDocumentNumber(tx, 'spedizione');
    return tx.shipment.create({
      data: {
        number,
        salesOrderId: ordine.id,
        carrier: testoONull(dati.carrier),
        trackingNumber: testoONull(dati.trackingNumber),
        packagesCount: dati.packagesCount ?? 1,
        weightGrams: dati.weightGrams ?? 0,
        // La merce è già imballata: la data di imballo è quella di adesso.
        packedAt: ordine.status === 'IMBALLATO' ? new Date() : null,
        notes: testoONull(dati.notes),
      },
    });
  });

  await audit({
    userId: utente.id,
    action: 'CREATE',
    entity: 'Shipment',
    entityId: spedizione.id,
    summary: `Spedizione ${spedizione.number} creata.`,
    changes: {
      salesOrderId: spedizione.salesOrderId,
      carrier: spedizione.carrier,
      colli: spedizione.packagesCount,
    },
  });

  return created(spedizione);
});
