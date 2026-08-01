'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { ProdottiEtichette } from './ProdottiEtichette';
import { UbicazioniEtichette } from './UbicazioniEtichette';

type Scheda = 'prodotti' | 'ubicazioni';

/**
 * Le due schede montano un solo blocco stampabile alla volta: se restassero
 * entrambe nel DOM, "Stampa" produrrebbe le etichette di prodotti *e*
 * ubicazioni insieme.
 */
export function EtichettePageClient({
  puoLeggereProdotti,
  puoLeggereUbicazioni,
}: {
  puoLeggereProdotti: boolean;
  puoLeggereUbicazioni: boolean;
}) {
  const [scheda, setScheda] = useState<Scheda>(puoLeggereProdotti ? 'prodotti' : 'ubicazioni');

  return (
    <div className="space-y-4">
      {puoLeggereProdotti && puoLeggereUbicazioni && (
        <div className="no-print flex gap-2" role="tablist" aria-label="Tipo di etichetta">
          <Button
            variant={scheda === 'prodotti' ? 'primario' : 'secondario'}
            role="tab"
            aria-selected={scheda === 'prodotti'}
            onClick={() => setScheda('prodotti')}
          >
            Prodotti
          </Button>
          <Button
            variant={scheda === 'ubicazioni' ? 'primario' : 'secondario'}
            role="tab"
            aria-selected={scheda === 'ubicazioni'}
            onClick={() => setScheda('ubicazioni')}
          >
            Ubicazioni
          </Button>
        </div>
      )}

      {scheda === 'prodotti' && puoLeggereProdotti && <ProdottiEtichette />}
      {scheda === 'ubicazioni' && puoLeggereUbicazioni && <UbicazioniEtichette />}
    </div>
  );
}
