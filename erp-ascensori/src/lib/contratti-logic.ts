// Периодичността на договорите — ЧИСТА логика, без база.
//
// Тук се смята кога пада следващото посещение и следващата фактура. Грешка в
// тази аритметика значи или пропуснато законово посещение, или нефактуриран
// период — затова живее отделно от маршрутите и се тества самостоятелно.

export const PERIODICITA = [
  "MENSILE",
  "BIMESTRALE",
  "TRIMESTRALE",
  "QUADRIMESTRALE",
  "SEMESTRALE",
  "ANNUALE",
] as const;

export type Periodicita = (typeof PERIODICITA)[number];

/** Колко месеца е един период. */
export const MESI_PERIODO: Record<Periodicita, number> = {
  MENSILE: 1,
  BIMESTRALE: 2,
  TRIMESTRALE: 3,
  QUADRIMESTRALE: 4,
  SEMESTRALE: 6,
  ANNUALE: 12,
};

/** Италиански етикети за интерфейса. */
export const PERIODICITA_LABEL: Record<Periodicita, string> = {
  MENSILE: "Mensile",
  BIMESTRALE: "Bimestrale",
  TRIMESTRALE: "Trimestrale",
  QUADRIMESTRALE: "Quadrimestrale",
  SEMESTRALE: "Semestrale",
  ANNUALE: "Annuale",
};

/**
 * Добавя месеци, БЕЗ да прескача месец.
 *
 * `setMonth(+1)` върху 31 януари дава 3 март, защото февруари няма 31-во число.
 * За договор, чието начало е в края на месеца, това би изместило целия график
 * напред с дни всеки период. Тук денят се прищипва към последния ден на
 * целевия месец: 31.01 + 1 месец = 28.02 (или 29-и във високосна).
 */
export function aggiungiMesi(base: Date, mesi: number): Date {
  const giorno = base.getUTCDate();
  const d = new Date(
    Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth() + mesi,
      1,
      base.getUTCHours(),
      base.getUTCMinutes(),
      base.getUTCSeconds(),
      base.getUTCMilliseconds(),
    ),
  );
  const ultimoDelMese = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(giorno, ultimoDelMese));
  return d;
}

/** Следващата дата по периодичност. */
export function prossimaScadenza(da: Date, periodicita: Periodicita): Date {
  return aggiungiMesi(da, MESI_PERIODO[periodicita]);
}

/**
 * Колко периода са пропуснати към дадена дата.
 *
 * Нужно е, защото автоматизмът може да е спрял: при рестарт след две седмици
 * трябва да навакса, а не да прескочи периодите. Връща 0, ако още не е дошло.
 */
export function periodiScaduti(prossima: Date, oggi: Date, periodicita: Periodicita): number {
  let n = 0;
  let d = prossima;
  // Таванът пази от безкраен цикъл при абсурдно стара дата (повредени данни).
  while (d <= oggi && n < 120) {
    n += 1;
    d = prossimaScadenza(d, periodicita);
  }
  return n;
}

/** Изтекъл ли е договорът към дадена дата. */
export function eScaduto(dataFine: Date, oggi: Date): boolean {
  return dataFine < oggi;
}

/**
 * Новият край при мълчаливо подновяване — със същата продължителност.
 *
 * Договор 01.01.2026–31.12.2026 с автоматично подновяване става
 * 01.01.2027–31.12.2027, а не „още една година от днес": иначе всяко
 * подновяване измества годишнината и фактурирането се разминава с договора.
 */
export function rinnovo(
  dataInizio: Date,
  dataFine: Date,
): { dataInizio: Date; dataFine: Date } {
  // Продължителността се мери до ДЕНЯ СЛЕД края: 01.01–31.12 е дванайсет месеца,
  // не единайсет. Мерено до самия край, всяко подновяване би скъсявало договора
  // с един месец — грешка, която се вижда чак на третата година.
  const durata = mesiTra(dataInizio, giornoDopo(dataFine));
  const nuovoInizio = giornoDopo(dataFine);
  return {
    dataInizio: nuovoInizio,
    dataFine: giornoPrima(aggiungiMesi(nuovoInizio, durata)),
  };
}

const GIORNO_MS = 86_400_000;
const giornoDopo = (d: Date) => new Date(d.getTime() + GIORNO_MS);
const giornoPrima = (d: Date) => new Date(d.getTime() - GIORNO_MS);

/** Цели месеци между две дати (поне 1). */
export function mesiTra(da: Date, a: Date): number {
  const m =
    (a.getUTCFullYear() - da.getUTCFullYear()) * 12 + (a.getUTCMonth() - da.getUTCMonth());
  return Math.max(1, a.getUTCDate() >= da.getUTCDate() ? m : m - 1);
}

/** Дали трябва да се предупреди за наближаващо подновяване/изтичане. */
export function inPreavviso(dataFine: Date, preavvisoMesi: number, oggi: Date): boolean {
  const soglia = aggiungiMesi(dataFine, -preavvisoMesi);
  return oggi >= soglia && oggi <= dataFine;
}

/**
 * Описание на фактурирания период — влиза в предмета на фактурата.
 *
 * Клиентът трябва да вижда ЗА КОЙ период плаща; „Canone di manutenzione" без
 * период е първата причина за оспорена фактура.
 */
export function descrizionePeriodo(inizio: Date, periodicita: Periodicita): string {
  const fine = new Date(prossimaScadenza(inizio, periodicita).getTime() - 86_400_000);
  const f = (d: Date) =>
    `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  return `${f(inizio)} – ${f(fine)}`;
}
