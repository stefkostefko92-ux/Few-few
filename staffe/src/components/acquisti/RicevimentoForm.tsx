'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
  Table,
  Td,
  Textarea,
  Th,
} from '@/components/ui';
import { formatCents, parseEuroToCents } from '@/lib/money';
import { chiama } from './client-api';

/**
 * Registrazione del ricevimento merce.
 *
 * Il documento entra in magazzino: alla conferma il server crea numero, righe,
 * movimenti di giacenza, avanzamento dell'ordine e notifica in una transazione
 * sola. Qui si prepara il contenuto e si mostra ciò che l'operatore deve vedere
 * PRIMA di salvare — soprattutto quando sta ricevendo più del dovuto.
 *
 * Il campo ubicazione è obbligatorio per riga: merce „ricevuta" senza posto è
 * merce che nessuno ritrova.
 */

export type ProdottoRicevimento = {
  id: string;
  sku: string;
  name: string;
  uom: string;
  costCents: number;
  batchTracked: boolean;
  defaultLocationId: string | null;
};

export type UbicazioneOpzione = { id: string; code: string; kind: string };

export type RigaOrdineAperta = {
  id: string;
  productId: string;
  qty: number;
  receivedQty: number;
  unitCostCents: number;
};

export type OrdineAperto = {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  righe: RigaOrdineAperta[];
};

export type FornitoreOpzione = { id: string; code: string; name: string };

type RigaForm = {
  chiave: string;
  purchaseLineId: string | null;
  productId: string;
  qtyTesto: string;
  locationId: string;
  lotto: string;
  scadenza: string;
  costoTesto: string;
  note: string;
  ordinato: number | null;
  giaRicevuto: number | null;
};

type Eccedenza = {
  sku: string;
  ordinato: number;
  giaRicevuto: number;
  inRicevimento: number;
  eccedenza: number;
};

let contatore = 0;
function nuovaChiave(): string {
  contatore += 1;
  return `ric-${contatore}`;
}

