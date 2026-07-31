import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { fail, ok, readBody, route } from '@/lib/api';
import { aggiornaClienteSchema, testoONull } from '@/lib/validation/vendite';
import { totaliOrdine } from '../../vendite/_lib';

type Contesto = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Contesto) => {
  await requirePermission('vendite:leggi');
  const { id } = await params;

  const cliente = await prisma.customer.findUnique({
    where: { id },
    include: {
      salesOrders: {
        include: {
          lines: {
            select: { qty: true, unitPriceCents: true, discountBp: true, vatRateBp: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      },
    },
  });
  if (!cliente) return fail(404, 'Cliente non trovato.', 'non_trovato');

  const ordini = cliente.salesOrders.map((o) => ({
    id: o.id,
    number: o.number,
    status: o.status,
    orderedAt: o.orderedAt,
    createdAt: o.createdAt,
    totali: totaliOrdine(o.lines, o),
  }));

  // Fatturato: gli ordini annullati non hanno mai prodotto ricavo e non vanno
  // contati, altrimenti il giro d'affari del cliente è una cifra inventata.
  const validi = ordini.filter((o) => o.status !== 'ANNULLATO');

  return ok({
    ...cliente,
    salesOrders: undefined,
    ordini,
    statistiche: {
      ordini: validi.length,
      imponibileCents: validi.reduce((a, o) => a + o.totali.netCents, 0),
      totaleCents: validi.reduce((a, o) => a + o.totali.totalCents, 0),
      ultimoOrdineAt: ordini[0]?.orderedAt ?? ordini[0]?.createdAt ?? null,
    },
  });
});

export const PATCH = route(async (request: Request, { params }: Contesto) => {
  const utente = await requirePermission('anagrafiche:scrivi');
  const { id } = await params;
  const dati = await readBody(request, aggiornaClienteSchema);

  const esistente = await prisma.customer.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!esistente) return fail(404, 'Cliente non trovato.', 'non_trovato');

  const cliente = await prisma.customer.update({
    where: { id },
    data: {
      ...(dati.code !== undefined && testoONull(dati.code)
        ? { code: testoONull(dati.code) as string }
        : {}),
      ...(dati.name !== undefined ? { name: dati.name } : {}),
      ...(dati.vatNumber !== undefined ? { vatNumber: testoONull(dati.vatNumber) } : {}),
      ...(dati.taxCode !== undefined ? { taxCode: testoONull(dati.taxCode) } : {}),
      ...(dati.sdiCode !== undefined ? { sdiCode: testoONull(dati.sdiCode) } : {}),
      ...(dati.pec !== undefined ? { pec: testoONull(dati.pec) } : {}),
      ...(dati.email !== undefined ? { email: testoONull(dati.email) } : {}),
      ...(dati.phone !== undefined ? { phone: testoONull(dati.phone) } : {}),
      ...(dati.contactName !== undefined ? { contactName: testoONull(dati.contactName) } : {}),
      ...(dati.addressLine !== undefined ? { addressLine: testoONull(dati.addressLine) } : {}),
      ...(dati.city !== undefined ? { city: testoONull(dati.city) } : {}),
      ...(dati.postalCode !== undefined ? { postalCode: testoONull(dati.postalCode) } : {}),
      ...(dati.province !== undefined ? { province: testoONull(dati.province) } : {}),
      ...(dati.country !== undefined && dati.country ? { country: dati.country } : {}),
      ...(dati.shipAddressLine !== undefined
        ? { shipAddressLine: testoONull(dati.shipAddressLine) }
        : {}),
      ...(dati.shipCity !== undefined ? { shipCity: testoONull(dati.shipCity) } : {}),
      ...(dati.shipPostalCode !== undefined
        ? { shipPostalCode: testoONull(dati.shipPostalCode) }
        : {}),
      ...(dati.shipProvince !== undefined ? { shipProvince: testoONull(dati.shipProvince) } : {}),
      ...(dati.shipCountry !== undefined ? { shipCountry: testoONull(dati.shipCountry) } : {}),
      ...(dati.paymentTerms !== undefined ? { paymentTerms: testoONull(dati.paymentTerms) } : {}),
      ...(dati.discountBp !== undefined ? { discountBp: dati.discountBp } : {}),
      ...(dati.notes !== undefined ? { notes: testoONull(dati.notes) } : {}),
      ...(dati.active !== undefined ? { active: dati.active } : {}),
    },
  });

  await audit({
    userId: utente.id,
    action: 'UPDATE',
    entity: 'Customer',
    entityId: cliente.id,
    summary: `Cliente ${cliente.code} — ${cliente.name} aggiornato.`,
    changes: { active: cliente.active, discountBp: cliente.discountBp },
  });

  return ok(cliente);
});

/**
 * «Elimina» un cliente disattivandolo. Gli ordini storici devono restare
 * leggibili: una cancellazione vera lascerebbe documenti senza intestatario.
 */
export const DELETE = route(async (_request: Request, { params }: Contesto) => {
  const utente = await requirePermission('anagrafiche:scrivi');
  const { id } = await params;

  const esistente = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, code: true, name: true, active: true },
  });
  if (!esistente) return fail(404, 'Cliente non trovato.', 'non_trovato');

  const aperti = await prisma.salesOrder.count({
    where: {
      customerId: id,
      status: { in: ['BOZZA', 'PREVENTIVO', 'CONFERMATO', 'IN_PRELIEVO', 'IMBALLATO'] },
    },
  });
  if (aperti > 0) {
    return fail(
      409,
      `Il cliente ha ${aperti} ordini ancora aperti: chiuderli o annullarli prima di disattivarlo.`,
      'vincolo',
    );
  }

  const cliente = await prisma.customer.update({
    where: { id },
    data: { active: false },
    select: { id: true, code: true, name: true, active: true },
  });

  await audit({
    userId: utente.id,
    action: 'DISATTIVA',
    entity: 'Customer',
    entityId: cliente.id,
    summary: `Cliente ${cliente.code} — ${cliente.name} disattivato.`,
  });

  return ok(cliente);
});
