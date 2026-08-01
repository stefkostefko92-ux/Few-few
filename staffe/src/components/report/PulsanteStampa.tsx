'use client';

import { Button } from '@/components/ui';

/**
 * Stampa il report usando la finestra di stampa del browser: da lì si ottiene
 * anche il PDF («Salva come PDF»). Nessuna libreria di generazione PDF — il
 * foglio di stile `@media print` è già la definizione dell'impaginato.
 *
 * È l'unico frammento client di tutta l'area report: il resto sono Server
 * Components, quindi i dati non attraversano il browser più del necessario.
 */
export function PulsanteStampa({ etichetta = 'Stampa / PDF' }: { etichetta?: string }) {
  return (
    <Button type="button" variant="secondario" onClick={() => window.print()}>
      {etichetta}
    </Button>
  );
}
