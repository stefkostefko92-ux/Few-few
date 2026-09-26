// Правила за състоянията на договора — чисти предикати, тествани без база.
//
// Договорът движи пари и законови посещения, затова преходите не са свободни:
// „изтекъл" не се съживява в „активен" без ново разглеждане, а прекратен
// договор е финален.

export const STATI_CONTRATTO = [
  "BOZZA",
  "ATTIVO",
  "SOSPESO",
  "SCADUTO",
  "DISDETTO",
] as const;
export type StatoContratto = (typeof STATI_CONTRATTO)[number];

export const TRANSIZIONI_CONTRATTO: Record<
  StatoContratto,
  readonly StatoContratto[]
> = {
  BOZZA: ["ATTIVO", "DISDETTO"],
  ATTIVO: ["SOSPESO", "SCADUTO", "DISDETTO"],
  // Спрян договор се връща в работа или се прекратява; не изтича директно —
  // изтичането минава през автоматизма, който гледа само активните.
  SOSPESO: ["ATTIVO", "DISDETTO"],
  // Изтеклият може да се поднови ръчно (нов срок → отново активен).
  SCADUTO: ["ATTIVO", "DISDETTO"],
  DISDETTO: [], // финално — прекратеното не се съживява
};

export function transizioneContrattoAmmessa(
  da: StatoContratto,
  a: StatoContratto,
): boolean {
  return TRANSIZIONI_CONTRATTO[da].includes(a);
}

/**
 * Само неактивен договор се променя свободно.
 *
 * Активният вече е родил ордини и фактури; смяната на canone или на
 * периодичността под тях прави издадените документи необясними.
 */
export function contrattoModificabile(stato: string): boolean {
  return stato === "BOZZA" || stato === "SOSPESO";
}

/** Договор с история не се трие — прекратява се. */
export function contrattoEliminabile(
  stato: string,
  documenti: number,
): boolean {
  return stato === "BOZZA" && documenti === 0;
}
