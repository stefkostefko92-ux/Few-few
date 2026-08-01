'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PurchaseOrderStatus } from '@prisma/client';
import { Button, Field, Input } from '@/components/ui';
import { chiama } from './client-api';

/**
 * Avanzamento dell'ordine: conferma (BOZZA → ORDINATO) e annullamento.
 *
 * I bottoni si nascondono quando la transizione non è possibile, ma la parola
 * definitiva è del server: qui si evita solo di proporre un'azione che darebbe
 * 409. Il motivo dell'annullamento si chiede sempre — un ordine sparito senza
 * spiegazione è un buco nella storia del fornitore.
 */
export function AzioniOrdine({
  id,
  stato,
  puoScrivere,
  puoRicevere: haPermessoRicevimento,
}: {
  id: string;
  stato: PurchaseOrderStatus;
  /** `acquisti:scrivi` — conferma e annullamento. */
  puoScrivere: boolean;
  /**
   * `ricevimenti:scrivi` — chi scarica il camion non è chi firma l'ordine: il
   * magazziniere deve poter aprire il ricevimento anche senza toccare l'ordine.
   */
  puoRicevere: boolean;
}) {
  const router = useRouter();
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [chiedeMotivo, setChiedeMotivo] = useState(false);
  const [motivo, setMotivo] = useState('');

  const puoConfermare = puoScrivere && stato === 'BOZZA';
  const puoAnnullare = puoScrivere && (stato === 'BOZZA' || stato === 'ORDINATO');
  const puoRicevere =
    haPermessoRicevimento && (stato === 'ORDINATO' || stato === 'RICEVUTO_PARZIALE');

  async function esegui(url: string, corpo: unknown) {
    setErrore(null);
    setInCorso(true);
    const esito = await chiama(url, 'POST', corpo);
    setInCorso(false);
    if (!esito.ok) {
      setErrore(esito.messaggio);
      return;
    }
    setChiedeMotivo(false);
    setMotivo('');
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {puoConfermare && (
          <Button
            type="button"
            disabled={inCorso}
            onClick={() => esegui(`/api/acquisti/${id}/conferma`, {})}
          >
            Conferma ordine
          </Button>
        )}
        {puoRicevere && (
          <Button
            type="button"
            variant="secondario"
            onClick={() => router.push(`/ricevimenti/nuovo?ordine=${id}`)}
          >
            Ricevi merce
          </Button>
        )}
        {puoAnnullare && (
          <Button
            type="button"
            variant="pericolo"
            disabled={inCorso}
            onClick={() => setChiedeMotivo((v) => !v)}
            aria-expanded={chiedeMotivo}
          >
            Annulla ordine
          </Button>
        )}
      </div>

      {chiedeMotivo && (
        <div className="max-w-md space-y-2 rounded border border-border bg-surface p-3">
          <Field label="Motivo dell’annullamento" htmlFor="motivo-annullamento">
            <Input
              id="motivo-annullamento"
              value={motivo}
              maxLength={300}
              placeholder="es. fornitore non consegna nei tempi"
              onChange={(e) => setMotivo(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="pericolo"
              disabled={inCorso}
              onClick={() =>
                esegui(`/api/acquisti/${id}/annulla`, { motivo: motivo.trim() || null })
              }
            >
              {inCorso ? 'Annullamento…' : 'Conferma annullamento'}
            </Button>
            <Button
              type="button"
              variant="fantasma"
              onClick={() => setChiedeMotivo(false)}
            >
              Torna indietro
            </Button>
          </div>
        </div>
      )}

      {errore && (
        <p role="alert" className="text-sm text-danger">
          {errore}
        </p>
      )}
    </div>
  );
}
