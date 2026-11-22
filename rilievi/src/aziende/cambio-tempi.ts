import type { CambioEsito } from '@prisma/client';
import { mezzanotteRoma } from '../master/tempo.js';
import { businessDay, DAY } from '../time.js';

/**
 * Сроковете на смяната на доставчика (Data Act, чл. 25; собственикът, 12 ноември 2026), без база.
 * Преходът е 30 календарни дни: услугата продължава изцяло през целия 30-и ден след искането (по Рим) и
 * свършва в полунощ след него. Клиентът може веднъж да го удължи (чл. 25(5)) с 30, 60 или 90 дни от
 * последния му ден.
 */
export const GIORNI_TRANSIZIONE = 30;

/**
 * Колко дни деактивираната фирма пази всичко преди окончателното изтриване (чл. 17.3 на условията) —
 * през тях ADMIN-ът ѝ влиза само за износа (auth/memberships.ts); изтриването — aziende/eliminazione.ts.
 */
export const GIORNI_PRIMA_DELL_ELIMINAZIONE = 90;
export const PROROGHE = [30, 60, 90] as const;
export type Proroga = (typeof PROROGHE)[number];

export const ESITI = [
  'ALTRO_FORNITORE',
  'INFRASTRUTTURA_PROPRIA',
  'CANCELLAZIONE',
] as const satisfies readonly CambioEsito[];

export const isEsito = (value: unknown): value is CambioEsito =>
  typeof value === 'string' && (ESITI as readonly string[]).includes(value);

export const isProroga = (value: unknown): value is Proroga =>
  typeof value === 'number' && (PROROGHE as readonly number[]).includes(value);

/** Краят на прехода за искане в момента `richiestoAt`. */
export const fineTransizione = (richiestoAt: Date): Date =>
  mezzanotteRoma(businessDay(richiestoAt), GIORNI_TRANSIZIONE + 1);

/** Новият край след удължаване с `giorni` от последния ден на прехода. */
export const fineProroga = (fine: Date, giorni: Proroga): Date =>
  mezzanotteRoma(businessDay(new Date(fine.getTime() - 1)), giorni + 1);

export type StatoCambio = 'nessuno' | 'in_corso' | 'concluso';

export function statoCambio(azienda: { cambioFineAt: Date | null }, now: Date): StatoCambio {
  if (!azienda.cambioFineAt) return 'nessuno';
  return azienda.cambioFineAt > now ? 'in_corso' : 'concluso';
}

/** Цели дни до края (последният ден брои като 1) — за лентата в портала. */
export const giorniAllaFine = (fine: Date, now: Date): number =>
  Math.max(0, Math.ceil((fine.getTime() - now.getTime()) / DAY));
