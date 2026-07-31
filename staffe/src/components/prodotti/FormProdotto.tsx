'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatBp, formatCents, parseEuroToCents } from '@/lib/money';
import { MATERIAL_LABELS, UOM_LABELS } from '@/lib/labels';
import {
  ALIQUOTE_IVA_BP,
  MATERIALI,
  UNITA_MISURA,
} from '@/lib/validation/prodotti';
import { Button, Card, Field, Input, Select, Textarea } from '@/components/ui';

/**
 * Form di anagrafica prodotto (creazione e modifica).
 *
 * Gli importi si digitano in euro all'italiana ("12,50") e viaggiano in
 * centesimi: la conversione avviene una sola volta, con `parseEuroToCents`, e
 * un importo illeggibile blocca l'invio invece di diventare silenziosamente 0.
 */

export type ValoriProdotto = {
  id?: string;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  categoryId: string;
  material: (typeof MATERIALI)[number];
  finish: string;
  uom: (typeof UNITA_MISURA)[number];
  weightGrams: string;
  lengthMm: string;
  widthMm: string;
  heightMm: string;
  thicknessMm: string;
  compatibility: string;
  brand: string;
  costo: string;
  prezzo: string;
  vatRateBp: number;
  supplierId: string;
  minStock: string;
  maxStock: string;
  defaultLocationId: string;
  batchTracked: boolean;
  notes: string;
  active: boolean;
};

export const PRODOTTO_VUOTO: ValoriProdotto = {
  sku: '',
  barcode: '',
  name: '',
  description: '',
  categoryId: '',
  material: 'ACCIAIO_ZINCATO',
  finish: '',
  uom: 'PZ',
  weightGrams: '0',
  lengthMm: '',
  widthMm: '',
  heightMm: '',
  thicknessMm: '',
  compatibility: '',
  brand: '',
  costo: '',
  prezzo: '',
  vatRateBp: 2200,
  supplierId: '',
  minStock: '0',
  maxStock: '',
  defaultLocationId: '',
  batchTracked: false,
  notes: '',
  active: true,
};

type Opzione = { id: string; name: string };

/**
 * Centesimi → testo modificabile ("1250" → "12,50"). Senza simbolo di valuta:
 * nel campo si digita solo il numero, il simbolo lo mette la lettura.
 */
export function centesimiInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

