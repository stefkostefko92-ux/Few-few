import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { EmptyState, PageHeader } from '@/components/ui';
import { Vietato, utenteConPermesso } from '@/components/acquisti/guardia';
import { OrdineAcquistoForm } from '@/components/acquisti/OrdineAcquistoForm';

export const metadata: Metadata = {
  title: 'Nuovo ordine di acquisto',
  description: 'Creazione di un ordine di acquisto in bozza.',
};

/** Il catalogo di una piccola officina sta in un elenco: si carica una volta
 *  e la scelta della riga resta immediata anche con la rete interna lenta. */
const MAX_PRODOTTI = 1000;

export default async function NuovoOrdinePage() {
  const utente = await utenteConPermesso('acquisti:scrivi');
  if (!utente) return <Vietato azione="creare ordini di acquisto" />;

  const [fornitori, prodotti] = await Promise.all([
    prisma.supplier.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.product.findMany({
      where: { active: true },
      select: { id: true, sku: true, name: true, uom: true, costCents: true, vatRateBp: true },
      orderBy: { sku: 'asc' },
      take: MAX_PRODOTTI,
    }),
  ]);

  if (fornitori.length === 0) {
    return (
      <>
        <PageHeader title="Nuovo ordine di acquisto" />
        <EmptyState
          title="Nessun fornitore attivo"
          description="Registrare prima un fornitore in anagrafica, poi tornare qui."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Nuovo ordine di acquisto"
        description="L’ordine nasce in bozza: resta modificabile finché non lo confermi."
      />
      <OrdineAcquistoForm fornitori={fornitori} prodotti={prodotti} />
    </>
  );
}
