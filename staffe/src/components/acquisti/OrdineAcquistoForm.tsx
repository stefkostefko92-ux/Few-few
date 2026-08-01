'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
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
import {
  IVA_ORDINARIA_BP,
  computeTotals,
  formatCents,
  parseEuroToCents,
} from '@/lib/money';
import { chiama } from './client-api';

/**
 * Editor dell'ordine di acquisto (solo bozze).
 *
 * Il browser calcola i totali **per mostrarli**, non per salvarli: al server
 * partono solo prodotto, quantità, costo unitario, sconto e IVA. Il totale
 * mostrato qui e quello del documento coincidono perché entrambi passano da
 * `computeTotals`, non perché uno si fida dell'altro.
 */

export type OpzioneFornitore = { id: string; code: string; name: string };
export type OpzioneProdotto = {
  id: string;
  sku: string;
  name: string;
  uom: string;
  costCents: number;
  vatRateBp: number;
};

export type RigaIniziale = {
  productId: string;
  qty: number;
  unitCostCents: number;
  discountBp: number;
  vatRateBp: number;
  note: string | null;
};

export type OrdineIniziale = {
  id: string;
  numero: string;
  supplierId: string;
  expectedAt: string | null; // "AAAA-MM-GG"
  shippingCents: number;
  notes: string | null;
  righe: RigaIniziale[];
};

type RigaForm = {
  chiave: string;
  productId: string;
  qtyTesto: string;
  costoTesto: string;
  scontoTesto: string;
  ivaTesto: string;
  note: string;
};

/** Le percentuali in punti base seguono la stessa aritmetica dei centesimi:
 *  «22» → 2200, «5,5» → 550. Nessun decimale in giro per il codice. */
const percentualeInBp = parseEuroToCents;

