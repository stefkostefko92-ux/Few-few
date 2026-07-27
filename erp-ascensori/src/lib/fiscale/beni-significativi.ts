// „Значимите блага" — D.M. 29 декември 1999 г. + чл. 1, ал. 19 от закон 205/2017.
//
// Защо това е точно нашият случай: списъкът на значимите блага е ЗАТВОРЕН и
// **асансьорите и подемниците са първите в него**. Тоест почти всяка по-голяма
// поддръжка на жилищна сграда минава през това правило.
//
// Правилото. При работи по обикновена поддръжка на жилищна сграда ставката е
// 10 % (т. 127-terdecies от таблица А, част III към D.P.R. 633/1972). Но когато
// доставката включва значимо благо, намалената ставка важи за него САМО до
// стойността на престацията — тоест до останалата част от работата. Горницата
// се облага с обикновената ставка.
//
//   агevolato = престация + min(благо, престация)
//   обикновена ставка върху = max(0, благо − престация)
//
// Числово: асансьор за 8 000 € с монтаж и труд за 3 000 € (общо 11 000 €) →
// 10 % върху 3 000 + 3 000 = 6 000 €, а 22 % върху останалите 5 000 €. Всичко
// на 10 % е недобор от ДДС за 600 €, който при проверка се дължи с лихви и
// санкция.
//
// И втора част от същия закон, също задължителна: стойността на значимото
// благо и на престацията трябва да са ИЗРИЧНО посочени във фактурата. Без тази
// разбивка намалената ставка изобщо не се признава — затова разцепването тук
// винаги ражда описания, а не само числа.
//
// Модулът е чист: вход центесими, изход центесими. Нула Prisma, нула Decimal.

import { toCents, fromCents, totaleVoce, type VoceInput } from "@/lib/totals";

/** Намалената ставка за поддръжка на жилищна сграда, в стотни от процента. */
export const ALIQUOTA_AGEVOLATA = 1000; // 10,00 %
/** Обикновената ставка. */
export const ALIQUOTA_ORDINARIA = 2200; // 22,00 %

export interface RipartizioneBeni {
  /** Труд и незначими материали — тя определя тавана на облекчението. */
  prestazione: number;
  /** Стойността на значимото благо, както е фактурирана. */
  beneSignificativo: number;
  /** Облагаема основа с намалената ставка. */
  imponibileAgevolato: number;
  /** Облагаема основа с обикновената ставка (горницата над престацията). */
  imponibileOrdinario: number;
  /** Има ли изобщо горница — оттук UI-ят решава дали да покаже обяснение. */
  eccedenza: boolean;
}

/**
 * Разцепва основата по правилото за значимите блага.
 *
 * Числата са в центесими. Функцията НЕ решава кое е значимо благо — това е
 * фактическо решение на фирмата и стои като отметка на реда.
 */
export function ripartizioneBeniSignificativi(
  prestazione: number,
  beneSignificativo: number,
): RipartizioneBeni {
  const p = Math.max(0, Math.round(prestazione));
  const b = Math.max(0, Math.round(beneSignificativo));
  // Таванът на облекчението е самата престация: благото влиза с намалената
  // ставка най-много колкото струва останалата работа.
  const agevolatoBene = Math.min(b, p);
  return {
    prestazione: p,
    beneSignificativo: b,
    imponibileAgevolato: p + agevolatoBene,
    imponibileOrdinario: b - agevolatoBene,
    eccedenza: b > p,
  };
}

export interface VoceConFlag extends VoceInput {
  descrizione: string;
  beneSignificativo?: boolean | null;
}

/** Сумите на двете групи редове, готови за разцепването. */
export function baseImponibili(voci: VoceConFlag[]): {
  prestazione: number;
  beneSignificativo: number;
} {
  let prestazione = 0;
  let bene = 0;
  for (const v of voci) {
    const t = totaleVoce(v);
    if (v.beneSignificativo) bene += t;
    else prestazione += t;
  }
  return { prestazione, beneSignificativo: bene };
}

export interface RigaRipartita {
  descrizione: string;
  quantita: string;
  prezzoUnitario: string;
  aliquotaIva: string;
  beneSignificativo: boolean;
}

/**
 * Редовете, каквито трябва да излязат във фактурата.
 *
 * Връща ТРИ реда, не числа: законът иска разбивката да се вижда в самия
 * документ. Първият носи престацията, вторият — частта от благото с намалена
 * ставка, третият (само ако има горница) — остатъка с обикновената.
 *
 * Описанията са на италиански и цитират правното основание: администраторът,
 * който получава фактурата, трябва да може да я обясни на своя счетоводител.
 */
export function righeRipartite(voci: VoceConFlag[]): RigaRipartita[] {
  const basi = baseImponibili(voci);
  const r = ripartizioneBeniSignificativi(
    basi.prestazione,
    basi.beneSignificativo,
  );
  const righe: RigaRipartita[] = [];

  if (r.prestazione > 0)
    righe.push({
      descrizione: "Prestazione (manodopera e materiali non significativi)",
      quantita: "1.00",
      prezzoUnitario: fromCents(r.prestazione),
      aliquotaIva: fromCents(ALIQUOTA_AGEVOLATA),
      beneSignificativo: false,
    });

  const beneAgevolato = r.imponibileAgevolato - r.prestazione;
  if (beneAgevolato > 0)
    righe.push({
      descrizione:
        "Bene significativo (ascensore/montacarichi) — quota agevolata nel limite del valore della prestazione, art. 7 c.1 lett. b) L. 488/1999",
      quantita: "1.00",
      prezzoUnitario: fromCents(beneAgevolato),
      aliquotaIva: fromCents(ALIQUOTA_AGEVOLATA),
      beneSignificativo: true,
    });

  if (r.imponibileOrdinario > 0)
    righe.push({
      descrizione:
        "Bene significativo — eccedenza oltre il valore della prestazione, aliquota ordinaria",
      quantita: "1.00",
      prezzoUnitario: fromCents(r.imponibileOrdinario),
      aliquotaIva: fromCents(ALIQUOTA_ORDINARIA),
      beneSignificativo: true,
    });

  return righe;
}

/**
 * Какво не е наред с редовете при включен режим — на италиански, за оператора.
 *
 * Проверката е предварителна и е по-строга от SDI: SDI приема фактурата,
 * защото формално е валидна. Грешката излиза при проверка от Agenzia delle
 * Entrate, години по-късно, заедно с лихвите.
 */
export function problemiBeniSignificativi(voci: VoceConFlag[]): string[] {
  const problemi: string[] = [];
  const basi = baseImponibili(voci);

  if (basi.beneSignificativo === 0)
    problemi.push(
      "Regime beni significativi attivo ma nessuna riga è marcata come bene significativo: la ripartizione non ha oggetto.",
    );
  if (basi.prestazione === 0 && basi.beneSignificativo > 0)
    problemi.push(
      "Solo beni significativi e nessuna prestazione: senza posa in opera non si applica l'aliquota agevolata.",
    );

  for (const v of voci) {
    const al = toCents(v.aliquotaIva);
    if (al !== ALIQUOTA_AGEVOLATA && al !== ALIQUOTA_ORDINARIA)
      problemi.push(
        `Riga «${v.descrizione}»: con il regime dei beni significativi le aliquote ammesse sono 10 % e 22 %.`,
      );
  }
  return problemi;
}
