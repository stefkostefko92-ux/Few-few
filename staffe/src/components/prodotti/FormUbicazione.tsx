'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LOCATION_KIND_LABELS } from '@/lib/labels';
import { TIPI_UBICAZIONE } from '@/lib/validation/prodotti';
import { Button, Card, Field, Input, Select, Textarea } from '@/components/ui';

/**
 * Anagrafica di un'ubicazione. Il `code` è l'etichetta che viene stampata e
 * scansionata: si genera dai cinque livelli della gerarchia, ma resta
 * modificabile perché in molti magazzini le targhe esistono già.
 */

export type ValoriUbicazione = {
  id?: string;
  code: string;
  zone: string;
  aisle: string;
  rack: string;
  shelf: string;
  bin: string;
  kind: (typeof TIPI_UBICAZIONE)[number];
  pickOrder: string;
  capacity: string;
  notes: string;
  active: boolean;
};

export const UBICAZIONE_VUOTA: ValoriUbicazione = {
  code: '',
  zone: '',
  aisle: '',
  rack: '',
  shelf: '',
  bin: '',
  kind: 'STOCCAGGIO',
  pickOrder: '0',
  capacity: '',
  notes: '',
  active: true,
};

export function FormUbicazione({ iniziale }: { iniziale: ValoriUbicazione }) {
  const router = useRouter();
  const [v, setV] = useState<ValoriUbicazione>(iniziale);
  const [errore, setErrore] = useState<string | null>(null);
  const [campi, setCampi] = useState<Record<string, string[]>>({});
  const [inCorso, setInCorso] = useState(false);

  const modifica = Boolean(iniziale.id);

  function set<K extends keyof ValoriUbicazione>(k: K, valore: ValoriUbicazione[K]) {
    setV((p) => ({ ...p, [k]: valore }));
  }

  function generaCodice() {
    const parti = [v.zone, v.aisle, v.rack, v.shelf, v.bin]
      .map((x) => x.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''))
      .filter(Boolean);
    if (parti.length > 0) set('code', parti.join('-'));
  }

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setCampi({});

    const corpo = {
      code: v.code.trim().toUpperCase(),
      zone: v.zone.trim(),
      aisle: v.aisle.trim(),
      rack: v.rack.trim(),
      shelf: v.shelf.trim(),
      bin: v.bin.trim(),
      kind: v.kind,
      pickOrder: Number(v.pickOrder) || 0,
      capacity: v.capacity.trim() === '' ? null : Number(v.capacity),
      notes: v.notes.trim() || null,
      active: v.active,
    };

    setInCorso(true);
    try {
      const res = await fetch(
        modifica ? `/api/ubicazioni/${iniziale.id}` : '/api/ubicazioni',
        {
          method: modifica ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corpo),
        },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setErrore(body?.error?.message ?? 'Salvataggio non riuscito.');
        setCampi(body?.error?.details?.fieldErrors ?? {});
        return;
      }
      router.push(`/ubicazioni/${body?.data?.id ?? iniziale.id}`);
      router.refresh();
    } catch {
      setErrore('Server non raggiungibile. Riprova.');
    } finally {
      setInCorso(false);
    }
  }

  const err = (k: string) => campi[k]?.[0];

  return (
    <form onSubmit={invia} className="max-w-3xl space-y-4">
      {errore && (
        <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {errore}
        </p>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Gerarchia fisica
        </h2>
        <div className="grid gap-3 md:grid-cols-5">
          <Field label="Zona" htmlFor="zone" required error={err('zone')}>
            <Input id="zone" value={v.zone} onChange={(e) => set('zone', e.target.value)} required maxLength={20} />
          </Field>
          <Field label="Corsia" htmlFor="aisle" required error={err('aisle')}>
            <Input id="aisle" value={v.aisle} onChange={(e) => set('aisle', e.target.value)} required maxLength={20} />
          </Field>
          <Field label="Scaffale" htmlFor="rack" required error={err('rack')}>
            <Input id="rack" value={v.rack} onChange={(e) => set('rack', e.target.value)} required maxLength={20} />
          </Field>
          <Field label="Ripiano" htmlFor="shelf" required error={err('shelf')}>
            <Input id="shelf" value={v.shelf} onChange={(e) => set('shelf', e.target.value)} required maxLength={20} />
          </Field>
          <Field label="Vano" htmlFor="bin" required error={err('bin')}>
            <Input id="bin" value={v.bin} onChange={(e) => set('bin', e.target.value)} required maxLength={20} />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Etichetta e percorso
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Field
            label="Codice"
            htmlFor="code"
            required
            error={err('code')}
            hint="È l’etichetta stampata e scansionata: solo lettere, cifre, punto, trattino e trattino basso."
          >
            <div className="flex gap-2">
              <Input
                id="code"
                value={v.code}
                onChange={(e) => set('code', e.target.value)}
                required
                maxLength={40}
                className="font-mono"
              />
              <Button type="button" variant="secondario" onClick={generaCodice}>
                Genera
              </Button>
            </div>
          </Field>

          <Field label="Tipo" htmlFor="kind" error={err('kind')}>
            <Select
              id="kind"
              value={v.kind}
              onChange={(e) => set('kind', e.target.value as ValoriUbicazione['kind'])}
            >
              {TIPI_UBICAZIONE.map((k) => (
                <option key={k} value={k}>
                  {LOCATION_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Ordine di percorrenza"
            htmlFor="pickOrder"
            error={err('pickOrder')}
            hint="La lista di prelievo si ordina così: l’operatore attraversa il magazzino una volta sola."
          >
            <Input
              id="pickOrder"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={v.pickOrder}
              onChange={(e) => set('pickOrder', e.target.value)}
            />
          </Field>

          <Field label="Capienza (pezzi)" htmlFor="capacity" error={err('capacity')}>
            <Input
              id="capacity"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={v.capacity}
              onChange={(e) => set('capacity', e.target.value)}
            />
          </Field>

          <div className="md:col-span-2">
            <Field label="Note" htmlFor="notes" error={err('notes')}>
              <Textarea
                id="notes"
                value={v.notes}
                onChange={(e) => set('notes', e.target.value)}
                maxLength={1000}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm" htmlFor="active">
            <input
              id="active"
              type="checkbox"
              checked={v.active}
              onChange={(e) => set('active', e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Ubicazione attiva
          </label>
        </div>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={inCorso}>
          {inCorso ? 'Salvataggio…' : modifica ? 'Salva modifiche' : 'Crea ubicazione'}
        </Button>
        <Button
          type="button"
          variant="secondario"
          size="lg"
          onClick={() => router.push('/ubicazioni')}
          disabled={inCorso}
        >
          Annulla
        </Button>
      </div>
    </form>
  );
}
