// Ritenuta d'acconto — чл. 25-ter от D.P.R. 600/1973.
//
// Кондоминиумът е заместник по данъка ПО ЗАКОН. Когато плаща по договор за
// изработка (а поддръжката и ремонтът на асансьор са точно това), той удържа
// 4 % от възнаграждението и ги внася на държавата ВМЕСТО изпълнителя. Тоест
// фирмата получава по-малко пари от сумата на фактурата — и това трябва да е
// написано в самия документ.
//
// Какво чупеше досега: фактурата не носеше `DatiRitenuta`, а платимото беше
// равно на брутото. Резултатът е двоен — счетоводството на кондоминиума не
// може да съгласува плащането, а нашата фирма търси пари, които никой не ѝ
// дължи. При годишния модел 770 разликата излиза наяве.
//
// Модулът е чист: центесими вход, центесими изход.

import { toCents } from "@/lib/totals";

/** Ставката по чл. 25-ter. Държи се като данни, не като литерал в кода. */
export const ALIQUOTA_RITENUTA_APPALTI = 400; // 4,00 %

/** RT01 = физическо лице · RT02 = юридическо лице. Кодировката на SDI. */
export const TIPI_RITENUTA = [
  "RT01",
  "RT02",
  "RT03",
  "RT04",
  "RT05",
  "RT06",
] as const;
export type TipoRitenuta = (typeof TIPI_RITENUTA)[number];

/**
 * Причината по кодировката на модел 770.
 *
 * „W" е точно чл. 25-ter — възнаграждения по договори за изработка. Останалите
 * са тук, защото същата фирма издава и фактури с други удържания (напр. „A" за
 * самостоятелна дейност), и защото сгрешената причина е грешка в 770-то.
 */
export const CAUSALI_RITENUTA = [
  "W",
  "A",
  "B",
  "C",
  "L",
  "M",
  "O",
  "V",
] as const;
export type CausaleRitenuta = (typeof CAUSALI_RITENUTA)[number];

export interface CalcoloRitenuta {
  /** Основата — облагаемата стойност, без ДДС. */
  imponibile: number;
  aliquota: number;
  /** Удържаното, half-up до центесим. */
  importo: number;
  /** Реално платимото: бруто минус удържаното. */
  netto: number;
}

/**
 * Смята удържаното върху дадена основа.
 *
 * Основата е ОБЛАГАЕМАТА стойност, не брутото: ДДС-то не е доход на
 * изпълнителя и не се удържа върху него. Закръглянето е половин нагоре,
 * веднъж, върху цялата основа — както при ДДС-то.
 */
export function calcolaRitenuta(
  imponibile: number,
  imposta: number,
  aliquota: number = ALIQUOTA_RITENUTA_APPALTI,
): CalcoloRitenuta {
  const base = Math.round(imponibile);
  const al = Math.round(aliquota);
  const raw = base * al;
  const importo = Math.sign(raw) * Math.round(Math.abs(raw) / 10000);
  return {
    imponibile: base,
    aliquota: al,
    importo,
    netto: base + Math.round(imposta) - importo,
  };
}

/** Ставката като низ „4.00" от Decimal/низ/число — за влизане в XML-а. */
export function aliquotaRitenuta(
  v: string | number | { toString(): string },
): number {
  return toCents(v);
}

/**
 * Дължи ли се удържане на този получател.
 *
 * Кондоминиумът е заместник по данъка по закон; администраторът, като студио,
 * НЕ е — той плаща от името на кондоминиума. Затова отговорът зависи от това
 * кой е получателят на фактурата, а не от това кой я е поръчал.
 */
export function ritenutaDovuta(destinatario: {
  condominio: boolean;
  sostitutoImposta?: boolean | null;
}): boolean {
  if (!destinatario.condominio) return false;
  // Отметката съществува заради редките кондоминиуми без данъчен номер, които
  // не могат да бъдат заместници по данъка.
  return destinatario.sostitutoImposta !== false;
}

/**
 * Какво не е наред с удържането — на италиански, за оператора.
 *
 * Най-скъпото е първото: включено удържане при получател, който не е заместник
 * по данъка, значи задържани чужди пари и невнесен данък.
 */
export function problemiRitenuta(f: {
  ritenuta: boolean;
  ritenutaTipo: string;
  ritenutaCausale: string;
  aliquota: number;
  destinatarioCondominio: boolean;
}): string[] {
  const problemi: string[] = [];
  if (!f.ritenuta) return problemi;

  if (!TIPI_RITENUTA.includes(f.ritenutaTipo as TipoRitenuta))
    problemi.push(`Ritenuta: tipo «${f.ritenutaTipo}» non valido (RT01…RT06).`);
  if (!CAUSALI_RITENUTA.includes(f.ritenutaCausale as CausaleRitenuta))
    problemi.push(
      `Ritenuta: causale «${f.ritenutaCausale}» non prevista dal modello 770.`,
    );
  if (f.aliquota <= 0 || f.aliquota > 10000)
    problemi.push("Ritenuta: aliquota fuori intervallo (0 %…100 %).");
  if (!f.destinatarioCondominio)
    problemi.push(
      "Ritenuta indicata ma il destinatario non è un condominio: l'art. 25-ter D.P.R. 600/1973 riguarda i condomìni in quanto sostituti d'imposta.",
    );
  if (f.destinatarioCondominio && f.ritenutaCausale !== "W")
    problemi.push(
      "Ritenuta verso un condominio: la causale prevista dall'art. 25-ter è «W» (contratti di appalto).",
    );
  return problemi;
}
