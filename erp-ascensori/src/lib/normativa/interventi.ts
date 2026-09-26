// Видовете намеса и италианските им етикети.
//
// Не е козметика: от вида зависи какво е ЗАДЪЛЖИТЕЛНО да бъде проверено
// (шестмесечната по чл. 15, ал. 4 иска целия списък), кое влиза във времената
// за отзив и кое се фактурира по договора, а кое отделно.

export const TIPI_INTERVENTO = [
  "MANUTENZIONE_ORDINARIA",
  "VERIFICA_SEMESTRALE",
  "RIPARAZIONE",
  "EMERGENZA",
  "SOCCORSO",
  "SOSTITUZIONE_COMPONENTI",
] as const;
export type TipoIntervento = (typeof TIPI_INTERVENTO)[number];

export const TIPO_INTERVENTO_LABEL: Record<TipoIntervento, string> = {
  MANUTENZIONE_ORDINARIA: "Manutenzione ordinaria",
  VERIFICA_SEMESTRALE: "Verifica semestrale (art. 15 c.4)",
  RIPARAZIONE: "Riparazione",
  EMERGENZA: "Emergenza",
  SOCCORSO: "Soccorso — liberazione persone",
  SOSTITUZIONE_COMPONENTI: "Sostituzione componenti",
};

/**
 * Намесите, при които се брои времето за отзив.
 *
 * Освобождаването на блокирани хора не е „поддръжка": то се мери в минути, а
 * смесването му със средното време по всички визити прави показателя безсмислен.
 */
export function contaPerTempiDiRisposta(t: string): boolean {
  return t === "SOCCORSO" || t === "EMERGENZA";
}

/** Иска ли този вид намеса пълния списък проверки по чл. 15, ал. 4. */
export function richiedeControlliCompleti(t: string): boolean {
  return t === "VERIFICA_SEMESTRALE";
}
