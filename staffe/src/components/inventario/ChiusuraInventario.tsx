'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@/components/ui';

/**
 * Chiusura del conteggio: genera le rettifiche di giacenza ed è irreversibile.
 *
 * La conferma è in due tempi e le righe non contate fermano la chiusura: «non
 * contato» non è «zero», e chiudere senza accorgersene trasformerebbe una riga
 * dimenticata in un ammanco a registro.
 */
export function ChiusuraInventario({
  inventarioId,
  numero,
  righeNonContate,
}: {
  inventarioId: string;
  numero: string;
  righeNonContate: number;
}) {
  const router = useRouter();
  const [conferma, setConferma] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [daForzare, setDaForzare] = useState(false);
  const [inCorso, setInCorso] = useState(false);

  async function chiudi(forza: boolean) {
    setInCorso(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/inventario/${inventarioId}/chiudi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forza }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setErrore(body?.error?.message ?? 'Chiusura non riuscita.');
        setDaForzare(body?.error?.code === 'righe_non_contate');
        return;
      }
      setConferma(false);
      router.refresh();
    } catch {
      setErrore('Server non raggiungibile: l’inventario NON è stato chiuso.');
    } finally {
      setInCorso(false);
    }
  }

  if (!conferma) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="lg" onClick={() => setConferma(true)}>
          Chiudi l’inventario
        </Button>
        {righeNonContate > 0 && (
          <span className="text-sm text-warn">
            {righeNonContate} righe non ancora contate.
          </span>
        )}
      </div>
    );
  }

  return (
    <Card className="border-warn/50">
      <h2 className="font-semibold">Confermi la chiusura di {numero}?</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Ogni differenza genera un movimento di rettifica sulla giacenza reale.
        L’operazione non si annulla: un conteggio chiuso non si riapre.
      </p>

      {errore && (
        <p className="mt-3 rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {errore}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="lg" onClick={() => chiudi(false)} disabled={inCorso}>
          {inCorso ? 'Chiusura…' : 'Sì, chiudi e rettifica'}
        </Button>
        {daForzare && (
          <Button
            type="button"
            size="lg"
            variant="pericolo"
            onClick={() => chiudi(true)}
            disabled={inCorso}
          >
            Chiudi lasciando invariate le righe non contate
          </Button>
        )}
        <Button
          type="button"
          size="lg"
          variant="secondario"
          onClick={() => {
            setConferma(false);
            setErrore(null);
            setDaForzare(false);
          }}
        >
          Annulla
        </Button>
      </div>
    </Card>
  );
}
