import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { Card, PageHeader } from '@/components/ui';
import { AccessoNegato } from '@/components/inventario/comuni';
import { NuovoUtenteForm } from '../NuovoUtenteForm';

export const metadata: Metadata = {
  title: 'Nuovo utente',
  description:
    'Creazione di un utente del gestionale con ruolo e password iniziale.',
  keywords: [
    'Carbon Stealth',
    'nuovo utente',
    'ruoli magazzino',
    'password iniziale',
    'gestionale WMS',
    'staffe per ascensori',
  ],
};

export default async function NuovoUtentePage() {
  const utente = await getSessionUser();
  if (!utente) redirect('/accesso');
  if (!can(utente.role, 'utenti:gestisci')) {
    return <AccessoNegato cosa="gli utenti" />;
  }

  return (
    <>
      <PageHeader
        title="Nuovo utente"
        description="Il ruolo decide che cosa vede e che cosa può fare: assegna il minimo che serve al suo lavoro."
      />
      <Card className="max-w-2xl">
        <NuovoUtenteForm />
      </Card>
    </>
  );
}
