import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { EmptyState, PageHeader } from '@/components/ui';
import { Vietato, utenteConPermesso } from '@/components/acquisti/guardia';
import { RicevimentoForm } from '@/components/acquisti/RicevimentoForm';
import { primo, type ParametriRicerca } from '@/components/acquisti/elenco';

export const metadata: Metadata = {
  title: 'Nuovo ricevimento merce',
  description:
    'Registrazione della merce in arrivo: ordine, prodotto, quantità, ubicazione di stoccaggio e lotto.',
};

const MAX_PRODOTTI = 1000;

export default async function NuovoRicevimentoPage({
  searchParams,
}: {
  searchParams: Promise<ParametriRicerca>;
}) {
  const utente = await utenteConPermesso('ricevimenti:scrivi');
  if (!utente) return <Vietato azione="registrare ricevimenti di merce" />;

  const sp = await searchParams;
  const ordineIniziale = primo(sp, 'ordine');

  const [ordiniAperti, fornitori, prodotti, ubicazioni] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { status: { in: ['ORDINATO', 'RICEVUTO_PARZIALE'] } },
      orderBy: [{ orderedAt: 'asc' }],
      select: {
        id: true,
        number: true,
        supplierId: true,
        supplier: { select: { name: true } },
        lines: {
          select: { id: true, productId: true, qty: true, receivedQty: true, unitCostCents: true },
        },
      },
    }),
    prisma.supplier.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.product.findMany({
      where: { active: true },
      select: {
        id: true,
        sku: true,
        name: true,
        uom: true,
        costCents: true,
        batchTracked: true,
        defaultLocationId: true,
      },
      orderBy: { sku: 'asc' },
      take: MAX_PRODOTTI,
    }),
    prisma.location.findMany({
      where: { active: true },
      select: { id: true, code: true, kind: true },
      // La banchina di ricevimento viene per prima: è la destinazione naturale
      // della merce appena scaricata.
      orderBy: [{ kind: 'asc' }, { code: 'asc' }],
    }),
  ]);

  if (ubicazioni.length === 0) {
    return (
      <>
        <PageHeader title="Nuovo ricevimento merce" />
        <EmptyState
          title="Nessuna ubicazione attiva"
          description="Configura almeno un’ubicazione: la merce ricevuta deve entrare in un posto preciso."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Nuovo ricevimento merce"
        description="Alla conferma il sistema crea documento, righe, movimenti di giacenza e avanzamento dell’ordine in un’unica operazione."
      />
      <RicevimentoForm
        ordini={ordiniAperti.map((o) => ({
          id: o.id,
          number: o.number,
          supplierId: o.supplierId,
          supplierName: o.supplier.name,
          righe: o.lines,
        }))}
        fornitori={fornitori}
        prodotti={prodotti}
        ubicazioni={ubicazioni}
        ordineIniziale={ordineIniziale || undefined}
      />
    </>
  );
}