function interoOpzionale(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function intero(v: string): number {
  return interoOpzionale(v) ?? 0;
}

export function FormProdotto({
  iniziale,
  categorie,
  fornitori,
  ubicazioni,
  vedeCosti,
}: {
  iniziale: ValoriProdotto;
  categorie: readonly Opzione[];
  fornitori: readonly Opzione[];
  ubicazioni: readonly { id: string; code: string }[];
  vedeCosti: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState<ValoriProdotto>(iniziale);
  const [errore, setErrore] = useState<string | null>(null);
  const [campi, setCampi] = useState<Record<string, string[]>>({});
  const [inCorso, setInCorso] = useState(false);

  const modifica = Boolean(iniziale.id);

  function set<K extends keyof ValoriProdotto>(k: K, valore: ValoriProdotto[K]) {
    setV((p) => ({ ...p, [k]: valore }));
  }

  const costCents = v.costo.trim() === '' ? 0 : parseEuroToCents(v.costo);
  const priceCents = v.prezzo.trim() === '' ? 0 : parseEuroToCents(v.prezzo);
  const margineBp =
    priceCents !== null && costCents !== null && priceCents > 0
      ? Math.round(((priceCents - costCents) * 10_000) / priceCents)
      : null;

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setCampi({});

    if (costCents === null || priceCents === null) {
      setErrore('Costo o prezzo non sono importi validi (esempio: 12,50).');
      return;
    }

    const corpo = {
      sku: v.sku.trim(),
      barcode: v.barcode.trim() || null,
      name: v.name.trim(),
      description: v.description.trim() || null,
      categoryId: v.categoryId,
      material: v.material,
      finish: v.finish.trim() || null,
      uom: v.uom,
      weightGrams: intero(v.weightGrams),
      lengthMm: interoOpzionale(v.lengthMm),
      widthMm: interoOpzionale(v.widthMm),
      heightMm: interoOpzionale(v.heightMm),
      thicknessMm: interoOpzionale(v.thicknessMm),
      compatibility: v.compatibility.trim() || null,
      brand: v.brand.trim() || null,
      costCents,
      priceCents,
      vatRateBp: v.vatRateBp,
      supplierId: v.supplierId || null,
      minStock: intero(v.minStock),
      maxStock: interoOpzionale(v.maxStock),
      defaultLocationId: v.defaultLocationId || null,
      batchTracked: v.batchTracked,
      notes: v.notes.trim() || null,
      active: v.active,
    };

    setInCorso(true);
    try {
      const res = await fetch(
        modifica ? `/api/prodotti/${iniziale.id}` : '/api/prodotti',
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
      router.push(`/prodotti/${body?.data?.id ?? iniziale.id}`);
      router.refresh();
    } catch {
      setErrore('Server non raggiungibile. Riprova.');
    } finally {
      setInCorso(false);
    }
  }

  const err = (k: string) => campi[k]?.[0];

  return (
    <form onSubmit={invia} className="space-y-4">
      {errore && (
        <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {errore}
        </p>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Identificazione
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="SKU" htmlFor="sku" required error={err('sku')} hint="Codice interno univoco.">
            <Input
              id="sku"
              value={v.sku}
              onChange={(e) => set('sku', e.target.value)}
              required
              maxLength={40}
            />
          </Field>

          <Field
            label="Codice a barre"
            htmlFor="barcode"
            error={err('barcode')}
            hint="EAN-13 o Code128 stampato sull'etichetta. Si può scansionare direttamente in questo campo."
          >
            <Input
              id="barcode"
              value={v.barcode}
              onChange={(e) => set('barcode', e.target.value)}
              maxLength={40}
            />
          </Field>

          <div className="md:col-span-2">
            <Field label="Nome" htmlFor="name" required error={err('name')}>
              <Input
                id="name"
                value={v.name}
                onChange={(e) => set('name', e.target.value)}
                required
                maxLength={200}
              />
            </Field>
          </div>

          <div className="md:col-span-2">
            <Field label="Descrizione" htmlFor="description" error={err('description')}>
              <Textarea
                id="description"
                value={v.description}
                onChange={(e) => set('description', e.target.value)}
                maxLength={2000}
              />
            </Field>
          </div>

          <Field label="Categoria" htmlFor="categoryId" required error={err('categoryId')}>
            <Select
              id="categoryId"
              value={v.categoryId}
              onChange={(e) => set('categoryId', e.target.value)}
              required
            >
              <option value="">Seleziona…</option>
              {categorie.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Marca" htmlFor="brand" error={err('brand')}>
            <Input
              id="brand"
              value={v.brand}
              onChange={(e) => set('brand', e.target.value)}
              maxLength={120}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Caratteristiche tecniche
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Materiale" htmlFor="material" error={err('material')}>
            <Select
              id="material"
              value={v.material}
              onChange={(e) =>
                set('material', e.target.value as ValoriProdotto['material'])
              }
            >
              {MATERIALI.map((m) => (
                <option key={m} value={m}>
                  {MATERIAL_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Finitura" htmlFor="finish" error={err('finish')} hint="es. zincatura a caldo, RAL 9006">
            <Input
              id="finish"
              value={v.finish}
              onChange={(e) => set('finish', e.target.value)}
              maxLength={120}
            />
          </Field>

          <Field label="Unità di misura" htmlFor="uom" error={err('uom')}>
            <Select
              id="uom"
              value={v.uom}
              onChange={(e) => set('uom', e.target.value as ValoriProdotto['uom'])}
            >
              {UNITA_MISURA.map((u) => (
                <option key={u} value={u}>
                  {UOM_LABELS[u]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Peso (g)" htmlFor="weightGrams" error={err('weightGrams')}>
            <Input
              id="weightGrams"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={v.weightGrams}
              onChange={(e) => set('weightGrams', e.target.value)}
            />
          </Field>

          <Field label="Lunghezza (mm)" htmlFor="lengthMm" error={err('lengthMm')}>
            <Input
              id="lengthMm"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={v.lengthMm}
              onChange={(e) => set('lengthMm', e.target.value)}
            />
          </Field>

          <Field label="Larghezza (mm)" htmlFor="widthMm" error={err('widthMm')}>
            <Input
              id="widthMm"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={v.widthMm}
              onChange={(e) => set('widthMm', e.target.value)}
            />
          </Field>

          <Field label="Altezza (mm)" htmlFor="heightMm" error={err('heightMm')}>
            <Input
              id="heightMm"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={v.heightMm}
              onChange={(e) => set('heightMm', e.target.value)}
            />
          </Field>

          <Field label="Spessore (mm)" htmlFor="thicknessMm" error={err('thicknessMm')}>
            <Input
              id="thicknessMm"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={v.thicknessMm}
              onChange={(e) => set('thicknessMm', e.target.value)}
            />
          </Field>

          <div className="md:col-span-3">
            <Field
              label="Compatibilità"
              htmlFor="compatibility"
              error={err('compatibility')}
              hint="Modelli di ascensore o guide compatibili — è un campo ricercabile."
            >
              <Input
                id="compatibility"
                value={v.compatibility}
                onChange={(e) => set('compatibility', e.target.value)}
                maxLength={500}
              />
            </Field>
          </div>
        </div>
      </Card>

      {vedeCosti && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Prezzi
          </h2>
          <div className="grid gap-3 md:grid-cols-3">
            <Field
              label="Costo d'acquisto (€)"
              htmlFor="costo"
              error={err('costCents')}
              hint="Formato italiano, due decimali: 12,50"
            >
              <Input
                id="costo"
                inputMode="decimal"
                value={v.costo}
                onChange={(e) => set('costo', e.target.value)}
                placeholder="0,00"
              />
            </Field>

            <Field
              label="Prezzo di vendita, IVA esclusa (€)"
              htmlFor="prezzo"
              error={err('priceCents')}
              hint="Formato italiano, due decimali: 24,90"
            >
              <Input
                id="prezzo"
                inputMode="decimal"
                value={v.prezzo}
                onChange={(e) => set('prezzo', e.target.value)}
                placeholder="0,00"
              />
            </Field>

            <Field label="Aliquota IVA" htmlFor="vatRateBp" error={err('vatRateBp')}>
              <Select
                id="vatRateBp"
                value={String(v.vatRateBp)}
                onChange={(e) => set('vatRateBp', Number(e.target.value))}
              >
                {ALIQUOTE_IVA_BP.map((bp) => (
                  <option key={bp} value={bp}>
                    {formatBp(bp)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <p className="mt-2 text-sm text-fg-muted" aria-live="polite">
            {costCents === null || priceCents === null
              ? 'Importo non leggibile: usa il formato 12,50.'
              : `Margine: ${
                  margineBp === null ? '—' : formatBp(margineBp)
                } · ricarico ${formatCents(priceCents - costCents)} a pezzo.`}
          </p>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Approvvigionamento e magazzino
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Fornitore" htmlFor="supplierId" error={err('supplierId')}>
            <Select
              id="supplierId"
              value={v.supplierId}
              onChange={(e) => set('supplierId', e.target.value)}
            >
              <option value="">Nessuno</option>
              {fornitori.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Scorta minima"
            htmlFor="minStock"
            error={err('minStock')}
            hint="Sotto questa soglia scatta l'avviso di riordino."
          >
            <Input
              id="minStock"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={v.minStock}
              onChange={(e) => set('minStock', e.target.value)}
            />
          </Field>

          <Field label="Scorta massima" htmlFor="maxStock" error={err('maxStock')}>
            <Input
              id="maxStock"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={v.maxStock}
              onChange={(e) => set('maxStock', e.target.value)}
            />
          </Field>

          <div className="md:col-span-3">
            <Field
              label="Ubicazione predefinita"
              htmlFor="defaultLocationId"
              error={err('defaultLocationId')}
              hint="Dove si mette la merce in ricevimento, se non indicato diversamente."
            >
              <Select
                id="defaultLocationId"
                value={v.defaultLocationId}
                onChange={(e) => set('defaultLocationId', e.target.value)}
              >
                <option value="">Nessuna</option>
                {ubicazioni.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="md:col-span-3">
            <Field label="Note" htmlFor="notes" error={err('notes')}>
              <Textarea
                id="notes"
                value={v.notes}
                onChange={(e) => set('notes', e.target.value)}
                maxLength={2000}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm" htmlFor="batchTracked">
            <input
              id="batchTracked"
              type="checkbox"
              checked={v.batchTracked}
              onChange={(e) => set('batchTracked', e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Gestito a lotti
          </label>

          <label className="flex items-center gap-2 text-sm" htmlFor="active">
            <input
              id="active"
              type="checkbox"
              checked={v.active}
              onChange={(e) => set('active', e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Attivo a catalogo
          </label>
        </div>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={inCorso}>
          {inCorso ? 'Salvataggio…' : modifica ? 'Salva modifiche' : 'Crea prodotto'}
        </Button>
        <Button
          type="button"
          variant="secondario"
          size="lg"
          onClick={() => router.back()}
          disabled={inCorso}
        >
          Annulla
        </Button>
      </div>
    </form>
  );
}
