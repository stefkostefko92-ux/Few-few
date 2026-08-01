'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import { invia } from './client';

export type OrdineSpedibile = { id: string; number: string; cliente: string };

/**
 * Creazione della spedizione a partire da un ordine. Corriere, tracciatura,
 * colli e peso sono dati del trasporto: non toccano la giacenza, che si muove
 * al prelievo e — se la merce sosta in baia — alla partenza.
 */
export function FormSpedizione({
  salesOrderId,
  ordini,
}: {
  salesOrderId?: string;
  ordini?: OrdineSpedibile[];
}) {
  const router = useRouter();
  const [ordine, setOrdine] = useState(salesOrderId ?? '');
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [colli, setColli] = useState('1');
  const [peso, setPeso] = useState('0');
  const [note, setNote] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);

  async function crea() {
    setErrore(null);
    if (!ordine) {
      setErrore('Selezionare l’ordine da spedire.');
      return;
    }
    const nColli = Number.parseInt(colli, 10);
    const kg = Number.parseFloat(peso.replace(',', '.'));
    if (!Number.isFinite(nColli) || nColli < 1) {
      setErrore('Il numero di colli deve essere almeno 1.');
      return;
    }
    if (!Number.isFinite(kg) || kg < 0) {
      setErrore('Il peso deve essere un numero non negativo.');
      return;
    }

    setInvio(true);
    try {
      const creata = await invia<{ id: string }>('/api/spedizioni', 'POST', {
        salesOrderId: ordine,
        carrier: carrier.trim(),
        trackingNumber: tracking.trim(),
        packagesCount: nColli,
        weightGrams: Math.round(kg * 1000),
        notes: note.trim(),
      });
      router.push(`/spedizioni/${creata.id}`);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Errore imprevisto.');
      setInvio(false);
    }
  }

  return (
    <Card className="space-y-4 no-print">
      {errore && (
        <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {errore}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ordini && (
          <Field label="Ordine da spedire" htmlFor="s-ordine" required>
            <Select id="s-ordine" value={ordine} onChange={(e) => setOrdine(e.target.value)}>
              <option value="">— seleziona —</option>
              {ordini.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.number} — {o.cliente}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Corriere" htmlFor="s-corriere">
          <Input id="s-corriere" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
        </Field>
        <Field label="Numero di tracking" htmlFor="s-tracking">
          <Input id="s-tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} />
        </Field>
        <Field label="Colli" htmlFor="s-colli">
          <Input
            id="s-colli"
            inputMode="numeric"
            value={colli}
            onChange={(e) => setColli(e.target.value)}
          />
        </Field>
        <Field label="Peso (kg)" htmlFor="s-peso">
          <Input
            id="s-peso"
            inputMode="decimal"
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
          />
        </Field>
        <Field label="Note" htmlFor="s-note">
          <Textarea id="s-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      <Button type="button" onClick={crea} disabled={invio}>
        {invio ? 'Creazione…' : 'Crea spedizione'}
      </Button>
    </Card>
  );
}
