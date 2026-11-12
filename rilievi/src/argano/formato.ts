/**
 * Числата на изчислението по италиански („1.234,56“): страницата и PDF-ът показват едно и също. Броят
 * на десетичните е по величината — силите в N без десетични, отношенията с два, f и C1 с три.
 */

const formatters = new Map<number, Intl.NumberFormat>();

export function numero(value: number, decimali: number): string {
  let f = formatters.get(decimali);
  if (!f) {
    f = new Intl.NumberFormat('it-IT', {
      minimumFractionDigits: decimali,
      maximumFractionDigits: decimali,
    });
    formatters.set(decimali, f);
  }
  return f.format(value);
}

/** Процентът със знак („+3,4 %“, „−26,7 %“). */
export function percentuale(value: number): string {
  const s = numero(Math.abs(value * 100), 1);
  return `${value < 0 ? '−' : value > 0 ? '+' : ''}${s} %`;
}
