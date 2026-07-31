'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Select, Textarea } from '@/components/ui';

type Opzione = { id: string; name: string };

/**
 * Apertura di un conteggio.
 *
 * Il conteggio ciclico chiede almeno un criterio (zona o categoria): è la stessa
 * regola che applica il server, ripetuta qui solo per dare la risposta subito.
 * La verità resta quella del server.
 */
export function NuovoInventarioForm({
  zone,
  categorie,
}: {
  zone: string[];
  categorie: Opzione[];
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<'CICLICO' | 'TOTALE'>('CICLICO');
  const [zona, setZona] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const criterioMancante = tipo === 'CICLICO' && !zona && !categoryId;

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    if (criterioMancante) {
      setErrore(
        'Il conteggio ciclico richiede almeno un criterio: scegli una zona o una categoria.',
      );
      return;
    }
    setInCorso(true);
    try {
      const res = await fetch('/api/inventario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: tipo,
          zone: tipo === 'CICLICO' ? zona || null : null,
          categoryId: tipo === 'CICLICO' ? categoryId || null : null,
          notes: note || null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setErrore(body?.error?.message ?? 'Apertura del conteggio non riuscita.');
        return;
      }
      router.push(`/inventario/${body.data.id}`);
      router.refresh();
    } catch {
      setErrore('Server non raggiungibile. Controlla la connessione.');
    } finally {
      setInCorso(false);
    }
  }

  return (
    <form onSubmit={invia} className="max-w-xl space-y-4">
      <fieldset>
        <legend className="text-sm font-medium">Tipo di conteggio</legend>
        <div className="mt-2 space-y-2">
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="tipo"
              value="CICLICO"
              checked={tipo === 'CICLICO'}
              onChange={() => setTipo('CICLICO')}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Ciclico</span>
              <span className="block text-sm text-fg-muted">
                Una parte del magazzino per volta (zona o categoria). È il modo
                con cui la giacenza resta allineata senza fermare il lavoro.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="tipo"
              value="TOTALE"
              checked={tipo === 'TOTALE'}
              onChange={() => setTipo('TOTALE')}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Totale</span>
              <span className="block text-sm text-fg-muted">
                Tutte le ubicazioni attive. Da fare a magazzino fermo: ogni
                movimento durante la conta diventa una differenza da spiegare.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      {tipo === 'CICLICO' && (
        <>
          <Field label="Zona" htmlFor="zona" hint="Vuoto = tutte le zone.">
            <Select
              id="zona"
              value={zona}
              onChange={(e) => setZona(e.target.value)}
            >
              <option value="">Tutte</option>
              {zone.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Categoria"
            htmlFor="categoria"
            hint="Vuoto = tutte le categorie."
          >
            <Select
              id="categoria"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Tutte</option>
              {categorie.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}

      <Field label="Note" htmlFor="note">
        <Textarea
          id="note"
          value={note}
          maxLength={1000}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Motivo del conteggio, incaricato, riferimenti…"
        />
      </Field>

      {errore && (
        <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {errore}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={inCorso}>
          {inCorso ? 'Apertura…' : 'Apri il conteggio'}
        </Button>
        <Button
          type="button"
          variant="secondario"
          size="lg"
          onClick={() => router.push('/inventario')}
        >
          Annulla
        </Button>
      </div>
    </form>
  );
}
