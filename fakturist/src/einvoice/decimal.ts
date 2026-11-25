/**
 * Десетична аритметика без float: стойността е цяло число `v` с `s` знака след запетаята
 * (12.345 → { v: 12345n, s: 3 }). Парите никога не минават през `number` (fiscal-bg, инвариант 1).
 *
 * Закръгляне: „half up“ далеч от нулата (1.005 → 1.01, −1.005 → −1.01) — правилото на EN 16931-1:2026
 * (т. 6.5.14) и на търговската практика. Закръглява се само крайният резултат, не междинните стъпки.
 */
export interface Dec {
  readonly v: bigint;
  readonly s: number;
}

/** Най-много знаци след запетаята във вход (цени и количества); сумите са с 2. */
export const MAX_INPUT_SCALE = 6;

const DECIMAL = new RegExp(`^(-?)(\\d{1,15})(?:\\.(\\d{1,${MAX_INPUT_SCALE}}))?$`);

export function isDecimalText(text: string): boolean {
  return DECIMAL.test(text);
}

export function dec(text: string): Dec {
  const match = DECIMAL.exec(text.trim());
  if (!match) throw new Error(`Невалидно десетично число: ${JSON.stringify(text)}`);
  const [, sign, whole, fraction = ''] = match;
  const v = BigInt(`${whole}${fraction}`) * (sign === '-' ? -1n : 1n);
  return { v, s: fraction.length };
}

export const ZERO: Dec = { v: 0n, s: 0 };

export function fromCents(cents: bigint): Dec {
  return { v: cents, s: 2 };
}

function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

function align(a: Dec, b: Dec): [bigint, bigint, number] {
  const s = Math.max(a.s, b.s);
  return [a.v * pow10(s - a.s), b.v * pow10(s - b.s), s];
}

export function add(a: Dec, b: Dec): Dec {
  const [x, y, s] = align(a, b);
  return { v: x + y, s };
}

export function sub(a: Dec, b: Dec): Dec {
  const [x, y, s] = align(a, b);
  return { v: x - y, s };
}

export function neg(a: Dec): Dec {
  return { v: -a.v, s: a.s };
}

export function mul(a: Dec, b: Dec): Dec {
  return { v: a.v * b.v, s: a.s + b.s };
}

export function cmp(a: Dec, b: Dec): -1 | 0 | 1 {
  const [x, y] = align(a, b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function isZero(a: Dec): boolean {
  return a.v === 0n;
}

export function isNegative(a: Dec): boolean {
  return a.v < 0n;
}

/** Целочислено деление с закръгляне half up далеч от нулата. */
function divHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('Деление на нула');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n * 2n + d) / (d * 2n);
  return negative ? -q : q;
}

/** Закръгляне до `scale` знака. По-малък мащаб от текущия режe с закръгляне; по-голям — само допълва. */
export function round(a: Dec, scale: number): Dec {
  if (a.s <= scale) return { v: a.v * pow10(scale - a.s), s: scale };
  return { v: divHalfUp(a.v, pow10(a.s - scale)), s: scale };
}

/** a / b, закръглено до `scale` знака (половината — далеч от нулата). */
export function divRound(a: Dec, b: Dec, scale: number): Dec {
  if (b.v === 0n) throw new Error('Деление на нула');
  // a.v/10^a.s ÷ b.v/10^b.s = (a.v · 10^b.s) / (b.v · 10^a.s); резултатът × 10^scale.
  const numerator = a.v * pow10(b.s + scale);
  const denominator = b.v * pow10(a.s);
  return { v: divHalfUp(numerator, denominator), s: scale };
}

/** Процент: a × p / 100, закръглено до центове. */
export function percentOf(a: Dec, percent: Dec): Dec {
  return divRound(mul(a, percent), dec('100'), 2);
}

/** Центове от сума с най-много 2 знака (след `round(x, 2)`). */
export function toCents(a: Dec): bigint {
  if (a.s > 2) throw new Error('Сумата има повече от 2 знака след запетаята — закръгли я първо');
  return a.v * pow10(2 - a.s);
}

/** Текст с точно `scale` знака (сумите в XML: „12.30“). */
export function toFixed(a: Dec, scale: number): string {
  const r = round(a, scale);
  const negative = r.v < 0n;
  const digits = (negative ? -r.v : r.v).toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  return `${negative ? '-' : ''}${whole}${scale > 0 ? `.${fraction}` : ''}`;
}

/** Най-краткият точен запис (цени и количества: „12.5“, „3“, „0.335“). */
export function toPlain(a: Dec): string {
  let { v, s } = a;
  while (s > 0 && v % 10n === 0n) {
    v /= 10n;
    s -= 1;
  }
  return toFixed({ v, s }, s);
}

export function sum(values: readonly Dec[]): Dec {
  return values.reduce<Dec>((acc, value) => add(acc, value), ZERO);
}