function centesimiInTesto(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

function oggi(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RicevimentoForm({
  ordini,
  fornitori,
  prodotti,
  ubicazioni,
  ordineIniziale,
}: {
  ordini: OrdineAperto[];
  fornitori: FornitoreOpzione[];
  prodotti: ProdottoRicevimento[];
  ubicazioni: UbicazioneOpzione[];
  ordineIniziale?: string;
}) {
  const router = useRouter();
  const prodottoPerId = useMemo(
    () => new Map(prodotti.map((p) => [p.id, p])),
    [prodotti],
  );
  const ordinePerId = useMemo(() => new Map(ordini.map((o) => [o.id, o])), [ordini]);

  /** Suggerimento di ubicazione: quella predefinita del prodotto, altrimenti
   *  la prima banchina di ricevimento configurata. */
  const banchina = ubicazioni.find((u) => u.kind === 'RICEVIMENTO')?.id ?? '';
  function ubicazioneSuggerita(productId: string): string {
    const prodotto = prodottoPerId.get(productId);
    return prodotto?.defaultLocationId ?? banchina;
  }

  function righeDaOrdine(ordine: OrdineAperto): RigaForm[] {
    const aperte = ordine.righe.filter((r) => r.qty - r.receivedQty > 0);
    const fonte = aperte.length > 0 ? aperte : ordine.righe;
    return fonte.map((r) => ({
      chiave: nuovaChiave(),
      purchaseLineId: r.id,
      productId: r.productId,
      qtyTesto: String(Math.max(0, r.qty - r.receivedQty) || 0),
      locationId: ubicazioneSuggerita(r.productId),
      lotto: '',
      scadenza: '',
      costoTesto: centesimiInTesto(r.unitCostCents),
      note: '',
      ordinato: r.qty,
      giaRicevuto: r.receivedQty,
    }));
  }

  function rigaLibera(): RigaForm {
    return {
      chiave: nuovaChiave(),
      purchaseLineId: null,
      productId: '',
      qtyTesto: '1',
      locationId: banchina,
      lotto: '',
      scadenza: '',
      costoTesto: '',
      note: '',
      ordinato: null,
      giaRicevuto: null,
    };
  }

  const ordinePreselezionato =
    ordineIniziale && ordinePerId.has(ordineIniziale) ? ordineIniziale : '';

  const [purchaseOrderId, setPurchaseOrderId] = useState(ordinePreselezionato);
  const [supplierId, setSupplierId] = useState(
    ordinePreselezionato ? ordinePerId.get(ordinePreselezionato)!.supplierId : '',
  );
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [receivedAt, setReceivedAt] = useState(oggi());
  const [notes, setNotes] = useState('');
  const [righe, setRighe] = useState<RigaForm[]>(() =>
    ordinePreselezionato
      ? righeDaOrdine(ordinePerId.get(ordinePreselezionato)!)
      : [rigaLibera()],
  );
  const [errore, setErrore] = useState<string | null>(null);
  const [eccedenzeServer, setEccedenzeServer] = useState<Eccedenza[] | null>(null);
  const [inCorso, setInCorso] = useState(false);

  function scegliOrdine(id: string) {
    setPurchaseOrderId(id);
    setEccedenzeServer(null);
    setErrore(null);
    if (!id) {
      setRighe([rigaLibera()]);
      return;
    }
    const ordine = ordinePerId.get(id);
    if (!ordine) return;
    setSupplierId(ordine.supplierId);
    setRighe(righeDaOrdine(ordine));
  }

  function aggiorna(chiave: string, campi: Partial<RigaForm>) {
    setRighe((precedenti) =>
      precedenti.map((r) => (r.chiave === chiave ? { ...r, ...campi } : r)),
    );
    setEccedenzeServer(null);
  }

  function scegliProdotto(chiave: string, productId: string) {
    const prodotto = prodottoPerId.get(productId);
    aggiorna(chiave, {
      productId,
      locationId: ubicazioneSuggerita(productId),
      costoTesto: prodotto ? centesimiInTesto(prodotto.costCents) : '',
      lotto: '',
    });
  }

  const calcolate = righe.map((r) => {
    const qty = Number(r.qtyTesto);
    const prodotto = prodottoPerId.get(r.productId);
    const valida = Number.isInteger(qty) && qty > 0;
    const residuo =
      r.ordinato !== null && r.giaRicevuto !== null ? r.ordinato - r.giaRicevuto : null;
    return {
      ...r,
      qty: valida ? qty : null,
      prodotto,
      residuo,
      eccede: valida && residuo !== null && qty > residuo,
      unitCostCents: r.costoTesto.trim() ? parseEuroToCents(r.costoTesto) : null,
    };
  });

  const eccedenzeLocali = calcolate.filter((r) => r.eccede);
  const valoreStimato = calcolate.reduce(
    (a, r) => a + (r.qty ?? 0) * (r.unitCostCents ?? r.prodotto?.costCents ?? 0),
    0,
  );

  async function salva(consentiEccedenza: boolean) {
    setErrore(null);

    if (!purchaseOrderId && !supplierId) {
      setErrore('Indicare un ordine di acquisto oppure un fornitore.');
      return;
    }
    const righeValide = calcolate.filter((r) => r.productId);
    if (righeValide.length === 0) {
      setErrore('Inserire almeno una riga con un prodotto.');
      return;
    }
    const senzaQta = righeValide.find((r) => r.qty === null);
    if (senzaQta) {
      setErrore('La quantità di ogni riga deve essere un intero maggiore di zero.');
      return;
    }
    const senzaUbicazione = righeValide.find((r) => !r.locationId);
    if (senzaUbicazione) {
      setErrore('Indicare l’ubicazione di destinazione per ogni riga.');
      return;
    }
    const lottoMancante = righeValide.find(
      (r) => r.prodotto?.batchTracked && !r.lotto.trim(),
    );
    if (lottoMancante) {
      setErrore(
        `Il prodotto ${lottoMancante.prodotto?.sku} è gestito a lotti: indicare il lotto.`,
      );
      return;
    }
    const costoNonValido = righeValide.find(
      (r) => r.costoTesto.trim() !== '' && r.unitCostCents === null,
    );
    if (costoNonValido) {
      setErrore('Controllare il costo unitario delle righe.');
      return;
    }

    const corpo = {
      purchaseOrderId: purchaseOrderId || null,
      supplierId: supplierId || null,
      invoiceNumber: invoiceNumber.trim() || null,
      receivedAt: receivedAt || null,
      notes: notes.trim() || null,
      consentiEccedenza,
      righe: righeValide.map((r) => ({
        productId: r.productId,
        purchaseLineId: r.purchaseLineId,
        locationId: r.locationId,
        qty: r.qty as number,
        unitCostCents: r.unitCostCents ?? undefined,
        lotto: r.prodotto?.batchTracked ? r.lotto.trim() : null,
        scadenza: r.prodotto?.batchTracked && r.scadenza ? r.scadenza : null,
        note: r.note.trim() || null,
      })),
    };

    setInCorso(true);
    const esito = await chiama<{ id: string }>('/api/ricevimenti', 'POST', corpo);
    setInCorso(false);

    if (!esito.ok) {
      if (esito.codice === 'eccedenza' && Array.isArray(esito.dettagli)) {
        setEccedenzeServer(esito.dettagli as Eccedenza[]);
      }
      setErrore(esito.messaggio);
      return;
    }
    router.push(`/ricevimenti/${esito.dati.id}`);
    router.refresh();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void salva(false);
      }}
      className="space-y-6"
    >
      <Card className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Ordine di acquisto"
          htmlFor="ordine"
          hint="Lasciare vuoto per un ricevimento senza ordine"
        >
          <Select
            id="ordine"
            value={purchaseOrderId}
            onChange={(e) => scegliOrdine(e.target.value)}
          >
            <option value="">— Senza ordine —</option>
            {ordini.map((o) => (
              <option key={o.id} value={o.id}>
                {o.number} — {o.supplierName}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Fornitore" htmlFor="fornitore" required>
          <Select
            id="fornitore"
            value={supplierId}
            disabled={Boolean(purchaseOrderId)}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">— Seleziona —</option>
            {fornitori.map((f) => (
              <option key={f.id} value={f.id}>
                {f.code} — {f.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Numero fattura / DDT" htmlFor="fattura">
          <Input
            id="fattura"
            value={invoiceNumber}
            maxLength={60}
            onChange={(e) => setInvoiceNumber(e.target.value)}
          />
        </Field>

        <Field label="Data di arrivo" htmlFor="arrivo">
          <Input
            id="arrivo"
            type="date"
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
          />
        </Field>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Righe ricevute</h2>
          <Button
            type="button"
            variant="secondario"
            onClick={() => setRighe((r) => [...r, rigaLibera()])}
          >
            Aggiungi riga
          </Button>
        </div>

        <Table>
          <thead>
            <tr>
              <Th>Prodotto</Th>
              <Th className="w-28">Qtà</Th>
              <Th className="w-28">Residuo</Th>
              <Th className="w-44">Ubicazione</Th>
              <Th className="w-40">Lotto</Th>
              <Th className="w-32">Costo unit. €</Th>
              <Th className="w-10">
                <span className="sr-only">Azioni</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {calcolate.map((r, i) => (
              <tr key={r.chiave}>
                <Td>
                  {r.purchaseLineId ? (
                    <span className="font-medium">
                      {r.prodotto ? `${r.prodotto.sku} — ${r.prodotto.name}` : '—'}
                    </span>
                  ) : (
                    <Select
                      aria-label={`Prodotto della riga ${i + 1}`}
                      value={r.productId}
                      onChange={(e) => scegliProdotto(r.chiave, e.target.value)}
                    >
                      <option value="">— Seleziona —</option>
                      {prodotti.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name}
                        </option>
                      ))}
                    </Select>
                  )}
                  <Input
                    className="mt-1"
                    aria-label={`Nota della riga ${i + 1}`}
                    placeholder="Nota di riga"
                    value={r.note}
                    maxLength={200}
                    onChange={(e) => aggiorna(r.chiave, { note: e.target.value })}
                  />
                </Td>
                <Td>
                  <Input
                    aria-label={`Quantità della riga ${i + 1}`}
                    inputMode="numeric"
                    value={r.qtyTesto}
                    aria-invalid={r.qty === null}
                    onChange={(e) => aggiorna(r.chiave, { qtyTesto: e.target.value })}
                  />
                  {r.prodotto && (
                    <span className="text-xs text-fg-muted">{r.prodotto.uom}</span>
                  )}
                </Td>
                <Td className="tabular-nums">
                  {r.residuo === null ? (
                    <span className="text-fg-muted">—</span>
                  ) : (
                    <>
                      {r.residuo}
                      {r.eccede && (
                        <span className="ml-1">
                          <Badge tone="avviso">eccedenza</Badge>
                        </span>
                      )}
                    </>
                  )}
                </Td>
                <Td>
                  <Select
                    aria-label={`Ubicazione della riga ${i + 1}`}
                    value={r.locationId}
                    onChange={(e) => aggiorna(r.chiave, { locationId: e.target.value })}
                  >
                    <option value="">— Seleziona —</option>
                    {ubicazioni.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.code}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td>
                  <Input
                    aria-label={`Lotto della riga ${i + 1}`}
                    value={r.lotto}
                    maxLength={60}
                    disabled={!r.prodotto?.batchTracked}
                    placeholder={r.prodotto?.batchTracked ? 'obbligatorio' : 'non gestito'}
                    onChange={(e) => aggiorna(r.chiave, { lotto: e.target.value })}
                  />
                  {r.prodotto?.batchTracked && (
                    <Input
                      className="mt-1"
                      type="date"
                      aria-label={`Scadenza del lotto della riga ${i + 1}`}
                      value={r.scadenza}
                      onChange={(e) => aggiorna(r.chiave, { scadenza: e.target.value })}
                    />
                  )}
                </Td>
                <Td>
                  <Input
                    aria-label={`Costo unitario della riga ${i + 1}`}
                    inputMode="decimal"
                    value={r.costoTesto}
                    placeholder="da ordine"
                    onChange={(e) => aggiorna(r.chiave, { costoTesto: e.target.value })}
                  />
                </Td>
                <Td>
                  <Button
                    type="button"
                    variant="fantasma"
                    size="sm"
                    aria-label={`Elimina la riga ${i + 1}`}
                    onClick={() =>
                      setRighe((precedenti) =>
                        precedenti.length > 1
                          ? precedenti.filter((x) => x.chiave !== r.chiave)
                          : [rigaLibera()],
                      )
                    }
                  >
                    ✕
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Note del ricevimento" htmlFor="note-ricevimento">
          <Textarea
            id="note-ricevimento"
            value={notes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <Card className="self-start text-sm">
          <div className="flex justify-between">
            <span className="text-fg-muted">Valore stimato della merce</span>
            <span className="tabular-nums">{formatCents(valoreStimato)}</span>
          </div>
          <p className="mt-1 text-xs text-fg-muted">
            Indicativo: il costo definitivo è quello registrato dal server sulle
            righe del documento.
          </p>
        </Card>
      </div>

      {eccedenzeLocali.length > 0 && !eccedenzeServer && (
        <p
          role="status"
          className="rounded border border-warn/40 bg-warn/10 p-3 text-sm text-warn"
        >
          Alcune righe superano la quantità ancora da ricevere. Il ricevimento è
          possibile, ma va confermato esplicitamente.
        </p>
      )}

      {eccedenzeServer && (
        <div
          role="alert"
          className="space-y-2 rounded border border-warn/40 bg-warn/10 p-3 text-sm"
        >
          <p className="font-medium text-warn">
            Quantità ricevuta superiore all’ordinato
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {eccedenzeServer.map((e) => (
              <li key={e.sku}>
                <span className="font-medium">{e.sku}</span>: ordinati {e.ordinato},
                già ricevuti {e.giaRicevuto}, in questo documento {e.inRicevimento} →{' '}
                <strong>{e.eccedenza} in più</strong>.
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="pericolo"
            disabled={inCorso}
            onClick={() => void salva(true)}
          >
            Confermo l’eccedenza e registro il ricevimento
          </Button>
        </div>
      )}

      {errore && !eccedenzeServer && (
        <p
          role="alert"
          className="rounded border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
        >
          {errore}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={inCorso}>
          {inCorso ? 'Registrazione…' : 'Registra ricevimento'}
        </Button>
        <Button
          type="button"
          variant="secondario"
          size="lg"
          disabled={inCorso}
          onClick={() => router.back()}
        >
          Annulla
        </Button>
      </div>
    </form>
  );
}
