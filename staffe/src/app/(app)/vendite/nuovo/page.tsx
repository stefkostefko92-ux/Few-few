import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, EmptyState, PageHeader } from '@/components/ui';
import { utenteConPermesso } from '@/components/vendite/guardia';
import { opzioniEditor } from '@/components/vendite/dati';
import { OrdineEditor } from '@/components/vendite/OrdineEditor';

export const metadata: Metadata = {
  title: 'Nuovo ordine di vendita',
  description:
    'Nuovo preventivo o ordine di vendita: righe, sconti, IVA e totali calcolati sul server.',
  keywords: [
    'Carbon Stealth',
    'nuovo ordine di vendita',
    'preventivo staffe ascensore',
    'sconto di listino',
    'IVA 22% Italia',
    'gestionale magazzino',
  ],
};

export default async function NuovoOrdinePage() {
  await utenteConPermesso('vendite:scrivi');
  const { clienti, prodotti } = await opzioniEditor();

  return (
    <>
      <PageHeader
        title="Nuovo ordine di vendita"
        description="La merce si impegna solo alla conferma: bozza e preventivo non tolgono disponibilità."
        actions={
          <Link href="/vendite">
            <Button variant="fantasma">Torna agli ordini</Button>
          </Link>
        }
      />

      {clienti.length === 0 ? (
        <EmptyState
          title="Nessun cliente in anagrafica"
          description="Un ordine ha bisogno di un intestatario: crea prima il cliente."
          action={
            <Link href="/clienti/nuovo">
              <Button>Nuovo cliente</Button>
            </Link>
          }
        />
      ) : (
        <OrdineEditor clienti={clienti} prodotti={prodotti} />
      )}
    </>
  );
}
