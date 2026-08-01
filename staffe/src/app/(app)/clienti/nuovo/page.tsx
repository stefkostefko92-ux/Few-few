import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, PageHeader } from '@/components/ui';
import { utenteConPermesso } from '@/components/vendite/guardia';
import { FormCliente } from '@/components/vendite/FormCliente';

export const metadata: Metadata = {
  title: 'Nuovo cliente',
  description:
    'Nuova anagrafica cliente con dati di fatturazione elettronica, indirizzi e condizioni commerciali.',
  keywords: [
    'Carbon Stealth',
    'nuovo cliente',
    'codice destinatario SDI',
    'partita IVA',
    'termini di pagamento',
    'gestionale magazzino',
  ],
};

export default async function NuovoClientePage() {
  await utenteConPermesso('anagrafiche:scrivi');

  return (
    <>
      <PageHeader
        title="Nuovo cliente"
        description="Codice destinatario SDI o PEC: senza uno dei due la fattura elettronica non arriva."
        actions={
          <Link href="/clienti">
            <Button variant="fantasma">Torna ai clienti</Button>
          </Link>
        }
      />
      <FormCliente />
    </>
  );
}
