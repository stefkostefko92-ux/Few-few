// Класификацията на уредбата и италианските ѝ етикети.
//
// Отделно от `verifiche.ts`, защото това са ДАННИ (кой вид, кой режим), а там
// стоят ПРАВИЛА. Държат се на едно място, за да не се разминат падащото меню,
// схемата за валидация и печатният документ.

export const TIPI_IMPIANTO = [
  "ASCENSORE",
  "MONTACARICHI",
  "PIATTAFORMA_ELEVATRICE",
  "MONTASCALE",
  "SCALA_MOBILE",
  "MONTAVIVANDE",
] as const;
export type TipoImpianto = (typeof TIPI_IMPIANTO)[number];

export const TIPO_IMPIANTO_LABEL: Record<TipoImpianto, string> = {
  ASCENSORE: "Ascensore",
  MONTACARICHI: "Montacarichi",
  PIATTAFORMA_ELEVATRICE: "Piattaforma elevatrice",
  MONTASCALE: "Montascale",
  SCALA_MOBILE: "Scala mobile",
  MONTAVIVANDE: "Montavivande",
};

export const REGIMI_IMPIANTO = [
  "PREESISTENTE",
  "DIRETTIVA_95_16",
  "DIRETTIVA_2014_33",
] as const;
export type RegimeImpianto = (typeof REGIMI_IMPIANTO)[number];

/**
 * Етикетите носят и правното основание.
 *
 * Операторът не бива да гадае какво значи „PREESISTENTE“: от режима зависи коя
 * нормативна уредба важи за уредбата и какво изобщо се иска от нея.
 */
export const REGIME_IMPIANTO_LABEL: Record<RegimeImpianto, string> = {
  PREESISTENTE: "Preesistente (messo in esercizio prima del D.P.R. 162/1999)",
  DIRETTIVA_95_16: "Direttiva 95/16/CE (D.P.R. 162/1999)",
  DIRETTIVA_2014_33: "Direttiva 2014/33/UE",
};

export const STATO_IMPIANTO_LABEL: Record<string, string> = {
  ATTIVO: "In servizio",
  FERMO: "Fermo (guasto)",
  MANUTENZIONE: "In manutenzione",
  FUORI_SERVIZIO: "Fuori servizio",
  // Не е „спрян“ като останалите: спрян е ПО ЗАКОН и не се пуска от нас.
  FERMO_AMMINISTRATIVO: "Fermo amministrativo (verifica negativa)",
  DISMESSO: "Dismesso",
};
