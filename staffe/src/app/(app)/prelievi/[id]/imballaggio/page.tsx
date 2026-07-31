import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { UOM_LABELS, formatDate } from '@/lib/labels';
import { Button, Table, Td, Th } from '@/components/ui';
import { utenteConPermesso } from '@/components/vendite/guardia';
import { StampaButton } from '@/components/vendite/StampaButton';

export const metadata: Metadata = {
  title: 'Imballaggio — documento di trasporto',
  description:
    'Distinta di imballaggio e documento di trasporto semplificato, pronto per la stampa.',
  keywords: [
    'Carbon Stealth',
    'documento di trasporto',
    'packing list',
    'imballaggio ordini',
    'spedizione staffe ascensore',
    'gestionale magazzino',
  ],
};

/**
 * Distinta di imballaggio / documento di trasporto semplificato.
 *
 * Non è una fattura e non riporta prezzi: viaggia con la merce, quindi contiene
 * solo ciò che serve a chi la riceve — cosa c'è nei colli e a quale ordine
 * appartiene. Il cromo dell'applicazione è `no-print`.
 */
export default async function ImballaggioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await utenteConPermesso('prelievi:leggi');
  const { id } = await params;

  const lista = await prisma.pickList.findUnique({
    where: { id },
    include: {
      salesOrder: {
        include: {
          customer: true,
          shipments: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
      lines: {
        orderBy: { sortIndex: 'asc' },
        include: {
          product: { select: { sku: true, name: true, uom: true, weightGrams: true } },
          location: { select: { code: true } },
        },
      },
    },
  });
  if (!lista) notFound();

  const cliente = lista.salesOrder.customer;
  const spedizione = lista.salesOrder.shipments[0] ?? null;
  const righe = lista.lines.filter((r) => r.pickedQty > 0);
  const pesoGrammi = righe.reduce((a, r) => a + r.pickedQty * r.product.weightGrams, 0);

  // Se l'indirizzo di spedizione non è compilato la merce va dove si fattura:
  // è la regola commerciale abituale e evita un documento senza destinatario.
  const destinazione = {
    via: cliente.shipAddressLine ?? cliente.addressLine,
    citta: cliente.shipCity ?? cliente.city,
    cap: cliente.shipPostalCode ?? cliente.postalCode,
    provincia: cliente.shipProvince ?? cliente.province,
    paese: cliente.shipCountry ?? cliente.country,
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2 no-print">
        <StampaButton etichetta="Stampa documento" />
        {spedizione && (
          <Link href={`/spedizioni/${spedizione.id}/etichetta`}>
            <Button variant="secondario">Etichetta di spedizione</Button>
          </Link>
        )}
        <Link href={`/prelievi/${lista.id}`}>
          <Button variant="fantasma">Torna al prelievo</Button>
        </Link>
      </div>

      <article className="mx-auto max-w-3xl space-y-6 text-sm">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-lg font-semibold">Staffe — Carbon Stealth VCC</p>
            <p className="text-fg-muted">Documento di trasporto semplificato</p>
          </div>
          <dl className="text-right">
            <div>
              <dt className="inline text-fg-muted">Prelievo: </dt>
              <dd className="inline font-medium">{lista.number}</dd>
            </div>
            <div>
              <dt className="inline text-fg-muted">Ordine: </dt>
              <dd className="inline font-medium">{lista.salesOrder.number}</dd>
            </div>
            <div>
              <dt className="inline text-fg-muted">Data: </dt>
              <dd className="inline font-medium">
                {formatDate(lista.completedAt ?? lista.createdAt)}
              </dd>
            </div>
          </dl>
        </header>

        <section className="grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Destinatario
            </h2>
            <p className="mt-1 font-medium">{cliente.name}</p>
            {destinazione.via && <p>{destinazione.via}</p>}
            <p>
              {[destinazione.cap, destinazione.citta, destinazione.provincia]
                .filter(Boolean)
                .join(' ')}
            </p>
            <p>{destinazione.paese}</p>
            {cliente.vatNumber && <p className="text-fg-muted">P. IVA {cliente.vatNumber}</p>}
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Trasporto
            </h2>
            <p className="mt-1">Causale: vendita</p>
            <p>Colli: {spedizione?.packagesCount ?? '—'}</p>
            <p>
              Peso della merce: {(pesoGrammi / 1000).toFixed(2).replace('.', ',')} kg
              {spedizione && spedizione.weightGrams > 0
                ? ` · peso dichiarato ${(spedizione.weightGrams / 1000).toFixed(2).replace('.', ',')} kg`
                : ''}
            </p>
            <p>Corriere: {spedizione?.carrier ?? '—'}</p>
            <p>Tracking: {spedizione?.trackingNumber ?? '—'}</p>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Merce imballata
          </h2>
          <Table>
            <thead>
              <tr>
                <Th>Codice</Th>
                <Th>Descrizione</Th>
                <Th>Ubicazione</Th>
                <Th className="text-right">Quantità</Th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.id}>
                  <Td>{r.product.sku}</Td>
                  <Td>{r.product.name}</Td>
                  <Td>{r.location.code}</Td>
                  <Td className="text-right tabular-nums">
                    {r.pickedQty} {UOM_LABELS[r.product.uom]}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {righe.length === 0 && (
            <p className="mt-2 text-fg-muted">
              Nessuna riga prelevata: completare il prelievo prima di stampare il documento.
            </p>
          )}
        </section>

        {lista.salesOrder.notes && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Note</h2>
            <p className="mt-1 whitespace-pre-line">{lista.salesOrder.notes}</p>
          </section>
        )}

        <footer className="grid gap-8 border-t border-border pt-6 sm:grid-cols-2">
          <div>
            <p className="text-fg-muted">Firma del conducente</p>
            <div className="mt-8 border-t border-border" />
          </div>
          <div>
            <p className="text-fg-muted">Firma del destinatario</p>
            <div className="mt-8 border-t border-border" />
          </div>
        </footer>
      </article>
    </>
  );
}
