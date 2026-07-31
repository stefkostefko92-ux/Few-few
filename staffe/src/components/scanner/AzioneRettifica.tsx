'use client';

import { useState } from 'react';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { UbicazioneCercaInput } from './UbicazioneCercaInput';

type RigaGiacenza = { location: { id: string; code: string }; qty: number };

/**
 * Rettifica manuale della giacenza. Passa da `POST /api/movimenti`, che
 * richiede il permesso più stretto (`giacenze:rettifica`) e un motivo scritto
 * — senza documento a monte la differenza inventariale resta inspiegabile.
 */
export function AzioneRettifica({
  prodottoId,
  righe,
  onCompletato,
  onAnnulla,
}: {
  prodottoId: string;
  righe: RigaGiacenza[];
  onCompletato: () => void;
  onAnnulla: () => void;
}) {
  const [locationId, setLocationId] = useState<string | null>(righe[0]?.location.id ?? null);
  const [verso, setVerso] = useState<'aumento' | 'diminuzione'>('aumento');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);

  async function conferma() {
    if (!locationId) {
      setErrore('Seleziona l’ubicazione da rettificare.');
      return;
    }
    if (reason.trim().length < 3) {
      setErrore('Il motivo della rettifica è obbligatorio (almeno 3 caratteri).');
      return;
    }
    setInvio(true);
    setErrore(null);
    try {
      const res = await fetch('/api/movimenti', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'RETTIFICA',
          productId: prodottoId,
          qty,
          locationId,
          verso,
          reason: reason.trim(),
        }),
      });
      const body = (await res.json()) as { error?: { message: string } };
      if (!res.ok) {
        setErrore(body.error?.message ?? 'Errore durante la rettifica.');
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(80);
      onCompletato();
    } catch {
      setErrore('Rete non disponibile: la rettifica non è stata registrata.');
    } finally {
      setInvio(false);
    }
  }

  return (
    <div className="space-y-3 rounded border border-border bg-surface p-4">
      <h3 className="font-medium">Rettifica</h3>
      {errore && (
        <p className="text-sm text-danger" role="alert">
          {errore}
        </p>
      )}

      {righe.length > 0 ? (
        <Field label="Ubicazione" htmlFor="rett-ubicazione">
          <Select
            id="rett-ubicazione"
            value={locationId ?? ''}
            onChange={(e) => setLocationId(e.target.value)}
          >
            {righe.map((r) => (
              <option key={r.location.id} value={r.location.id}>
                {r.location.code} — presenti {r.qty}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <UbicazioneCercaInput
          etichetta="Ubicazione"
          htmlFor="rett-ubicazione-cerca"
          onSeleziona={(u) => setLocationId(u.id)}
        />
      )}

      <Field label="Verso" htmlFor="rett-verso">
        <Select id="rett-verso" value={verso} onChange={(e) => setVerso(e.target.value as typeof verso)}>
          <option value="aumento">Aumento (carica)</option>
          <option value="diminuzione">Diminuzione (scarica)</option>
        </Select>
      </Field>
      <Field label="Quantità" htmlFor="rett-qty">
        <Input
          id="rett-qty"
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
          className="w-28"
        />
      </Field>
      <Field label="Motivo" htmlFor="rett-motivo" required>
        <Textarea id="rett-motivo" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button size="lg" variant="pericolo" onClick={conferma} disabled={invio}>
          Conferma rettifica
        </Button>
        <Button size="lg" variant="secondario" onClick={onAnnulla} disabled={invio}>
          Annulla
        </Button>
      </div>
    </div>
  );
}
