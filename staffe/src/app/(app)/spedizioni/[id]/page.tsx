import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import {
  SALES_STATUS_LABELS,
  SALES_STATUS_TONE,
  UOM_LABELS,
  formatDateTime,
} from '@/lib/labels';
import { Badge, Button, Card, PageHeader, Table, Td, Th } from '@/components/ui';
import { utenteConPermesso } from '@/components/vendite/guardia';
import { AzioniSpedizione } from '@/components/vendite/AzioniSpedizione';
import { statoSpedizione } from '@/components/vendite/spedizione-stato';

export const metadata: Metadata = {
  title: 'Spedizione',
  description: 'Dettaglio della spedizione: trasporto, avanzamento, merce e etichetta di spedizione.',
  keywords: [
    'Carbon Stealth',
    'spedizione',
    'tracciatura corriere',
    'etichetta di spedizione',
    'ordine di vendita',
    'gestionale magazzino',
  ],
};

export default async function SpedizionePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const utente = await utenteConPermesso('vendite:leggi');
  const { id } = await params;

  const spedizione = await prisma.shipment.findUnique({
    where: { id },
    include: {
      salesOrder: {
        include: {
          customer: true,
          lines: {
            include: { product: { select: { sku: true, name: true, uom: true } } },
          },
        },
      },
    },
  });
  if (!spedizione) notFound();

  const stato = statoSpedizione(spedizione);
  const ordine = spedizione.salesOrder;

  return (
    <>
      <PageHeader
        title={`Spedizione ${spedizione.number}`}
        description={`Ordine ${ordine.number} — ${ordine.customer.name}`}
        actions={
          <>
            <Link href={`/spedizioni/${spedizione.id}/etichetta`}>
              <Button variant="secondario">Etichetta di spedizione</Button>
            </Link>
            <Link href={`/vendite/${ordine.id}`}>
              <Button variant="fantasma">Apri l’ordine</Button>
            </Link>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge tone={stato.tono}>{stato.etichetta}</Badge>
        <Badge tone={SALES_STATUS_TONE[ordine.status]}>{SALES_STATUS_LABELS[ordine.status]}</Badge>
        <span className="text-sm text-fg-muted">
          Imballata {formatDateTime(spedizione.packedAt)} · partita{' '}
          {formatDateTime(spedizione.shippedAt)} · consegnata{' '}
          {formatDateTime(spedizione.deliveredAt)}
        </span>
      </div>

      <div className="mb-6">
        <AzioniSpedizione
          puoScrivere={can(utente.role, 'spedizioni:scrivi')}
          spedizione={{
            id: spedizione.id,
            carrier: spedizione.carrier,
            trackingNumber: spedizione.trackingNumber,
            packagesCount: spedizione.packagesCount,
            weightGrams: spedizione.weightGrams,
            notes: spedizione.notes,
            packedAt: spedizione.packedAt ? spedizione.packedAt.toISOString() : null,
            shippedAt: spedizione.shippedAt ? spedizione.shippedAt.toISOString() : null,
            deliveredAt: spedizione.deliveredAt ? spedizione.deliveredAt.toISOString() : null,
          }}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Destinazione
          </h2>
          <p className="mt-1 font-medium">{ordine.customer.name}</p>
          <p className="text-sm">
            {ordine.customer.shipAddressLine ?? ordine.customer.addressLine ?? '—'}
          </p>
          <p className="text-sm">
            {[
              ordine.customer.shipPostalCode ?? ordine.customer.postalCode,
              ordine.customer.shipCity ?? ordine.customer.city,
              ordine.customer.shipProvince ?? ordine.customer.province,
            ]
              .filter(Boolean)
              .join(' ') || '—'}
          </p>
          <p className="text-sm">{ordine.customer.shipCountry ?? ordine.customer.country}</p>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">Trasporto</h2>
          <dl className="mt-1 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-fg-muted">Corriere</dt>
              <dd>{spedizione.carrier ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-muted">Tracking</dt>
              <dd>{spedizione.trackingNumber ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-muted">Colli</dt>
              <dd className="tabular-nums">{spedizione.packagesCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-muted">Peso</dt>
              <dd className="tabular-nums">
                {(spedizione.weightGrams / 1000).toFixed(2).replace('.', ',')} kg
              </dd>
            </div>
          </dl>
          {spedizione.notes && (
            <p className="mt-2 whitespace-pre-line text-sm text-fg-muted">{spedizione.notes}</p>
          )}
        </Card>
      </div>

      <section className="mt-8">
        <h2 className="mb-2 text-lg font-semibold">Merce dell’ordine</h2>
        <Table>
          <thead>
            <tr>
              <Th>Codice</Th>
              <Th>Descrizione</Th>
              <Th className="text-right">Ordinato</Th>
              <Th className="text-right">Prelevato</Th>
            </tr>
          </thead>
          <tbody>
            {ordine.lines.map((r) => (
              <tr key={r.id}>
                <Td>{r.product.sku}</Td>
                <Td>{r.product.name}</Td>
                <Td className="text-right tabular-nums">
                  {r.qty} {UOM_LABELS[r.product.uom]}
                </Td>
                <Td className="text-right tabular-nums">{r.pickedQty}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </>
  );
}
