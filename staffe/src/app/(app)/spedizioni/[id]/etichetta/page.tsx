import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { formatDate } from '@/lib/labels';
import { Button } from '@/components/ui';
import { utenteConPermesso } from '@/components/vendite/guardia';
import { StampaButton } from '@/components/vendite/StampaButton';

export const metadata: Metadata = {
  title: 'Etichetta di spedizione',
  description: 'Etichetta di spedizione pronta per la stampa su formato 100×150 mm.',
  keywords: [
    'Carbon Stealth',
    'etichetta di spedizione',
    'stampa 100x150',
    'corriere e tracking',
    'colli e peso',
    'gestionale magazzino ascensori',
  ],
};

/** Il formato dell'etichetta è quello delle stampanti termiche da magazzino. */
const STAMPA = `
@media print {
  @page { size: 100mm 150mm; margin: 4mm; }
  body { background: #fff; color: #000; }
}
`;

export default async function EtichettaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await utenteConPermesso('vendite:leggi');
  const { id } = await params;

  const spedizione = await prisma.shipment.findUnique({
    where: { id },
    include: {
      salesOrder: { include: { customer: true } },
    },
  });
  if (!spedizione) notFound();

  const cliente = spedizione.salesOrder.customer;
  const via = cliente.shipAddressLine ?? cliente.addressLine;
  const citta = [
    cliente.shipPostalCode ?? cliente.postalCode,
    cliente.shipCity ?? cliente.city,
    cliente.shipProvince ?? cliente.province,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STAMPA }} />

      <div className="mb-4 flex flex-wrap gap-2 no-print">
        <StampaButton etichetta="Stampa etichetta" />
        <Link href={`/spedizioni/${spedizione.id}`}>
          <Button variant="fantasma">Torna alla spedizione</Button>
        </Link>
      </div>

      <div className="mx-auto w-[100mm] border-2 border-black bg-white p-3 text-black">
        <p className="text-[10px] uppercase tracking-widest">Mittente</p>
        <p className="text-sm font-semibold">Staffe — Carbon Stealth VCC</p>

        <hr className="my-2 border-black" />

        <p className="text-[10px] uppercase tracking-widest">Destinatario</p>
        <p className="text-xl font-bold leading-tight">{cliente.name}</p>
        {via && <p className="text-base leading-tight">{via}</p>}
        {citta && <p className="text-base leading-tight">{citta}</p>}
        <p className="text-base leading-tight">{cliente.shipCountry ?? cliente.country}</p>
        {cliente.phone && <p className="text-sm">Tel. {cliente.phone}</p>}

        <hr className="my-2 border-black" />

        <div className="flex justify-between text-sm">
          <span>Spedizione</span>
          <span className="font-mono font-bold">{spedizione.number}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Ordine</span>
          <span className="font-mono">{spedizione.salesOrder.number}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Data</span>
          <span>{formatDate(spedizione.shippedAt ?? spedizione.createdAt)}</span>
        </div>

        <div className="mt-2 flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest">Corriere</p>
            <p className="text-base font-semibold">{spedizione.carrier ?? '—'}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest">Colli</p>
            <p className="text-3xl font-bold leading-none">{spedizione.packagesCount}</p>
          </div>
        </div>

        <p className="mt-1 text-sm">
          Peso: {(spedizione.weightGrams / 1000).toFixed(2).replace('.', ',')} kg
        </p>

        {spedizione.trackingNumber && (
          <>
            <hr className="my-2 border-black" />
            <p className="text-[10px] uppercase tracking-widest">Tracking</p>
            <p className="break-all font-mono text-lg font-bold leading-tight">
              {spedizione.trackingNumber}
            </p>
          </>
        )}
      </div>
    </>
  );
}
