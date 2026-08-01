'use client';

import { useEffect, useState } from 'react';
import { Field, Input } from '@/components/ui';

type Ubicazione = { id: string; code: string; zone: string; aisle: string };

/**
 * Campo di ricerca ubicazione (per trasferimento/rettifica): digitando o
 * scansionando il codice compaiono le corrispondenze, click per selezionare.
 * Nessuna scelta è nascosta dietro la sola fotocamera: si può sempre digitare.
 */
export function UbicazioneCercaInput({
  etichetta,
  htmlFor,
  onSeleziona,
}: {
  etichetta: string;
  htmlFor: string;
  onSeleziona: (u: Ubicazione) => void;
}) {
  const [q, setQ] = useState('');
  const [risultati, setRisultati] = useState<Ubicazione[]>([]);
  const [selezionata, setSelezionata] = useState<Ubicazione | null>(null);

  useEffect(() => {
    if (selezionata) return;
    const termine = q.trim();
    if (termine.length < 1) {
      setRisultati([]);
      return;
    }
    const annulla = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ubicazioni?q=${encodeURIComponent(termine)}&perPage=8`, {
          signal: annulla.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as { data: Ubicazione[] };
        setRisultati(body.data);
      } catch {
        // richiesta annullata
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      annulla.abort();
    };
  }, [q, selezionata]);

  if (selezionata) {
    return (
      <Field label={etichetta} htmlFor={htmlFor}>
        <div className="flex items-center justify-between rounded border border-border bg-muted px-3 py-2 text-sm">
          <span>
            <strong>{selezionata.code}</strong> — zona {selezionata.zone}, corsia {selezionata.aisle}
          </span>
          <button
            type="button"
            className="text-xs text-brand underline"
            onClick={() => {
              setSelezionata(null);
              setQ('');
            }}
          >
            Cambia
          </button>
        </div>
      </Field>
    );
  }

  return (
    <div className="relative">
      <Field label={etichetta} htmlFor={htmlFor} hint="Scansiona o digita il codice ubicazione.">
        <Input
          id={htmlFor}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
          placeholder="Es. A-02-S3-R1-V4"
        />
      </Field>
      {risultati.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded border border-border bg-surface shadow-lg">
          {risultati.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  setSelezionata(u);
                  setRisultati([]);
                  onSeleziona(u);
                }}
              >
                <strong>{u.code}</strong>{' '}
                <span className="text-fg-muted">zona {u.zone}, corsia {u.aisle}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
