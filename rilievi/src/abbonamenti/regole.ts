import type { Capability } from '../auth/roles.js';
import { mezzanotteRoma } from '../master/tempo.js';
import { businessDay } from '../time.js';

/**
 * Абонаментът на фирмата (#31, #33 — собственикът, 12 ноември 2026: „При регистрация на нова фирма тя получава
 * автоматично 1 месец пробен период безплатно“; „При изтичане на Premium цялата Azienda може само и единствено да
 * чете“; нивата — „1-10, 5-25, 25+“, разбрани като до 10, до 25 и над 25 души). Правилата без база: датите по
 * календара на Рим, състоянието, таванът на хората и какво остава на фирма само за четене.
 */

/** Нивата по брой хора във фирмата; null — без таван. */
export const LIVELLI: Readonly<Record<1 | 2 | 3, number | null>> = { 1: 10, 2: 25, 3: null };
export type Livello = keyof typeof LIVELLI;
export const isLivello = (v: unknown): v is Livello => v === 1 || v === 2 || v === 3;

/** Таванът на хората за нивото; без ниво — без таван; непознато (ръчна промяна) — най-малкият, не „без таван“. */
export function maxPersone(livello: number | null): number | null {
  if (livello === null) return null;
  return isLivello(livello) ? LIVELLI[livello] : LIVELLI[1];
}

/** Безплатният пробен период на нова фирма — в месеци. */
export const MESI_PROVA = 1;

/** `YYYY-MM-DD` + n месеца по календара; по-късият месец взима последния си ден (31 януари + 1 → 28 февруари). */
export function aggiungiMesi(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const indice = y * 12 + (m - 1) + n;
  const anno = Math.floor(indice / 12);
  const mese = (indice % 12) + 1;
  const ultimo = new Date(Date.UTC(anno, mese, 0)).getUTCDate();
  const giorno = Math.min(d, ultimo);
  return `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`;
}

/**
 * Краят на период от `mesi` месеца: от досегашния край, ако още е напред, иначе от сега. Краят е винаги полунощ
 * в Рим: започнат посред деня период покрива и целия последен ден (12 ноември 11:00 + 1 месец → полунощ срещу
 * 13 декември), а започнат в полунощ свършва в полунощ същия ден на месеца.
 */
export function scadenzaDopoMesi(attuale: Date | null, mesi: number, now: Date): Date {
  const base = attuale && attuale.getTime() > now.getTime() ? attuale : now;
  const giorno = businessDay(base);
  const aMezzanotte = mezzanotteRoma(giorno).getTime() === base.getTime();
  return mezzanotteRoma(aggiungiMesi(giorno, mesi), aMezzanotte ? 0 : 1);
}

export interface CampiAbbonamento {
  abbonamentoFino: Date | null;
  abbonamentoProva: boolean;
  abbonamentoLivello: number | null;
}

export type TipoAbbonamento = 'illimitato' | 'prova' | 'attivo' | 'scaduto';

export interface StatoAbbonamento {
  tipo: TipoAbbonamento;
  fino: Date | null;
  livello: number | null;
  maxPersone: number | null;
  solaLettura: boolean;
}

/**
 * Без срок (фирмите отпреди абонаментите — докато собственикът реши) — без таван; пробният месец — без таван
 * на хората; платеният — по нивото; изтеклият (и пробният) — само четене.
 */
export function statoAbbonamento(a: CampiAbbonamento, now: Date): StatoAbbonamento {
  if (a.abbonamentoFino === null) {
    return {
      tipo: 'illimitato',
      fino: null,
      livello: a.abbonamentoLivello,
      maxPersone: maxPersone(a.abbonamentoLivello),
      solaLettura: false,
    };
  }
  const scaduto = a.abbonamentoFino.getTime() <= now.getTime();
  return {
    tipo: scaduto ? 'scaduto' : a.abbonamentoProva ? 'prova' : 'attivo',
    fino: a.abbonamentoFino,
    livello: a.abbonamentoLivello,
    maxPersone: a.abbonamentoProva && !scaduto ? null : maxPersone(a.abbonamentoLivello),
    solaLettura: scaduto,
  };
}

/**
 * Какво остава на фирма само за четене (чл. 12.5 на условията 2026-11-12): четенето на картите, документите,
 * офертите и регистъра; изтриването на данни (чл. A.8 — изтриването остава в портала); управлението на хората —
 * за да се деактивират тези, които вече не са упълномощени (чл. 4.1). Нови хора (покани) — не
 * (services/invites.ts). Износът и смяната на доставчика имат своя проверка по роля.
 */
export const CAPACITA_IN_SOLA_LETTURA: ReadonlySet<Capability> = new Set<Capability>([
  'schede:read',
  'interventi:read',
  'preventivi:read',
  'audit:view',
  'schede:delete',
  'schede:trash',
  'users:manage',
]);
