import { z } from 'zod';
import { steamId64 } from '../steamid.js';
import { MAX_DURATION_MS } from './rbac.js';

/**
 * Входът на формите и адресите на панела — всичко през zod. Масив вместо стойност
 * (`?q=a&q=b`) → първата; празно поле → липсва.
 */
export const first = (value: unknown) => (Array.isArray(value) ? value[0] : value);
const blankToUndefined = (value: unknown) => {
  const one = first(value);
  return typeof one === 'string' && one.trim() === '' ? undefined : one;
};

export const optionalString = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
export const requiredString = (max: number) =>
  z.preprocess(first, z.string().trim().min(1).max(max));
export const optionalInt = (min: number, max: number) =>
  z.preprocess(blankToUndefined, z.coerce.number().int().min(min).max(max).optional());
export const requiredInt = (min: number, max: number) =>
  z.preprocess(first, z.coerce.number().int().min(min).max(max));
export const formSteamId = z.preprocess((value) => {
  const one = first(value);
  return typeof one === 'string' ? one.trim() : one;
}, steamId64);
export const checkbox = z.preprocess((value) => first(value) === 'on', z.boolean());

/** Номер на страница от адреса; невалиден → 1. */
export const pageParam = z.preprocess(first, z.coerce.number().int().min(1).max(100_000)).catch(1);

export const DURATION_UNITS = ['m', 'h', 'd'] as const;
const UNIT_MS: Record<(typeof DURATION_UNITS)[number], number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Срок от формата: число + единица, или „завинаги“ (празно число). */
export const durationFields = z.object({
  amount: optionalInt(1, 100_000),
  unit: z.preprocess(first, z.enum(DURATION_UNITS)).catch('d'),
});

/** null = завинаги; undefined = над тавана от 10 години (невалидно). */
export function durationMs(input: z.infer<typeof durationFields>): number | null | undefined {
  if (input.amount === undefined) return null;
  const ms = input.amount * UNIT_MS[input.unit];
  return ms > MAX_DURATION_MS ? undefined : ms;
}

/**
 * Цена в евро от формата („12,50“ / „12.50“ / „12“) → цели евроцентове. Без float: числото се
 * разглобява като низ (cs2dm: пари само в цели евроцентове — `vip_tiers.price_cents`).
 */
export function euroToCents(input: string): number | null {
  const match = /^(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  const whole = Number.parseInt(match[1]!, 10);
  const fraction = Number.parseInt((match[2] ?? '0').padEnd(2, '0'), 10);
  return whole * 100 + fraction;
}

/** Обратното — за полето във формата за редакция (без локален формат, точно десетично). */
export function centsToInput(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/**
 * Резултатът след POST → пренасочване (PRG) с `?r=<код>` от затворен списък: в адреса никога не
 * влиза свободен текст. Кодът → ключ `admin.result.<код>` и вид на съобщението.
 */
export const RESULTS = {
  saved: 'ok',
  sent: 'ok',
  recordedNoAck: 'warn',
  invalid: 'error',
  denied: 'error',
  immune: 'error',
  notFound: 'error',
  notActive: 'error',
  inUse: 'error',
  duplicate: 'error',
  cmdTimeout: 'error',
  cmdNoListener: 'error',
  cmdRedis: 'error',
  cmdUnavailable: 'error',
  cmdBusy: 'error',
  cmdNotOnline: 'error',
  cmdNotActive: 'error',
  cmdUnknownMode: 'error',
  cmdFailed: 'error',
  cmdPending: 'warn',
  badCode: 'error',
} as const;
export type ResultCode = keyof typeof RESULTS;

export const resultParam = z
  .preprocess(first, z.enum(Object.keys(RESULTS) as [ResultCode, ...ResultCode[]]).optional())
  .catch(undefined);

/** Отказ на команда (`admin.cmd.*` ключ) → код на резултата. */
export function commandResultCode(errorKey: string): ResultCode {
  const map: Record<string, ResultCode> = {
    timeout: 'cmdTimeout',
    noListener: 'cmdNoListener',
    redis: 'cmdRedis',
    unavailable: 'cmdUnavailable',
    busy: 'cmdBusy',
    notOnline: 'cmdNotOnline',
    notActive: 'cmdNotActive',
    unknownMode: 'cmdUnknownMode',
  };
  return map[errorKey] ?? 'cmdFailed';
}
