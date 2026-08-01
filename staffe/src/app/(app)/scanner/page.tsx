import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { EmptyState, PageHeader } from '@/components/ui';
import { ScannerClient } from './ScannerClient';

export const metadata: Metadata = { title: 'Scanner' };

/**
 * Schermata operativa da telefono: scansiona un codice (prodotto o
 * ubicazione), mostra giacenza e azioni rapide secondo il permesso.
 */
export default async function ScannerPage() {
  const user = await getSessionUser();
  const puoLeggereGiacenze = !!user && can(user.role, 'giacenze:leggi');

  if (!puoLeggereGiacenze || !user) {
    return (
      <>
        <PageHeader title="Scanner" />
        <EmptyState
          title="Permesso negato"
          description="Il tuo ruolo non consente di consultare le giacenze. Se ti serve, chiedi all’amministratore."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Scanner" description="Scansiona un codice a barre, un QR o digitalo a mano." />
      <ScannerClient ruolo={user.role} />
    </>
  );
}
