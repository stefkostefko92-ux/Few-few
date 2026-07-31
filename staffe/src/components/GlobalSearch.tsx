'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from './ui';

type Risultato = {
  tipo: 'prodotto' | 'ordine-acquisto' | 'ordine-vendita' | 'ubicazione';
  titolo: string;
  sottotitolo: string;
  href: string;
};

/**
 * Ricerca globale: SKU, codice a barre, QR, nome, categoria, materiale, marca,
 * modello compatibile, numero documento, codice ubicazione.
 *
 * Uno scanner fisico si comporta come una tastiera che digita e preme Invio:
 * se il campo ha il fuoco, la scansione diventa una ricerca senza altro codice.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [risultati, setRisultati] = useState<Risultato[]>([]);
  const [aperto, setAperto] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function scorciatoia(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        campo.current?.focus();
      }
      if (e.key === 'Escape') setAperto(false);
    }
    window.addEventListener('keydown', scorciatoia);
    return () => window.removeEventListener('keydown', scorciatoia);
  }, []);

  useEffect(() => {
    const termine = q.trim();
    if (termine.length < 2) {
      setRisultati([]);
      return;
    }
    const annulla = new AbortController();
    // Antirimbalzo: lo scanner scrive tutto d'un colpo, la persona no.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ricerca?q=${encodeURIComponent(termine)}`, {
          signal: annulla.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as { data: Risultato[] };
        setRisultati(body.data);
        setAperto(true);
      } catch {
        // Richiesta annullata o rete assente: si resta con i risultati precedenti.
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      annulla.abort();
    };
  }, [q]);

  function invia(e: React.FormEvent) {
    e.preventDefault();
    // Invio con un solo risultato (tipico della scansione): si apre diretto.
    if (risultati.length === 1) {
      router.push(risultati[0].href);
      setQ('');
      setAperto(false);
    }
  }

  return (
    <form onSubmit={invia} className="relative mx-auto max-w-2xl" role="search">
      <label htmlFor="ricerca-globale" className="sr-only">
        Cerca prodotti, ordini o ubicazioni
      </label>
      <Input
        id="ricerca-globale"
        ref={campo}
        type="search"
        value={q}
        placeholder="Cerca o scansiona… (Ctrl+K)"
        autoComplete="off"
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => risultati.length > 0 && setAperto(true)}
        onBlur={() => setTimeout(() => setAperto(false), 150)}
      />
      {aperto && risultati.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded border border-border bg-surface shadow-lg">
          {risultati.map((r) => (
            <li key={`${r.tipo}-${r.href}`}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onMouseDown={() => {
                  router.push(r.href);
                  setQ('');
                  setAperto(false);
                }}
              >
                <span className="font-medium">{r.titolo}</span>
                <span className="ml-2 text-xs text-fg-muted">{r.sottotitolo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
