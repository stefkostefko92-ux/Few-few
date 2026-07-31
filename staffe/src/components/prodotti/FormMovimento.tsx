'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Field, Input, Select, Textarea } from '@/components/ui';

/**
 * Movimenti manuali: trasferimento fra ubicazioni e rettifica di giacenza.
 *
 * I due casi condividono tutto tranne la destinazione e l'obbligo di motivo,
 * quindi condividono anche il form: due componenti gemelli divergerebbero alla
 * prima modifica. Il controllo sulle quantità qui è solo un aiuto all'operatore
 * — la verità la dice il server, che rifiuta i saldi negativi.
 */

export type RigaGiacenza = {
  productId: string;
  locationId: string;
  batchId: string | null;
  batchCode: string | null;
  qty: number;
  reservedQty: number;
};

export type ProdottoOpzione = {
  id: string;
  sku: string;
  name: string;
  uom: string;
  batchTracked: boolean;
};

export type UbicazioneOpzione = { id: string; code: string };

export function FormMovimento({
  modo,
  prodotti,
  ubicazioni,
  giacenze,
  prodottoIniziale = '',
  ubicazioneIniziale = '',
}: {
  modo: 'trasferimento' | 'rettifica';
  prodotti: readonly ProdottoOpzione[];
  ubicazioni: readonly UbicazioneOpzione[];
  giacenze: readonly RigaGiacenza[];
  prodottoIniziale?: string;
  ubicazioneIniziale?: string;
}) {
  const router = useRouter();
  const [productId, setProductId] = useState(prodottoIniziale);
  const [fromLocationId, setFromLocationId] = useState(ubicazioneIniziale);
  const [toLocationId, setToLocationId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [qty, setQty] = useState('1');
  const [verso, setVerso] = useState<'aumento' | 'diminuzione'>('aumento');
  const [reason, setReason] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const prodotto = prodotti.find((x) => x.id === productId) ?? null;
  const um = prodotto?.uom ?? 'pz';

  // Nella rettifica l'unica ubicazione è quella da correggere: si riusa
  // `fromLocationId` come «ubicazione selezionata».
  const ubicazioneSelezionata = fromLocationId;

  const righeProdotto = useMemo(
    () => giacenze.filter((r) => r.productId === productId),
    [giacenze, productId],
  );

  const righeUbicazione = useMemo(
    () => righeProdotto.filter((r) => r.locationId === ubicazioneSelezionata),
    [righeProdotto, ubicazioneSelezionata],
  );

  const lotti = useMemo(
    () =>
      righeUbicazione
        .filter((r) => r.batchId !== null)
        .map((r) => ({ id: r.batchId as string, code: r.batchCode ?? r.batchId!, qty: r.qty })),
    [righeUbicazione],
  );

  const disponibile = righeUbicazione
    .filter((r) => (batchId ? r.batchId === batchId : true))
    .reduce((s, r) => s + r.qty, 0);

  const quantita = Number(qty);
  const quantitaValida = Number.isInteger(quantita) && quantita > 0;

  const scaricaMagazzino = modo === 'trasferimento' || verso === 'diminuzione';

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);

    if (!productId) return setErrore('Seleziona il prodotto.');
    if (!ubicazioneSelezionata) {
      return setErrore(
        modo === 'trasferimento'
          ? 'Seleziona l’ubicazione di partenza.'
          : 'Seleziona l’ubicazione da rettificare.',
      );
    }
    if (modo === 'trasferimento' && !toLocationId) {
      return setErrore('Seleziona l’ubicazione di destinazione.');
    }
    if (modo === 'trasferimento' && toLocationId === fromLocationId) {
      return setErrore('Partenza e destinazione non possono coincidere.');
    }
    if (!quantitaValida) return setErrore('La quantità deve essere un intero maggiore di zero.');
    if (scaricaMagazzino && quantita > disponibile) {
      return setErrore(
        `Giacenza insufficiente nell’ubicazione selezionata: disponibili ${disponibile}, richiesti ${quantita}.`,
      );
    }
    if (modo === 'rettifica' && reason.trim().length < 3) {
      return setErrore('Il motivo della rettifica è obbligatorio.');
    }

    const corpo =
      modo === 'trasferimento'
        ? {
            type: 'TRASFERIMENTO' as const,
            productId,
            qty: quantita,
            fromLocationId,
            toLocationId,
            batchId: batchId || null,
            reason: reason.trim() || null,
          }
        : {
            type: 'RETTIFICA' as const,
            productId,
            qty: quantita,
            locationId: ubicazioneSelezionata,
            verso,
            batchId: batchId || null,
            reason: reason.trim(),
          };

    setInCorso(true);
    try {
      const res = await fetch('/api/movimenti', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setErrore(body?.error?.message ?? 'Movimento non registrato.');
        return;
      }
      router.push(`/giacenze/movimenti?prodottoId=${productId}`);
      router.refresh();
    } catch {
      setErrore('Server non raggiungibile. Riprova.');
    } finally {
      setInCorso(false);
    }
  }

  return (
    <form onSubmit={invia} className="max-w-2xl space-y-4">
      {errore && (
        <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {errore}
        </p>
      )}

      <Card>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="Prodotto" htmlFor="productId" required>
              <Select
                id="productId"
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  setBatchId('');
                }}
                required
              >
                <option value="">Seleziona…</option>
                {prodotti.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.sku} — {x.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label={modo === 'trasferimento' ? 'Da ubicazione' : 'Ubicazione'}
            htmlFor="fromLocationId"
            required
            hint={
              productId && ubicazioneSelezionata
                ? `Giacenza attuale: ${disponibile} ${um}`
                : undefined
            }
          >
            <Select
              id="fromLocationId"
              value={fromLocationId}
              onChange={(e) => {
                setFromLocationId(e.target.value);
                setBatchId('');
              }}
              required
            >
              <option value="">Seleziona…</option>
              {ubicazioni.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code}
                </option>
              ))}
            </Select>
          </Field>

          {modo === 'trasferimento' ? (
            <Field label="A ubicazione" htmlFor="toLocationId" required>
              <Select
                id="toLocationId"
                value={toLocationId}
                onChange={(e) => setToLocationId(e.target.value)}
                required
              >
                <option value="">Seleziona…</option>
                {ubicazioni
                  .filter((u) => u.id !== fromLocationId)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code}
                    </option>
                  ))}
              </Select>
            </Field>
          ) : (
            <Field
              label="Verso della rettifica"
              htmlFor="verso"
              required
              hint="Aumento carica l’ubicazione, diminuzione la scarica."
            >
              <Select
                id="verso"
                value={verso}
                onChange={(e) => setVerso(e.target.value as 'aumento' | 'diminuzione')}
              >
                <option value="aumento">Aumento (+)</option>
                <option value="diminuzione">Diminuzione (−)</option>
              </Select>
            </Field>
          )}

          {prodotto?.batchTracked && lotti.length > 0 && (
            <Field label="Lotto" htmlFor="batchId" hint="Il prodotto è gestito a lotti.">
              <Select
                id="batchId"
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
              >
                <option value="">Senza lotto</option>
                {lotti.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} ({l.qty})
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field
            label={`Quantità (${um})`}
            htmlFor="qty"
            required
            error={
              scaricaMagazzino && quantitaValida && quantita > disponibile
                ? `Disponibili solo ${disponibile} ${um}.`
                : undefined
            }
          >
            <Input
              id="qty"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              required
            />
          </Field>

          <div className="md:col-span-2">
            <Field
              label="Motivo"
              htmlFor="reason"
              required={modo === 'rettifica'}
              hint={
                modo === 'rettifica'
                  ? 'Obbligatorio: senza motivo la differenza inventariale resta inspiegabile.'
                  : 'Facoltativo — utile a ricostruire lo spostamento a distanza di mesi.'
              }
            >
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required={modo === 'rettifica'}
                minLength={modo === 'rettifica' ? 3 : undefined}
                maxLength={300}
              />
            </Field>
          </div>
        </div>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={inCorso}>
          {inCorso
            ? 'Registrazione…'
            : modo === 'trasferimento'
              ? 'Registra trasferimento'
              : 'Registra rettifica'}
        </Button>
        <Button
          type="button"
          variant="secondario"
          size="lg"
          onClick={() => router.push('/giacenze')}
          disabled={inCorso}
        >
          Annulla
        </Button>
      </div>
    </form>
  );
}
