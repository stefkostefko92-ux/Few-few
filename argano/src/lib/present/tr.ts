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

export function makeFmt(intlLocale: string): Fmt {
  const formats = new Map<number, Intl.NumberFormat>();
  return (x, dec = 2) => {
    if (x === Infinity) return '∞';
    if (x == null || !Number.isFinite(x)) return '—';
    let f = formats.get(dec);
    if (!f) {
      f = new Intl.NumberFormat(intlLocale, { minimumFractionDigits: dec, maximumFractionDigits: dec });
      formats.set(dec, f);
    }
    return f.format(x);
  };
}

export const makePres = (dict: CalcDict, intlLocale: string): Pres => ({ t: makeTr(dict), fmt: makeFmt(intlLocale), intlLocale });
