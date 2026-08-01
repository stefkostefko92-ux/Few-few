import type { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { created, meta, ok, pagination, readBody, route } from '@/lib/api';
import { clienteSchema, testoONull } from '@/lib/validation/vendite';

/** Progressivo dell'anagrafica quando l'utente non impone un codice suo. */
async function prossimoCodice(tx: Prisma.TransactionClient): Promise<string> {
  const ultimo = await tx.customer.findFirst({
    where: { code: { startsWith: 'CLI-' } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  const n = ultimo ? Number(ultimo.code.slice(4)) : 0;
  return `CLI-${String((Number.isFinite(n) ? n : 0) + 1).padStart(4, '0')}`;
}

export const GET = route(async (request: Request) => {
  await requirePermission('vendite:leggi');

  const url = new URL(request.url);
  const p = pagination(url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const attivi = url.searchParams.get('attivi');

  const contiene = { contains: q, mode: 'insensitive' as const };
  const where: Prisma.CustomerWhereInput = {
    ...(attivi === 'tutti' ? {} : { active: attivi === 'no' ? false : true }),
    ...(q
      ? {
          OR: [
            { code: contiene },
            { name: contiene },
            { vatNumber: contiene },
            { city: contiene },
            { email: contiene },
          ],
        }
      : {}),
  };

  const [clienti, totale] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { _count: { select: { salesOrders: true } } },
      orderBy: [{ name: 'asc' }],
      skip: p.skip,
      take: p.take,
    }),
    prisma.customer.count({ where }),
  ]);

  return ok(clienti, meta(p, totale));
});

export const POST = route(async (request: Request) => {
  const utente = await requirePermission('anagrafiche:scrivi');
  const dati = await readBody(request, clienteSchema);

  const cliente = await prisma.$transaction(async (tx) => {
    const code = testoONull(dati.code) ?? (await prossimoCodice(tx));
    return tx.customer.create({
      data: {
        code,
        name: dati.name,
        vatNumber: testoONull(dati.vatNumber),
        taxCode: testoONull(dati.taxCode),
        sdiCode: testoONull(dati.sdiCode),
        pec: testoONull(dati.pec),
        email: testoONull(dati.email),
        phone: testoONull(dati.phone),
        contactName: testoONull(dati.contactName),
        addressLine: testoONull(dati.addressLine),
        city: testoONull(dati.city),
        postalCode: testoONull(dati.postalCode),
        province: testoONull(dati.province),
        country: dati.country ?? 'IT',
        shipAddressLine: testoONull(dati.shipAddressLine),
        shipCity: testoONull(dati.shipCity),
        shipPostalCode: testoONull(dati.shipPostalCode),
        shipProvince: testoONull(dati.shipProvince),
        shipCountry: testoONull(dati.shipCountry),
        paymentTerms: testoONull(dati.paymentTerms),
        discountBp: dati.discountBp ?? 0,
        notes: testoONull(dati.notes),
        active: dati.active ?? true,
      },
    });
  });

  await audit({
    userId: utente.id,
    action: 'CREATE',
    entity: 'Customer',
    entityId: cliente.id,
    summary: `Cliente ${cliente.code} — ${cliente.name} creato.`,
    changes: { code: cliente.code, discountBp: cliente.discountBp },
  });

  return created(cliente);
});