function centesimiInTesto(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

function bpInTesto(bp: number): string {
  return String(bp / 100).replace('.', ',');
}

let contatore = 0;
function nuovaChiave(): string {
  contatore += 1;
  return `riga-${contatore}`;
}

function rigaVuota(): RigaForm {
  return {
    chiave: nuovaChiave(),
    productId: '',
    qtyTesto: '1',
    costoTesto: '',
    scontoTesto: '0',
    ivaTesto: bpInTesto(IVA_ORDINARIA_BP),
    note: '',
  };
}

export function OrdineAcquistoForm({
  fornitori,
  prodotti,
  iniziale,
}: {
  fornitori: OpzioneFornitore[];
  prodotti: OpzioneProdotto[];
  iniziale?: OrdineIniziale;
}) {
  const router = useRouter();
  const prodottoPerId = useMemo(
    () => new Map(prodotti.map((p) => [p.id, p])),
    [prodotti],
  );

  const [supplierId, setSupplierId] = useState(iniziale?.supplierId ?? '');
  const [expectedAt, setExpectedAt] = useState(iniziale?.expectedAt ?? '');
  const [speseTesto, setSpeseTesto] = useState(
    centesimiInTesto(iniziale?.shippingCents ?? 0),
  );
  const [notes, setNotes] = useState(iniziale?.notes ?? '');
  const [righe, setRighe] = useState<RigaForm[]>(() =>
    iniziale && iniziale.righe.length > 0
      ? iniziale.righe.map((r) => ({
          chiave: nuovaChiave(),
          productId: r.productId,
          qtyTesto: String(r.qty),
          costoTesto: centesimiInTesto(r.unitCostCents),
          scontoTesto: bpInTesto(r.discountBp),
          ivaTesto: bpInTesto(r.vatRateBp),
          note: r.note ?? '',
        }))
      : [rigaVuota()],
  );
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  function aggiorna(chiave: string, campi: Partial<RigaForm>) {
    setRighe((precedenti) =>
      precedenti.map((r) => (r.chiave === chiave ? { ...r, ...campi } : r)),
    );
  }

  function scegliProdotto(chiave: string, productId: string) {
    const prodotto = prodottoPerId.get(productId);
    aggiorna(chiave, {
      productId,
      // Il costo di listino è solo un suggerimento: resta modificabile.
      costoTesto: prodotto ? centesimiInTesto(prodotto.costCents) : '',
      ivaTesto: prodotto ? bpInTesto(prodotto.vatRateBp) : bpInTesto(IVA_ORDINARIA_BP),
    });
  }

  const spesePedizioneCents = parseEuroToCents(speseTesto) ?? 0;

  const calcolate = righe.map((r) => {
    const qty = Number(r.qtyTesto);
    return {
      chiave: r.chiave,
      productId: r.productId,
      qty: Number.isInteger(qty) && qty > 0 ? qty : null,
      unitCostCents: parseEuroToCents(r.costoTesto),
      discountBp: percentualeInBp(r.scontoTesto),
      vatRateBp: percentualeInBp(r.ivaTesto),
      note: r.note.trim() ? r.note.trim() : null,
    };
  });

  // Il calcolo è puro e su poche righe: si rifà a ogni battuta senza memoizzare.
  const totali = computeTotals(
    calcolate
      .filter((r) => r.qty !== null && r.unitCostCents !== null)
      .map((r) => ({
        qty: r.qty as number,
        unitPriceCents: r.unitCostCents as number,
        discountBp: r.discountBp ?? 0,
        vatRateBp: r.vatRateBp ?? IVA_ORDINARIA_BP,
      })),
    { shippingCents: spesePedizioneCents },
  );

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);

    if (!supplierId) {
      setErrore('Selezionare il fornitore.');
      return;
    }
    const righeValide = calcolate.filter((r) => r.productId);
    if (righeValide.length === 0) {
      setErrore('Inserire almeno una riga con un prodotto.');
      return;
    }
    const nonValida = righeValide.find(
      (r) =>
        r.qty === null ||
        r.unitCostCents === null ||
        r.discountBp === null ||
        r.vatRateBp === null,
    );
    if (nonValida) {
      setErrore(
        'Controllare quantità (intero ≥ 1), costo unitario, sconto e IVA delle righe.',
      );
      return;
    }

    const corpo = {
      supplierId,
      expectedAt: expectedAt || null,
      shippingCents: spesePedizioneCents,
      notes: notes.trim() || null,
      righe: righeValide.map((r) => ({
        productId: r.productId,
        qty: r.qty as number,
        unitCostCents: r.unitCostCents as number,
        discountBp: r.discountBp as number,
        vatRateBp: r.vatRateBp as number,
        note: r.note,
      })),
    };

    setInCorso(true);
    const esito = iniziale
      ? await chiama<{ id: string }>(`/api/acquisti/${iniziale.id}`, 'PATCH', corpo)
      : await chiama<{ id: string }>('/api/acquisti', 'POST', corpo);
    setInCorso(false);

    if (!esito.ok) {
      setErrore(esito.messaggio);
      return;
    }
    router.push(`/acquisti/${esito.dati.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={salva} className="space-y-6">
      <Card className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Fornitore" htmlFor="fornitore" required>
          <Select
            id="fornitore"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            required
          >
            <option value="">— Seleziona —</option>
            {fornitori.map((f) => (
              <option key={f.id} value={f.id}>
                {f.code} — {f.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Consegna prevista" htmlFor="consegna">
          <Input
            id="consegna"
            type="date"
            value={expectedAt}
            onChange={(e) => setExpectedAt(e.target.value)}
          />
        </Field>

        <Field label="Spese di spedizione (€)" htmlFor="spese" hint="IVA ordinaria">
          <Input
            id="spese"
            inputMode="decimal"
            value={speseTesto}
            onChange={(e) => setSpeseTesto(e.target.value)}
            aria-invalid={parseEuroToCents(speseTesto) === null}
          />
        </Field>

        <Field label="Note per il fornitore" htmlFor="note-ordine">
          <Textarea
            id="note-ordine"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
          />
        </Field>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Righe dell’ordine</h2>
          <Button
            type="button"
            variant="secondario"
            onClick={() => setRighe((r) => [...r, rigaVuota()])}
          >
            Aggiungi riga
          </Button>
        </div>

        <Table>
          <thead>
            <tr>
              <Th>Prodotto</Th>
              <Th className="w-24">Qtà</Th>
              <Th className="w-32">Costo unit. €</Th>
              <Th className="w-24">Sconto %</Th>
              <Th className="w-24">IVA %</Th>
              <Th className="w-32">Imponibile</Th>
              <Th className="w-10">
                <span className="sr-only">Azioni</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r, i) => {
              const c = calcolate[i];
              const prodotto = prodottoPerId.get(r.productId);
              const imponibile =
                c.qty !== null && c.unitCostCents !== null
                  ? computeTotals([
                      {
                        qty: c.qty,
                        unitPriceCents: c.unitCostCents,
                        discountBp: c.discountBp ?? 0,
                        vatRateBp: c.vatRateBp ?? IVA_ORDINARIA_BP,
                      },
                    ]).netCents
                  : null;
              return (
                <tr key={r.chiave}>
                  <Td>
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
                      aria-invalid={c.qty === null}
                      onChange={(e) => aggiorna(r.chiave, { qtyTesto: e.target.value })}
                    />
                    {prodotto && (
                      <span className="text-xs text-fg-muted">{prodotto.uom}</span>
                    )}
                  </Td>
                  <Td>
                    <Input
                      aria-label={`Costo unitario della riga ${i + 1}`}
                      inputMode="decimal"
                      value={r.costoTesto}
                      aria-invalid={c.unitCostCents === null}
                      onChange={(e) => aggiorna(r.chiave, { costoTesto: e.target.value })}
                    />
                  </Td>
                  <Td>
                    <Input
                      aria-label={`Sconto della riga ${i + 1}`}
                      inputMode="decimal"
                      value={r.scontoTesto}
                      aria-invalid={c.discountBp === null}
                      onChange={(e) => aggiorna(r.chiave, { scontoTesto: e.target.value })}
                    />
                  </Td>
                  <Td>
                    <Input
                      aria-label={`IVA della riga ${i + 1}`}
                      inputMode="decimal"
                      value={r.ivaTesto}
                      aria-invalid={c.vatRateBp === null}
                      onChange={(e) => aggiorna(r.chiave, { ivaTesto: e.target.value })}
                    />
                  </Td>
                  <Td className="tabular-nums">
                    {imponibile === null ? '—' : formatCents(imponibile)}
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
                            : [rigaVuota()],
                        )
                      }
                    >
                      ✕
                    </Button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>

      <Card className="ml-auto max-w-sm space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-fg-muted">Imponibile</span>
          <span className="tabular-nums">{formatCents(totali.netCents)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-fg-muted">Spese di spedizione</span>
          <span className="tabular-nums">{formatCents(totali.shippingCents)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-fg-muted">IVA</span>
          <span className="tabular-nums">{formatCents(totali.vatCents)}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-1 font-semibold">
          <span>Totale</span>
          <span className="tabular-nums">{formatCents(totali.totalCents)}</span>
        </div>
      </Card>

      {errore && (
        <p role="alert" className="rounded border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {errore}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={inCorso}>
          {inCorso ? 'Salvataggio…' : iniziale ? 'Salva modifiche' : 'Crea bozza'}
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
