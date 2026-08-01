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
      {/*
        `no-print`: su un foglio adesivo la griglia deve partire dall'origine
        del foglio. Il titolo stampato spingeva tutte le etichette più in basso
        e ogni codice a barre finiva a cavallo fra due adesivi — il foglio si
        butta. Vale anche per il layout dell'applicazione, già escluso in
        `AppShell`.
      */}
      <div className="no-print">
        <PageHeader
          title="Etichette"
          description="Seleziona prodotti o ubicazioni e stampa le etichette con codice a barre."
        />
      </div>
      <EtichettePageClient
        puoLeggereProdotti={puoLeggereProdotti}
        puoLeggereUbicazioni={puoLeggereUbicazioni}
      />
    </>
  );
}
