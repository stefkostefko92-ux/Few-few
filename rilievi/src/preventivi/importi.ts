/**
 * Сметките на офертата (собственикът, 12 ноември 2026 — точка C1): само цели числа, никога float. Парите са
 * в евроцентове, количеството — в хилядни (`1,5 m` = 1500), отстъпката — в стотни от процента (`12,5 %` =
 * 1250). Закръгляването е математическото (половината — нагоре, далеч от нулата), на всяка стъпка веднъж:
 * редът (количество × цена), после отстъпката на реда; ДДС-то се смята на сбора на облагаемото по ставка
 * (както в италианската фактура — „riepilogo IVA“), не ред по ред. Без база — тества се само.
 */

/** Ставките на ДДС в Италия, които офертата предлага: обичайната, намалената и минималната. */
export const ALIQUOTE = [22, 10, 4] as const;
export type Aliquota = (typeof ALIQUOTE)[number];
export const isAliquota = (value: unknown): value is Aliquota =>
  typeof value === 'number' && (ALIQUOTE as readonly number[]).includes(value);

/** Таваните — по-голямото е грешка на въвеждането, не оферта. */
export const MAX_CENTESIMI = 1_000_000_000; // 10 000 000,00 € на единица
export const MAX_MILLESIMI = 100_000_000; // 100 000 единици
export const MAX_SCONTO = 10_000; // 100 %
/** Сборът на офертата — колоните са INTEGER (21 474 836,47 €); над него офертата не се приема. */
export const MAX_TOTALE = 2_147_483_647;

/** a × b / d, закръглено математически — в BigInt, без загуба над 2^53. */
function mulDiv(a: number, b: number, d: number): number {
  const num = BigInt(a) * BigInt(b);
  const den = BigInt(d);
  const q = num / den;
  const r = num % den;
  const twice = (r < 0n ? -r : r) * 2n;
  const round = twice >= (den < 0n ? -den : den) ? (num < 0n ? -1n : 1n) : 0n;
  return Number(q + round);
}

export interface RigaImporto {
  /** Количеството в хилядни. */
  quantita: number;
  /** Цената за единица в центове. */
  prezzo: number;
  /** Отстъпката в стотни от процента. */
  sconto: number;
  iva: Aliquota;
}

/** Облагаемото на реда: количество × цена, после отстъпката — всяко закръглено веднъж. */
export function imponibileRiga(r: RigaImporto): number {
  const lordo = mulDiv(r.quantita, r.prezzo, 1000);
  return lordo - mulDiv(lordo, r.sconto, 10_000);
}

export interface Riepilogo {
  /** По ставка: облагаемото и ДДС-то, в реда на `ALIQUOTE` (само ставките с редове). */
  aliquote: Array<{ iva: Aliquota; imponibile: number; imposta: number }>;
  imponibile: number;
  imposta: number;
  totale: number;
}

export function riepilogo(righe: readonly RigaImporto[]): Riepilogo {
  const perAliquota = new Map<Aliquota, number>();
  for (const r of righe) perAliquota.set(r.iva, (perAliquota.get(r.iva) ?? 0) + imponibileRiga(r));
  const aliquote = ALIQUOTE.filter((a) => perAliquota.has(a)).map((iva) => {
    const imponibile = perAliquota.get(iva)!;
    return { iva, imponibile, imposta: mulDiv(imponibile, iva, 100) };
  });
  const imponibile = aliquote.reduce((s, a) => s + a.imponibile, 0);
  const imposta = aliquote.reduce((s, a) => s + a.imposta, 0);
  return { aliquote, imponibile, imposta, totale: imponibile + imposta };
}

/**
 * Текст → цели числа. „1.234,56“ и „1234.56“ са едно и също; хиляди с точка се приемат само в италианския
 * запис (запетая за десетичните). Повече знаци след запетаята от `decimali` — грешка (не се закръгля мълчаливо).
 */
function intero(raw: string, decimali: number, max: number): number | null {
  let s = raw.trim().replace(/\s|€|%/g, '');
  if (s === '') return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '');
  s = s.replace(',', '.');
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m || (m[2] ?? '').length > decimali) return null;
  const value = Number(m[1]) * 10 ** decimali + Number((m[2] ?? '').padEnd(decimali, '0') || '0');
  return Number.isSafeInteger(value) && value <= max ? value : null;
}

/** „1.234,56“ → 123456 центове; до 2 знака след запетаята. */
export const centesimiDa = (raw: string): number | null => intero(raw, 2, MAX_CENTESIMI);
/** „1,5“ → 1500 хилядни; до 3 знака. */
export const millesimiDa = (raw: string): number | null => intero(raw, 3, MAX_MILLESIMI);
/** „12,5“ → 1250 стотни от процента; до 2 знака, най-много 100. */
export const scontoDa = (raw: string): number | null => intero(raw, 2, MAX_SCONTO);

/** 123456 → „1.234,56“ (италиански запис, без знака на валутата). */
export function euro(centesimi: number): string {
  const neg = centesimi < 0;
  const abs = Math.abs(centesimi);
  const intera = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '−' : ''}${intera},${String(abs % 100).padStart(2, '0')}`;
}

/** 1500 → „1,5“; 2000 → „2“ (количеството, без излишни нули). */
export function quantitaTesto(millesimi: number): string {
  const intera = Math.floor(millesimi / 1000);
  const dec = String(millesimi % 1000)
    .padStart(3, '0')
    .replace(/0+$/, '');
  return dec ? `${intera},${dec}` : String(intera);
}

/** 1250 → „12,5“ (отстъпката в проценти). */
export function scontoTesto(centesimiPercento: number): string {
  const intera = Math.floor(centesimiPercento / 100);
  const dec = String(centesimiPercento % 100)
    .padStart(2, '0')
    .replace(/0+$/, '');
  return dec ? `${intera},${dec}` : String(intera);
}
