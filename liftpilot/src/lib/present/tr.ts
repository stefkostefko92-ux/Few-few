// Translator and number format of the calculator texts: the same `{name}` substitution as the prototype, so the
// screen, the copied summary and the report say exactly what the prototype said.
import type calcIt from '../../../messages/calc/it.json';

export type CalcKey = keyof typeof calcIt;
export type CalcDict = Readonly<Record<CalcKey, string>>;
export type Vars = Readonly<Record<string, string | number>>;
export type Tr = (key: CalcKey, vars?: Vars) => string;
export type Fmt = (x: number | null | undefined, dec?: number) => string;

/** Everything a text builder needs: translator, number format and the BCP 47 locale for dates. */
export interface Pres {
  t: Tr;
  fmt: Fmt;
  intlLocale: string;
}

export function makeTr(dict: CalcDict): Tr {
  return (key, vars) => {
    let s: string = dict[key] ?? key;
    if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, String(b));
    return s;
  };
}

// Separators written out instead of taken from the runtime's CLDR data: the server (Node) and the browser must
// print the same text or React hydration fails, and they do not agree (Node 22 with ICU 78 prints 2500 in it-IT,
// Chromium 141 prints 2.500). minGroup is CLDR's minimum grouping digits: with 2, a 4-digit number is not grouped.
const SEPARATORS: Readonly<Record<string, { dec: string; group: string; minGroup: number }>> = {
  it: { dec: ',', group: '.', minGroup: 2 },
  bg: { dec: ',', group: ' ', minGroup: 2 },
  en: { dec: '.', group: ',', minGroup: 1 },
};

export function makeFmt(intlLocale: string): Fmt {
  const sep = SEPARATORS[intlLocale.slice(0, 2)] ?? SEPARATORS.en;
  const formats = new Map<number, Intl.NumberFormat>();
  return (x, dec = 2) => {
    if (x === Infinity) return '∞';
    if (x == null || !Number.isFinite(x)) return '—';
    let f = formats.get(dec);
    if (!f) {
      // Rounding by Intl as before; only the digits are taken from it, in the ICU-independent en-US form.
      f = new Intl.NumberFormat('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: false });
      formats.set(dec, f);
    }
    // a value that rounds to zero is zero, never "-0"
    const plain = f.format(x), sign = plain.startsWith('-') && /[1-9]/.test(plain) ? '-' : '';
    const [int = '', frac] = plain.slice(sign.length).split('.');
    const grouped = int.length >= 3 + sep.minGroup ? int.replace(/\B(?=(\d{3})+$)/g, sep.group) : int;
    return `${sign}${grouped}${frac ? sep.dec + frac : ''}`;
  };
}

export const makePres = (dict: CalcDict, intlLocale: string): Pres => ({ t: makeTr(dict), fmt: makeFmt(intlLocale), intlLocale });
