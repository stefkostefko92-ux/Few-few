// Парична аритметика в цели центесими (int) — никакви float.
// Decimal стойностите пътуват като низове "123.45"; тук се смятат точно.

/** "123.45" | "123,45" | 123.45 | Prisma Decimal → центесими (int). */
export function toCents(v: string | number | { toString(): string }): number {
  // приемаме и италианската запетая като десетичен разделител
  const s = (typeof v === "string" ? v.trim() : v.toString()).replace(",", ".");
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
export function ivaVoce(
  totaleCents: number,
  aliquota: string | number,
): number {
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

// ── Обобщение по аликвота (riepilogo IVA) ───────────────────────────────────

export interface RigaRiepilogo {
  /** аликвота като низ с две десетични, напр. „22.00" */
  aliquota: string;
  imponibile: string;
  imposta: string;
}

/**
 * ДДС-то, сметнато ПО АЛИКВОТА, а не сумирано по редове.
 *
 * Това е разликата, която прави фактурата приемлива за Sistema di Interscambio.
 * Сумирането по редове закръгля N пъти (веднъж на ред), обобщението — веднъж на
 * ставка. При десет реда по 10 % разликата е до няколко цента, а SDI отхвърля
 * документ, чийто `DatiRiepilogo` не съвпада с `ImportoTotaleDocumento`.
 *
 * Конкретно: 3 реда по 0,105 € с 22 % дават 0,02+0,02+0,02 = 0,06 по редове,
 * но 0,32 × 22 % = 0,07 по обобщение. Правилното е второто.
 */
export function riepilogoIva(voci: VoceInput[]): RigaRiepilogo[] {
  const perAliquota = new Map<number, number>();
  for (const v of voci) {
    const al = toCents(v.aliquotaIva);
    perAliquota.set(al, (perAliquota.get(al) ?? 0) + totaleVoce(v));
  }
  return [...perAliquota.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([al, imponibile]) => ({
      aliquota: fromCents(al),
      imponibile: fromCents(imponibile),
      // Закръглянето е ВЕДНЪЖ, върху сбора на облагаемото по тази ставка.
      imposta: fromCents(ivaVoce(imponibile, fromCents(al))),
    }));
}

/** Тоталите, изведени ОТ обобщението — формата, която SDI очаква. */
export function totaliDaRiepilogo(voci: VoceInput[]): {
  totaleNetto: string;
  totaleIva: string;
  totaleLordo: string;
  riepilogo: RigaRiepilogo[];
} {
  const riepilogo = riepilogoIva(voci);
  const netto = riepilogo.reduce((a, r) => a + toCents(r.imponibile), 0);
  const iva = riepilogo.reduce((a, r) => a + toCents(r.imposta), 0);
  return {
    totaleNetto: fromCents(netto),
    totaleIva: fromCents(iva),
    totaleLordo: fromCents(netto + iva),
    riepilogo,
  };
}
