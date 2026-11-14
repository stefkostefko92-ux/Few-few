import { ALIQUOTA_BG_BP, conIva } from './importi.js';

/**
 * Сумите на кредитното известие (условията 2026-11-14, чл. 12.9; чл. 115 ЗДДС) — без база. Върнатото е сума с
 * ДДС, когато фактурата е била с ДДС: данъчната основа и данъкът се отделят от нея до цент и дават точно нея.
 */

/** Срокът за издаване: 5 дни от връщането (чл. 115, ал. 2 ЗДДС). */
export const GIORNI_NOTA_CREDITO = 5;

export const entroIlDa = (eventoAt: Date): Date =>
  new Date(eventoAt.getTime() + GIORNI_NOTA_CREDITO * 24 * 60 * 60_000);

/** Върнатата сума (центове) → основа и ДДС по режима на фактурата. */
export function scomponiRimborso(
  totaleCent: number,
  regime: string,
): { imponibile: number; iva: number } {
  if (!conIva(regime)) return { imponibile: totaleCent, iva: 0 };
  const divisore = 10_000 + ALIQUOTA_BG_BP;
  const imponibile = Math.floor((totaleCent * 10_000 + divisore / 2) / divisore);
  return { imponibile, iva: totaleCent - imponibile };
}
