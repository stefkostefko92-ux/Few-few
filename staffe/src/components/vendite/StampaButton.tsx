'use client';

import { Button } from '@/components/ui';

/** Stampa la pagina corrente: il CSS `no-print` toglie il cromo dell'applicazione. */
export function StampaButton({ etichetta = 'Stampa' }: { etichetta?: string }) {
  return (
    <Button type="button" variant="secondario" onClick={() => window.print()}>
      {etichetta}
    </Button>
  );
}
