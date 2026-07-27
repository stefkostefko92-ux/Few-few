// Подпис и повторни опити при доставка на webhook.
//
// Чист модул: получателят трябва да може да ПРОВЕРИ, че известието идва от нас
// и че не е презаписано — иначе всеки, който познава адреса му, може да му
// подхвърли „фактурата е платена".

import { createHmac, timingSafeEqual } from "node:crypto";

/** Заглавията, които носи всяка доставка. */
export const HEADER_FIRMA = "x-erp-signature";
export const HEADER_TIMESTAMP = "x-erp-timestamp";
export const HEADER_EVENTO = "x-erp-event";
export const HEADER_CONSEGNA = "x-erp-delivery";

/** Извън този прозорец доставката се отхвърля като преиграна. */
export const TOLLERANZA_SECONDI = 300;

/**
 * Подписът.
 *
 * Времевата отметка влиза В ПОДПИСАНИЯ низ, не само в заглавие: иначе
 * нападателят презаписва старо, валидно подписано известие с нова отметка и
 * получателят го приема отново („фактурата е платена" — два пъти).
 */
export function firmaCorpo(
  corpo: string,
  segreto: string,
  timestamp: number,
): string {
  return createHmac("sha256", segreto)
    .update(`${timestamp}.${corpo}`)
    .digest("hex");
}

export type EsitoVerifica =
  | { valida: true }
  | { valida: false; motivo: "firma" | "timestamp" };

/** Проверката, която ПОЛУЧАТЕЛЯТ прави. Публикувана е и в документацията. */
export function verificaFirma(
  corpo: string,
  segreto: string,
  firma: string,
  timestamp: number,
  ora = Math.floor(Date.now() / 1000),
): EsitoVerifica {
  if (Math.abs(ora - timestamp) > TOLLERANZA_SECONDI)
    return { valida: false, motivo: "timestamp" };
  const atteso = firmaCorpo(corpo, segreto, timestamp);
  const a = Buffer.from(atteso);
  const b = Buffer.from(firma);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    return { valida: false, motivo: "firma" };
  return { valida: true };
}

/** Събитията, за които може да се абонира външна система. */
export const EVENTI = [
  "ordine.creato",
  "ordine.stato_cambiato",
  "fattura.emessa",
  "fattura.pagata",
  // Отхвърлена от SDI: получателят има 5 дни да я поправи и преподаде със
  // същия номер. Външното счетоводство трябва да го научи веднага, не при
  // месечната сверка.
  "fattura.scartata",
  "fattura.consegnata",
  "contratto.attivato",
  "scadenza.imminente",
] as const;
export type Evento = (typeof EVENTI)[number];

export function eventiValidi(eventi: string[]): boolean {
  return (
    eventi.length > 0 &&
    eventi.every((e) => (EVENTI as readonly string[]).includes(e))
  );
}

/** След толкова поредни неуспеха абонаментът се спира сам. */
export const MAX_TENTATIVI = 8;
/** Мъртъв получател не бива да се чука вечно — това е DoS срещу самите нас. */
export const MAX_FALLIMENTI_WEBHOOK = 20;

/**
 * Кога е следващият опит.
 *
 * Експоненциално със ТАВАН и с разсейване: без тавана осмият опит е след дни;
 * без разсейването хиляда доставки, паднали заедно (получателят е бил долу),
 * тръгват отново в една и съща секунда и го събарят повторно.
 */
export function prossimoTentativo(
  tentativi: number,
  ora = Date.now(),
  casuale = Math.random(),
): Date {
  const base = Math.min(2 ** tentativi, 3600) * 1000;
  const jitter = base * 0.2 * casuale;
  return new Date(ora + base + jitter);
}

/** Успех ли е този HTTP статус за доставка. */
export function consegnaRiuscita(stato: number): boolean {
  return stato >= 200 && stato < 300;
}

/**
 * Има ли смисъл да опитваме пак.
 *
 * 4xx (освен 408 и 429) значи „получателят не иска това" — повтарянето е шум за
 * двете страни. 5xx и мрежовата грешка са преходни.
 */
export function vaRiprovato(stato: number | null, tentativi: number): boolean {
  if (tentativi >= MAX_TENTATIVI) return false;
  if (stato === null) return true; // мрежова грешка
  if (consegnaRiuscita(stato)) return false;
  if (stato === 408 || stato === 429) return true;
  return stato >= 500;
}
