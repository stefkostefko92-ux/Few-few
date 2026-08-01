'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { invia } from './client';

/**
 * Attivazione e disattivazione del cliente.
 *
 * Non esiste un pulsante «elimina»: gli ordini storici devono restare
 * leggibili, quindi si disattiva. Il server rifiuta la disattivazione se il
 * cliente ha ancora ordini aperti.
 */
export function AzioniCliente({
  clienteId,
  attivo,
}: {
  clienteId: string;
  attivo: boolean;
}) {
  const router = useRouter();
  const [errore, setErrore] = useState<string | null>(null);
  const [attesa, setAttesa] = useState(false);

  async function cambia() {
    setErrore(null);
    setAttesa(true);
    try {
      if (attivo) {
        await invia(`/api/clienti/${clienteId}`, 'DELETE');
      } else {
        await invia(`/api/clienti/${clienteId}`, 'PATCH', { active: true });
      }
      router.refresh();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Errore imprevisto.');
    } finally {
      setAttesa(false);
    }
  }

  return (
    <div className="space-y-2 no-print">
      {errore && (
        <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {errore}
        </p>
      )}
      <Button
        type="button"
        variant={attivo ? 'pericolo' : 'secondario'}
        disabled={attesa}
        onClick={cambia}
      >
        {attesa ? 'Aggiornamento…' : attivo ? 'Disattiva cliente' : 'Riattiva cliente'}
      </Button>
    </div>
  );
}
