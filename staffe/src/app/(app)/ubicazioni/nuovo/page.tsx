import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { PageHeader } from '@/components/ui';
import { AccessoNegato } from '@/components/prodotti/comuni';
import { FormUbicazione, UBICAZIONE_VUOTA } from '@/components/prodotti/FormUbicazione';

export const metadata: Metadata = { title: 'Nuova ubicazione' };

export default async function PaginaNuovaUbicazione() {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'ubicazioni:scrivi')) {
    return <AccessoNegato cosa="la creazione di ubicazioni" />;
  }

  return (
    <>
      <PageHeader
        title="Nuova ubicazione"
        description="Definisci i cinque livelli della gerarchia, il codice da stampare e l’ordine di percorrenza."
      />
      <FormUbicazione iniziale={UBICAZIONE_VUOTA} />
    </>
  );
}
