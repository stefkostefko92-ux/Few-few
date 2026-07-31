import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { Vietato, utenteConPermesso } from '@/components/acquisti/guardia';
import { FornitoreForm } from '@/components/acquisti/FornitoreForm';

export const metadata: Metadata = {
  title: 'Nuovo fornitore',
  description: 'Registrazione di un nuovo fornitore in anagrafica.',
};

export default async function NuovoFornitorePage() {
  const utente = await utenteConPermesso('anagrafiche:scrivi');
  if (!utente) return <Vietato azione="modificare l’anagrafica fornitori" />;

  return (
    <>
      <PageHeader
        title="Nuovo fornitore"
        description="Il codice è univoco e non si riusa: gli ordini storici continuano a puntarci."
      />
      <FornitoreForm />
    </>
  );
}
