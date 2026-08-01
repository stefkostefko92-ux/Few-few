import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { formatBp, formatCents } from '@/lib/money';
import { SALES_STATUS_LABELS, SALES_STATUS_TONE, formatDate } from '@/lib/labels';
import { Badge, Button, Card, PageHeader, Table, Td, Th } from '@/components/ui';
import { utenteConPermesso } from '@/components/vendite/guardia';
import { FormCliente } from '@/components/vendite/FormCliente';
import { AzioniCliente } from '@/components/vendite/AzioniCliente';
import { totaliOrdine } from '@/app/api/vendite/_lib';

export const metadata: Metadata = {
  title: 'Scheda cliente',
  description:
    'Scheda cliente: anagrafica, dati di fatturazione elettronica, storico ordini e giro d’affari.',
  keywords: [
    'Carbon Stealth',
    'scheda cliente',
    'storico ordini',
    'giro d’affari',
    'codice destinatario SDI',
    'gestionale magazzino ascensori',
  ],
};

export default async function ClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const utente = await utenteConPermesso('vendite:leggi');
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
  if (!cliente) notFound();

  const ordini = cliente.salesOrders.map((o) => ({
    id: o.id,
    number: o.number,
    status: o.status,
    data: o.orderedAt ?? o.createdAt,
    totali: totaliOrdine(o.lines, o),
    righe: o.lines.length,
  }));
  // Gli ordini annullati non hanno prodotto ricavo: contarli gonfierebbe il
  // giro d'affari con merce mai uscita.
  const validi = ordini.filter((o) => o.status !== 'ANNULLATO');
  const imponibile = validi.reduce((a, o) => a + o.totali.netCents, 0);
  const totale = validi.reduce((a, o) => a + o.totali.totalCents, 0);

  const puoScrivere = can(utente.role, 'anagrafiche:scrivi');

  return (
    <>
      <PageHeader
        title={`${cliente.code} — ${cliente.name}`}
        description={
          cliente.active
            ? 'Anagrafica, condizioni commerciali e storico degli ordini.'
            : 'Cliente disattivato: resta leggibile per lo storico, non è più selezionabile su un nuovo ordine.'
        }
        actions={
          <Link href="/clienti">
            <Button variant="fantasma">Torna ai clienti</Button>
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {cliente.active ? <Badge tone="ok">Attivo</Badge> : <Badge tone="errore">Disattivato</Badge>}
        <span className="text-sm text-fg-muted">
          Sconto di listino {formatBp(cliente.discountBp)}
          {cliente.paymentTerms ? ` · ${cliente.paymentTerms}` : ''}
        </span>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-wide text-fg-muted">Ordini validi</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{validi.length}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-fg-muted">Imponibile</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCents(imponibile)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-fg-muted">Totale con IVA</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCents(totale)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-fg-muted">Ultimo ordine</p>
          <p className="mt-1 text-2xl font-semibold">{formatDate(ordini[0]?.data ?? null)}</p>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Fatturazione elettronica
          </h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">Partita IVA</dt>
              <dd>{cliente.vatNumber ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">Codice fiscale</dt>
              <dd>{cliente.taxCode ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">Codice destinatario SDI</dt>
              <dd className="font-mono">{cliente.sdiCode ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">PEC</dt>
              <dd className="break-all">{cliente.pec ?? '—'}</dd>
            </div>
          </dl>
          {!cliente.sdiCode && !cliente.pec && (
            <p className="mt-2 text-xs text-warn">
              Senza codice destinatario né PEC la fattura elettronica non ha recapito.
            </p>
          )}
        </Card>

        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Fatturazione
          </h2>
          <p className="mt-2 text-sm">{cliente.addressLine ?? '—'}</p>
          <p className="text-sm">
            {[cliente.postalCode, cliente.city, cliente.province].filter(Boolean).join(' ') || '—'}
          </p>
          <p className="text-sm">{cliente.country}</p>
          <p className="mt-2 text-sm text-fg-muted">
            {cliente.contactName ?? '—'} · {cliente.email ?? '—'} · {cliente.phone ?? '—'}
          </p>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Spedizione
          </h2>
          <p className="mt-2 text-sm">
            {cliente.shipAddressLine ?? cliente.addressLine ?? '—'}
          </p>
          <p className="text-sm">
            {[
              cliente.shipPostalCode ?? cliente.postalCode,
              cliente.shipCity ?? cliente.city,
              cliente.shipProvince ?? cliente.province,
            ]
              .filter(Boolean)
              .join(' ') || '—'}
          </p>
          <p className="text-sm">{cliente.shipCountry ?? cliente.country}</p>
          {!cliente.shipAddressLine && (
            <p className="mt-2 text-xs text-fg-muted">
              Nessun indirizzo dedicato: la merce va all’indirizzo di fatturazione.
            </p>
          )}
        </Card>
      </div>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">Storico ordini</h2>
        {ordini.length === 0 ? (
          <p className="text-sm text-fg-muted">Nessun ordine per questo cliente.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Numero</Th>
                <Th>Data</Th>
                <Th>Stato</Th>
                <Th className="text-right">Righe</Th>
                <Th className="text-right">Imponibile</Th>
                <Th className="text-right">Totale</Th>
              </tr>
            </thead>
            <tbody>
              {ordini.map((o) => (
                <tr key={o.id}>
                  <Td>
                    <Link href={`/vendite/${o.id}`} className="font-medium underline">
                      {o.number}
                    </Link>
                  </Td>
                  <Td>{formatDate(o.data)}</Td>
                  <Td>
                    <Badge tone={SALES_STATUS_TONE[o.status]}>
                      {SALES_STATUS_LABELS[o.status]}
                    </Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{o.righe}</Td>
                  <Td className="text-right tabular-nums">{formatCents(o.totali.netCents)}</Td>
                  <Td className="text-right font-medium tabular-nums">
                    {formatCents(o.totali.totalCents)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      {puoScrivere && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Modifica anagrafica</h2>
          <FormCliente
            cliente={{
              id: cliente.id,
              code: cliente.code,
              name: cliente.name,
              vatNumber: cliente.vatNumber,
              taxCode: cliente.taxCode,
              sdiCode: cliente.sdiCode,
              pec: cliente.pec,
              email: cliente.email,
              phone: cliente.phone,
              contactName: cliente.contactName,
              addressLine: cliente.addressLine,
              city: cliente.city,
              postalCode: cliente.postalCode,
              province: cliente.province,
              country: cliente.country,
              shipAddressLine: cliente.shipAddressLine,
              shipCity: cliente.shipCity,
              shipPostalCode: cliente.shipPostalCode,
              shipProvince: cliente.shipProvince,
              shipCountry: cliente.shipCountry,
              paymentTerms: cliente.paymentTerms,
              discountBp: cliente.discountBp,
              notes: cliente.notes,
              active: cliente.active,
            }}
          />
          <AzioniCliente clienteId={cliente.id} attivo={cliente.active} />
        </section>
      )}
    </>
  );
}
