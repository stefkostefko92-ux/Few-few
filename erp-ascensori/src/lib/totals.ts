// Парична аритметика в цели центесими (int) — никакви float.
// Decimal стойностите пътуват като низове "123.45"; тук се смятат точно.

/** "123.45" | 123.45 | Prisma Decimal → центесими (int). Хвърля при невалиден вход. */
export function toCents(v: string | number | { toString(): string }): number {
  const s = typeof v === "string" ? v.trim() : v.toString();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Importo non valido: ${s}`);
  const neg = s.startsWith("-");
  const [intPart, fracPart = ""] = (neg ? s.slice(1) : s).split(".");
  // half-up закръгляне при повече от 2 десетични
  const frac2 = (fracPart + "00").slice(0, 2);
  let cents = parseInt(intPart, 10) * 100 + parseInt(frac2, 10);
  if (fracPart.length > 2 && parseInt(fracPart[2], 10) >= 5) cents += 1;
  return neg ? -cents : cents;
}

/** центесими → "123.45" */
export function fromCents(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const int = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${neg ? "-" : ""}${int}.${frac}`;
}

export interface VoceInput {
  quantita: string | number; // две десетични
  prezzoUnitario: string | number; // две десетични
  aliquotaIva: string | number; // процент, две десетични
}

export interface TotaliDocumento {
  totaleNetto: string;
  totaleIva: string;
  totaleLordo: string;
  /** тотал на всяка редица, в реда на подаване */
  totaliVoci: string[];
}

/** Тотал на редица: qty × prezzo, half-up до центесим. */
export function totaleVoce(v: VoceInput): number {
  const qtyCent = toCents(v.quantita); // количество в стотни
  const prezzo = toCents(v.prezzoUnitario);
  // (qty/100) * prezzo → /100 с half-up
  const raw = qtyCent * prezzo;
  return Math.sign(raw) * Math.round(Math.abs(raw) / 100);
}

/** ДДС на редица от вече сметнат тотал, half-up. */
export function ivaVoce(totaleCents: number, aliquota: string | number): number {
  const alCent = toCents(aliquota); // 22.00 → 2200
  const raw = totaleCents * alCent;
  return Math.sign(raw) * Math.round(Math.abs(raw) / 10000);
}

/** Преизчислява imponibile/imposta/totale от редовете — никога на ръка. */
export function calcolaTotali(voci: VoceInput[]): TotaliDocumento {
  let netto = 0;
  let iva = 0;
  const totali: string[] = [];
  for (const v of voci) {
    const t = totaleVoce(v);
    netto += t;
    iva += ivaVoce(t, v.aliquotaIva);
    totali.push(fromCents(t));
  }
  return {
    totaleNetto: fromCents(netto),
    totaleIva: fromCents(iva),
    totaleLordo: fromCents(netto + iva),
    totaliVoci: totali,
  };
}
