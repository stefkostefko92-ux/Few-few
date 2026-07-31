/**
 * Denaro e percentuali — funzioni pure, testate, senza dipendenze.
 *
 * Regola del prodotto: gli importi sono SEMPRE interi in centesimi di euro e le
 * percentuali interi in punti base (2200 = 22%). Nessun `number` con virgola
 * entra o esce da qui: 0.1 + 0.2 !== 0.3 e su una fattura questo è un errore
 * contabile, non un dettaglio.
 */

export const IVA_ORDINARIA_BP = 2200; // 22% — aliquota ordinaria italiana

/** Arrotondamento commerciale a metà per eccesso, corretto anche sui negativi. */
export function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Applica una percentuale espressa in punti base a un importo in centesimi. */
export function applyBp(cents: number, bp: number): number {
  return roundHalfUp((cents * bp) / 10_000);
}

/** Imponibile di riga: quantità × prezzo unitario, meno lo sconto di riga. */
export function lineNetCents(
  qty: number,
  unitPriceCents: number,
  discountBp = 0,
): number {
  const gross = qty * unitPriceCents;
  return gross - applyBp(gross, discountBp);
}

/** IVA di un imponibile. */
export function vatCents(netCents: number, vatRateBp = IVA_ORDINARIA_BP): number {
  return applyBp(netCents, vatRateBp);
}

export type TotalsLine = {
  qty: number;
  unitPriceCents: number;
  discountBp?: number;
  vatRateBp?: number;
};

export type Totals = {
  /** Imponibile dopo gli sconti di riga e lo sconto testata. */
  netCents: number;
  /** Sconto testata applicato (valore assoluto, positivo). */
  headerDiscountCents: number;
  vatCents: number;
  shippingCents: number;
  totalCents: number;
};

/**
 * Totali di un documento (ordine di acquisto o di vendita).
 *
 * Lo sconto di testata si ripartisce PROPORZIONALMENTE sulle righe prima di
 * calcolare l'IVA: righe con aliquote diverse devono ridursi ciascuna della
 * propria quota, altrimenti l'IVA totale non corrisponde alla somma delle
 * aliquote. Le spedizioni seguono l'aliquota ordinaria.
 */
export function computeTotals(
  lines: readonly TotalsLine[],
  { shippingCents = 0, headerDiscountBp = 0 } = {},
): Totals {
  const nets = lines.map((l) =>
    lineNetCents(l.qty, l.unitPriceCents, l.discountBp ?? 0),
  );
  const grossNet = nets.reduce((a, b) => a + b, 0);
  const headerDiscountCents = applyBp(grossNet, headerDiscountBp);

  let vat = 0;
  let discountAssigned = 0;
  nets.forEach((net, i) => {
    // L'ultima riga assorbe il resto dell'arrotondamento: la somma delle quote
    // deve fare esattamente lo sconto di testata, né un centesimo in più né in meno.
    const share =
      i === nets.length - 1
        ? headerDiscountCents - discountAssigned
        : grossNet === 0
          ? 0
          : roundHalfUp((headerDiscountCents * net) / grossNet);
    discountAssigned += share;
    vat += vatCents(net - share, lines[i].vatRateBp ?? IVA_ORDINARIA_BP);
  });

  const netCents = grossNet - headerDiscountCents;
  const shippingVat = vatCents(shippingCents, IVA_ORDINARIA_BP);

  return {
    netCents,
    headerDiscountCents,
    vatCents: vat + shippingVat,
    shippingCents,
    totalCents: netCents + shippingCents + vat + shippingVat,
  };
}

const EURO = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
});

/** Formato italiano: 1.234,56 €. */
export function formatCents(cents: number): string {
  return EURO.format(cents / 100);
}

/** Percentuale leggibile da punti base: 2200 → "22%", 550 → "5,5%". */
export function formatBp(bp: number): string {
  return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(bp / 100)}%`;
}

/**
 * Legge un importo digitato dall'operatore in formato italiano ("1.234,56",
 * "1234,56", "1234.56") e lo restituisce in centesimi. `null` se non è un numero.
 */
export function parseEuroToCents(input: string): number | null {
  const raw = input.trim().replace(/[€\s ]/g, '');
  if (!raw) return null;
  // "1.234,56" → "1234.56"; "1,234.56" non è formato italiano e viene rifiutato
  // implicitamente perché la virgola resta il separatore decimale.
  const normalised = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalised)) return null;
  return roundHalfUp(Number(normalised) * 100);
}

/** Numero intero formattato all'italiana (separatore migliaia "."). */
export function formatQty(qty: number): string {
  return new Intl.NumberFormat('it-IT').format(qty);
}
