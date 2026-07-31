'use client';

import { useState } from 'react';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { UbicazioneCercaInput } from './UbicazioneCercaInput';

type RigaGiacenza = { location: { id: string; code: string }; qty: number };

/**
 * Trasferimento tra ubicazioni. Passa da `POST /api/movimenti` (contratto del
 * modulo Giacenze) — nessuna scrittura diretta della quantità qui: la stessa
 * transazione che aggiorna `StockItem` scrive anche il movimento.
 */
export function AzioneTrasferisci({
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
  const [fromLocationId, setFrom] = useState(righe[0]?.location.id ?? '');
  const [toLocationId, setTo] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);

  async function conferma() {
    if (!fromLocationId || !toLocationId) {
      setErrore('Seleziona ubicazione di partenza e destinazione.');
      return;
    }
    setInvio(true);
    setErrore(null);
    try {
      const res = await fetch('/api/movimenti', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'TRASFERIMENTO',
          productId: prodottoId,
          qty,
          fromLocationId,
          toLocationId,
          reason: reason.trim() || undefined,
        }),
      });
      const body = (await res.json()) as { error?: { message: string } };
      if (!res.ok) {
        setErrore(body.error?.message ?? 'Errore durante il trasferimento.');
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(80);
      onCompletato();
    } catch {
      setErrore('Rete non disponibile: il trasferimento non è stato registrato.');
    } finally {
      setInvio(false);
    }
  }

  if (righe.length === 0) {
    return (
      <div className="space-y-3 rounded border border-border bg-surface p-4">
        <p className="text-sm text-fg-muted">
          Il prodotto non ha giacenza in nessuna ubicazione: non c’è nulla da trasferire.
        </p>
        <Button variant="secondario" onClick={onAnnulla}>
          Chiudi
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded border border-border bg-surface p-4">
      <h3 className="font-medium">Trasferisci</h3>
      {errore && (
        <p className="text-sm text-danger" role="alert">
          {errore}
        </p>
      )}
      <Field label="Da" htmlFor="trasf-da">
        <Select id="trasf-da" value={fromLocationId} onChange={(e) => setFrom(e.target.value)}>
          {righe.map((r) => (
            <option key={r.location.id} value={r.location.id}>
              {r.location.code} — disponibili {r.qty}
            </option>
          ))}
        </Select>
      </Field>
      <UbicazioneCercaInput etichetta="A" htmlFor="trasf-a" onSeleziona={(u) => setTo(u.id)} />
      <Field label="Quantità" htmlFor="trasf-qty">
        <Input
          id="trasf-qty"
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
          className="w-28"
        />
      </Field>
      <Field label="Motivo" htmlFor="trasf-motivo" hint="Facoltativo.">
        <Textarea id="trasf-motivo" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button size="lg" onClick={conferma} disabled={invio}>
          Conferma trasferimento
        </Button>
        <Button size="lg" variant="secondario" onClick={onAnnulla} disabled={invio}>
          Annulla
        </Button>
      </div>
    </div>
  );
}
