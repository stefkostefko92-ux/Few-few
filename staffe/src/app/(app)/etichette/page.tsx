import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { EmptyState, PageHeader } from '@/components/ui';
import { EtichettePageClient } from './EtichettePageClient';

export const metadata: Metadata = { title: 'Etichette' };

/**
 * Stampa etichette — prodotti (SKU/EAN + barcode) e ubicazioni (codice
 * scaffale). Il diritto si verifica qui, sul server: il layout applicativo
 * garantisce solo la sessione, non il permesso specifico della pagina.
 */
export default async function EtichettePage() {
  const user = await getSessionUser();
  const puoLeggereProdotti = !!user && can(user.role, 'prodotti:leggi');
  const puoLeggereUbicazioni = !!user && can(user.role, 'ubicazioni:leggi');

  if (!puoLeggereProdotti && !puoLeggereUbicazioni) {
    return (
      <>
        <PageHeader title="Etichette" />
        <EmptyState
          title="Permesso negato"
          description="Il tuo ruolo non consente di stampare etichette. Se ti serve, chiedi all’amministratore."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Etichette"
        description="Seleziona prodotti o ubicazioni e stampa le etichette con codice a barre."
      />
      <EtichettePageClient
        puoLeggereProdotti={puoLeggereProdotti}
        puoLeggereUbicazioni={puoLeggereUbicazioni}
      />
    </>
  );
}
