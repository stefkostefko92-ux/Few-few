'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Field, Input, Textarea } from '@/components/ui';
import { invia } from './client';

export type SpedizioneModificabile = {
  id: string;
  carrier: string | null;
  trackingNumber: string | null;
  packagesCount: number;
  weightGrams: number;
  notes: string | null;
  packedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
};

/**
 * Dati del trasporto e avanzamento della spedizione.
 *
 * «Spedita» non è solo una data: il server registra l'uscita della merce
 * eventualmente ancora ferma in baia di spedizione e porta l'ordine a SPEDITO.
 * Per questo lo stato si cambia da qui e non con un campo libero.
 */
export function AzioniSpedizione({
  spedizione,
  puoScrivere,
}: {
  spedizione: SpedizioneModificabile;
  puoScrivere: boolean;
}) {
  const router = useRouter();
  const [carrier, setCarrier] = useState(spedizione.carrier ?? '');
  const [tracking, setTracking] = useState(spedizione.trackingNumber ?? '');
  const [colli, setColli] = useState(String(spedizione.packagesCount));
  const [peso, setPeso] = useState(String(spedizione.weightGrams / 1000).replace('.', ','));
  const [note, setNote] = useState(spedizione.notes ?? '');
  const [errore, setErrore] = useState<string | null>(null);
  const [attesa, setAttesa] = useState<string | null>(null);

  function datiTrasporto() {
    const nColli = Number.parseInt(colli, 10);
    const kg = Number.parseFloat(peso.replace(',', '.'));
    return {
      carrier: carrier.trim(),
      trackingNumber: tracking.trim(),
      packagesCount: Number.isFinite(nColli) && nColli > 0 ? nColli : 1,
      weightGrams: Number.isFinite(kg) && kg >= 0 ? Math.round(kg * 1000) : 0,
      notes: note.trim(),
    };
  }

  async function aggiorna(nome: string, stato?: 'IMBALLATA' | 'SPEDITA' | 'CONSEGNATA') {
    setErrore(null);
    setAttesa(nome);
    try {
      await invia(`/api/spedizioni/${spedizione.id}`, 'PATCH', {
        ...datiTrasporto(),
        ...(stato ? { stato } : {}),
      });
      router.refresh();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Errore imprevisto.');
    } finally {
      setAttesa(null);
    }
  }

  if (!puoScrivere) return null;

  return (
    <Card className="space-y-4 no-print">
      {errore && (
        <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {errore}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Corriere" htmlFor="a-corriere">
          <Input id="a-corriere" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
        </Field>
        <Field
          label="Numero di tracking"
          htmlFor="a-tracking"
          hint="Obbligatorio per segnare la partenza."
        >
          <Input id="a-tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} />
        </Field>
        <Field label="Colli" htmlFor="a-colli">
          <Input
            id="a-colli"
            inputMode="numeric"
            value={colli}
            onChange={(e) => setColli(e.target.value)}
          />
        </Field>
        <Field label="Peso (kg)" htmlFor="a-peso">
          <Input
            id="a-peso"
            inputMode="decimal"
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
          />
        </Field>
        <Field label="Note" htmlFor="a-note">
          <Textarea id="a-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondario"
          disabled={attesa !== null}
          onClick={() => aggiorna('salva')}
        >
          {attesa === 'salva' ? 'Salvataggio…' : 'Salva dati trasporto'}
        </Button>
        {!spedizione.packedAt && (
          <Button
            type="button"
            size="lg"
            disabled={attesa !== null}
            onClick={() => aggiorna('imballata', 'IMBALLATA')}
          >
            {attesa === 'imballata' ? 'Aggiornamento…' : 'Segna come imballata'}
          </Button>
        )}
        {!spedizione.shippedAt && (
          <Button
            type="button"
            size="lg"
            disabled={attesa !== null}
            onClick={() => aggiorna('spedita', 'SPEDITA')}
          >
            {attesa === 'spedita' ? 'Aggiornamento…' : 'Segna come spedita'}
          </Button>
        )}
        {spedizione.shippedAt && !spedizione.deliveredAt && (
          <Button
            type="button"
            size="lg"
            disabled={attesa !== null}
            onClick={() => aggiorna('consegnata', 'CONSEGNATA')}
          >
            {attesa === 'consegnata' ? 'Aggiornamento…' : 'Segna come consegnata'}
          </Button>
        )}
      </div>
    </Card>
  );
}
