import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Button, EmptyState, PageHeader } from '@/components/ui';
import { utenteConPermesso } from '@/components/vendite/guardia';
import { FormSpedizione } from '@/components/vendite/FormSpedizione';

export const metadata: Metadata = {
  title: 'Nuova spedizione',
  description: 'Crea una spedizione da un ordine confermato, in prelievo o imballato.',
  keywords: [
    'Carbon Stealth',
    'nuova spedizione',
    'corriere e tracking',
    'colli e peso',
    'ordini di vendita',
    'WMS ascensori',
  ],
};

export default async function NuovaSpedizionePage() {
  await utenteConPermesso('spedizioni:scrivi');

  const ordini = await prisma.salesOrder.findMany({
    where: { status: { in: ['CONFERMATO', 'IN_PRELIEVO', 'IMBALLATO'] } },
    select: { id: true, number: true, customer: { select: { name: true } } },
    orderBy: [{ status: 'desc' }, { confirmedAt: 'asc' }],
    take: 200,
  });

  return (
    <>
      <PageHeader
        title="Nuova spedizione"
        description="Prima gli ordini già imballati: sono quelli pronti a partire."
        actions={
          <Link href="/spedizioni">
            <Button variant="fantasma">Torna alle spedizioni</Button>
          </Link>
        }
      />

      {ordini.length === 0 ? (
        <EmptyState
          title="Nessun ordine da spedire"
          description="Servono ordini confermati: la merce si impegna alla conferma e si prepara col prelievo."
          action={
            <Link href="/vendite">
              <Button>Vai agli ordini</Button>
            </Link>
          }
        />
      ) : (
        <FormSpedizione
          ordini={ordini.map((o) => ({
            id: o.id,
            number: o.number,
            cliente: o.customer.name,
          }))}
        />
      )}
    </>
  );
}
