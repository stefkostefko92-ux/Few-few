'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Uom } from '@prisma/client';
import {
  computeTotals,
  formatBp,
  formatCents,
  parseEuroToCents,
} from '@/lib/money';
import { UOM_LABELS } from '@/lib/labels';
import { Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import { invia } from './client';

export type ProdottoOpzione = {
  id: string;
  sku: string;
  name: string;
  uom: Uom;
  priceCents: number;
  vatRateBp: number;
  disponibile: number;
};

export type ClienteOpzione = {
  id: string;
  code: string;
  name: string;
  discountBp: number;
};

export type RigaIniziale = {
  productId: string;
  qty: number;
  unitPriceCents: number;
  discountBp: number;
  vatRateBp: number;
  note: string | null;
};

export type OrdineIniziale = {
  id: string;
  customerId: string;
  status: 'BOZZA' | 'PREVENTIVO';
  shippingCents: number;
  discountBp: number;
  notes: string | null;
  lines: RigaIniziale[];
};

type RigaStato = {
  chiave: string;
  productId: string;
  qty: string;
  prezzo: string;
  sconto: string;
  iva: string;
  note: string;
};

/** I punti base si scrivono come percentuale: 2200 → «22». */
function bpAcampo(bp: number): string {
  return String(bp / 100).replace('.', ',');
}

function centesimiAcampo(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

function rigaVuota(): RigaStato {
  return {
    chiave: `r${Math.random().toString(36).slice(2, 10)}`,
    productId: '',
    qty: '1',
    prezzo: '0,00',
    sconto: '0',
    iva: '22',
    note: '',
  };
}

/**
 * Editor dell'ordine di vendita.
 *
 * I totali qui sono **indicativi**: servono al commerciale mentre tratta, ma
 * quelli veri li ricalcola il server alla scrittura, con le stesse funzioni di
 * `money.ts`. Nessun importo calcolato dal browser viene inviato.
 */
export function OrdineEditor({
  clienti,
  prodotti,
  ordine,
}: {
  clienti: ClienteOpzione[];
  prodotti: ProdottoOpzione[];
  ordine?: OrdineIniziale;
}) {
  const router = useRouter();
  const perId = useMemo(() => new Map(prodotti.map((p) => [p.id, p])), [prodotti]);

  const [customerId, setCustomerId] = useState(ordine?.customerId ?? '');
  const [status, setStatus] = useState<'BOZZA' | 'PREVENTIVO'>(ordine?.status ?? 'BOZZA');
  const [spedizione, setSpedizione] = useState(centesimiAcampo(ordine?.shippingCents ?? 0));
  const [scontoTesta, setScontoTesta] = useState(bpAcampo(ordine?.discountBp ?? 0));
  const [note, setNote] = useState(ordine?.notes ?? '');
  const [righe, setRighe] = useState<RigaStato[]>(
    ordine && ordine.lines.length > 0
      ? ordine.lines.map((l) => ({
          chiave: `r${Math.random().toString(36).slice(2, 10)}`,
          productId: l.productId,
          qty: String(l.qty),
          prezzo: centesimiAcampo(l.unitPriceCents),
          sconto: bpAcampo(l.discountBp),
          iva: bpAcampo(l.vatRateBp),
          note: l.note ?? '',
        }))
      : [rigaVuota()],
  );
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);

  const cliente = clienti.find((c) => c.id === customerId) ?? null;

  function aggiorna(chiave: string, patch: Partial<RigaStato>) {
    setRighe((prec) => prec.map((r) => (r.chiave === chiave ? { ...r, ...patch } : r)));
  }

  /** Cambiando prodotto si riparte dal listino e dallo sconto del cliente. */
  function scegliProdotto(chiave: string, productId: string) {
    const prodotto = perId.get(productId);
    aggiorna(chiave, {
      productId,
      ...(prodotto
        ? {
            prezzo: centesimiAcampo(prodotto.priceCents),
            iva: bpAcampo(prodotto.vatRateBp),
            sconto: bpAcampo(cliente?.discountBp ?? 0),
          }
        : {}),
    });
  }

  const calcolate = righe.map((r) => {
    const qty = Number.parseInt(r.qty, 10);
    return {
      riga: r,
      prodotto: perId.get(r.productId) ?? null,
      qty: Number.isFinite(qty) ? qty : 0,
      unitPriceCents: parseEuroToCents(r.prezzo),
      discountBp: parseEuroToCents(r.sconto),
      vatRateBp: parseEuroToCents(r.iva),
    };
  });

  const totali = computeTotals(
    calcolate.map((c) => ({
      qty: Math.max(0, c.qty),
      unitPriceCents: c.unitPriceCents ?? 0,
      discountBp: c.discountBp ?? 0,
      vatRateBp: c.vatRateBp ?? 2200,
    })),
    {
      shippingCents: parseEuroToCents(spedizione) ?? 0,
      headerDiscountBp: parseEuroToCents(scontoTesta) ?? 0,
    },
  );

  async function salva() {
    setErrore(null);

    if (!customerId) {
      setErrore('Selezionare il cliente.');
      return;
    }
    const problemi = calcolate.filter(
      (c) =>
        !c.prodotto ||
        c.qty <= 0 ||
        c.unitPriceCents === null ||
        c.discountBp === null ||
        c.vatRateBp === null,
    );
    if (problemi.length > 0 || calcolate.length === 0) {
      setErrore('Controllare le righe: prodotto, quantità e importi devono essere validi.');
      return;
    }

    setInvio(true);
    try {
      const corpo = {
        customerId,
        status,
        shippingCents: parseEuroToCents(spedizione) ?? 0,
        discountBp: parseEuroToCents(scontoTesta) ?? 0,
        notes: note.trim() || null,
        lines: calcolate.map((c) => ({
          productId: c.riga.productId,
          qty: c.qty,
          unitPriceCents: c.unitPriceCents ?? 0,
          discountBp: c.discountBp ?? 0,
          vatRateBp: c.vatRateBp ?? 2200,
          note: c.riga.note.trim() || null,
        })),
      };

      if (ordine) {
        await invia(`/api/vendite/${ordine.id}`, 'PATCH', corpo);
        router.refresh();
      } else {
        const creato = await invia<{ id: string }>('/api/vendite', 'POST', corpo);
        router.push(`/vendite/${creato.id}`);
      }
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Errore imprevisto.');
    } finally {
      setInvio(false);
    }
  }

  return (
    <div className="space-y-4">
      {errore && (
        <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {errore}
        </p>
      )}

      <Card className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Cliente" htmlFor="cliente" required>
          <Select
            id="cliente"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">— seleziona —</option>
            {clienti.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Stato"
          htmlFor="stato"
          hint="La merce si impegna solo alla conferma."
        >
          <Select
            id="stato"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'BOZZA' | 'PREVENTIVO')}
          >
            <option value="BOZZA">Bozza</option>
            <option value="PREVENTIVO">Preventivo</option>
          </Select>
        </Field>

        <Field label="Sconto di testata (%)" htmlFor="sconto-testata">
          <Input
            id="sconto-testata"
            inputMode="decimal"
            value={scontoTesta}
            onChange={(e) => setScontoTesta(e.target.value)}
          />
        </Field>

        <Field label="Spese di spedizione (€)" htmlFor="spese">
          <Input
            id="spese"
            inputMode="decimal"
            value={spedizione}
            onChange={(e) => setSpedizione(e.target.value)}
          />
        </Field>
      </Card>

      {cliente && cliente.discountBp > 0 && (
        <p className="text-sm text-fg-muted">
          Sconto di listino del cliente: <strong>{formatBp(cliente.discountBp)}</strong> —
          applicato alle nuove righe.
        </p>
      )}

      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className="border-b border-border bg-muted px-3 py-2 text-left font-medium text-fg-muted">
                Prodotto
              </th>
              <th scope="col" className="border-b border-border bg-muted px-3 py-2 text-left font-medium text-fg-muted">
                Qtà
              </th>
              <th scope="col" className="border-b border-border bg-muted px-3 py-2 text-left font-medium text-fg-muted">
                Prezzo unit. €
              </th>
              <th scope="col" className="border-b border-border bg-muted px-3 py-2 text-left font-medium text-fg-muted">
                Sconto %
              </th>
              <th scope="col" className="border-b border-border bg-muted px-3 py-2 text-left font-medium text-fg-muted">
                IVA %
              </th>
              <th scope="col" className="border-b border-border bg-muted px-3 py-2 text-right font-medium text-fg-muted">
                Imponibile
              </th>
              <th scope="col" className="border-b border-border bg-muted px-3 py-2">
                <span className="sr-only">Azioni</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {calcolate.map((c) => {
              const netto =
                c.unitPriceCents !== null && c.discountBp !== null
                  ? computeTotals([
                      {
                        qty: Math.max(0, c.qty),
                        unitPriceCents: c.unitPriceCents,
                        discountBp: c.discountBp,
                        vatRateBp: 0,
                      },
                    ]).netCents
                  : 0;
              const scarso = c.prodotto !== null && c.qty > c.prodotto.disponibile;
              return (
                <tr key={c.riga.chiave} className="align-top">
                  <td className="border-b border-border px-3 py-2">
                    <label className="sr-only" htmlFor={`prod-${c.riga.chiave}`}>
                      Prodotto della riga
                    </label>
                    <Select
                      id={`prod-${c.riga.chiave}`}
                      value={c.riga.productId}
                      onChange={(e) => scegliProdotto(c.riga.chiave, e.target.value)}
                    >
                      <option value="">— seleziona —</option>
                      {prodotti.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name}
                        </option>
                      ))}
                    </Select>
                    {c.prodotto && (
                      <p className={scarso ? 'mt-1 text-xs font-medium text-danger' : 'mt-1 text-xs text-fg-muted'}>
                        Disponibile: {c.prodotto.disponibile} {UOM_LABELS[c.prodotto.uom]}
                        {scarso ? ' — disponibilità insufficiente, la conferma verrà rifiutata.' : ''}
                      </p>
                    )}
                    <label className="sr-only" htmlFor={`nota-${c.riga.chiave}`}>
                      Nota della riga
                    </label>
                    <Input
                      id={`nota-${c.riga.chiave}`}
                      className="mt-1"
                      placeholder="Nota di riga (facoltativa)"
                      value={c.riga.note}
                      onChange={(e) => aggiorna(c.riga.chiave, { note: e.target.value })}
                    />
                  </td>
                  <td className="border-b border-border px-3 py-2">
                    <label className="sr-only" htmlFor={`qty-${c.riga.chiave}`}>
                      Quantità
                    </label>
                    <Input
                      id={`qty-${c.riga.chiave}`}
                      className="w-24"
                      inputMode="numeric"
                      value={c.riga.qty}
                      onChange={(e) => aggiorna(c.riga.chiave, { qty: e.target.value })}
                    />
                  </td>
                  <td className="border-b border-border px-3 py-2">
                    <label className="sr-only" htmlFor={`prezzo-${c.riga.chiave}`}>
                      Prezzo unitario in euro
                    </label>
                    <Input
                      id={`prezzo-${c.riga.chiave}`}
                      className="w-28"
                      inputMode="decimal"
                      value={c.riga.prezzo}
                      onChange={(e) => aggiorna(c.riga.chiave, { prezzo: e.target.value })}
                    />
                  </td>
                  <td className="border-b border-border px-3 py-2">
                    <label className="sr-only" htmlFor={`sconto-${c.riga.chiave}`}>
                      Sconto di riga in percentuale
                    </label>
                    <Input
                      id={`sconto-${c.riga.chiave}`}
                      className="w-20"
                      inputMode="decimal"
                      value={c.riga.sconto}
                      onChange={(e) => aggiorna(c.riga.chiave, { sconto: e.target.value })}
                    />
                  </td>
                  <td className="border-b border-border px-3 py-2">
                    <label className="sr-only" htmlFor={`iva-${c.riga.chiave}`}>
                      Aliquota IVA in percentuale
                    </label>
                    <Input
                      id={`iva-${c.riga.chiave}`}
                      className="w-20"
                      inputMode="decimal"
                      value={c.riga.iva}
                      onChange={(e) => aggiorna(c.riga.chiave, { iva: e.target.value })}
                    />
                  </td>
                  <td className="border-b border-border px-3 py-2 text-right tabular-nums">
                    {formatCents(netto)}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-right">
                    <Button
                      type="button"
                      variant="fantasma"
                      size="sm"
                      onClick={() =>
                        setRighe((prec) =>
                          prec.length > 1
                            ? prec.filter((r) => r.chiave !== c.riga.chiave)
                            : prec,
                        )
                      }
                      aria-label="Rimuovi la riga"
                      disabled={righe.length <= 1}
                    >
                      Rimuovi
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <Button type="button" variant="secondario" onClick={() => setRighe((p) => [...p, rigaVuota()])}>
          Aggiungi riga
        </Button>

        <Card className="w-full max-w-sm space-y-1 text-sm">
          <p className="text-xs text-fg-muted">
            Totali indicativi — il calcolo definitivo è del server.
          </p>
          <div className="flex justify-between">
            <span>Imponibile</span>
            <span className="tabular-nums">{formatCents(totali.netCents)}</span>
          </div>
          {totali.headerDiscountCents > 0 && (
            <div className="flex justify-between text-fg-muted">
              <span>Sconto di testata</span>
              <span className="tabular-nums">− {formatCents(totali.headerDiscountCents)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Spedizione</span>
            <span className="tabular-nums">{formatCents(totali.shippingCents)}</span>
          </div>
          <div className="flex justify-between">
            <span>IVA</span>
            <span className="tabular-nums">{formatCents(totali.vatCents)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1 font-semibold">
            <span>Totale</span>
            <span className="tabular-nums">{formatCents(totali.totalCents)}</span>
          </div>
        </Card>
      </div>

      <Field label="Note dell’ordine" htmlFor="note-ordine">
        <Textarea id="note-ordine" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <div className="flex gap-2">
        <Button type="button" onClick={salva} disabled={invio}>
          {invio ? 'Salvataggio…' : ordine ? 'Salva modifiche' : 'Crea ordine'}
        </Button>
      </div>
    </div>
  );
}
