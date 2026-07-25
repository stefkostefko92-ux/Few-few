// Единен източник на италианските етикети за enum стойностите — консистентност
// в цялото приложение (таблици, форми, детайли). Статус/приоритет остават
// главни (в баджовете), останалите enum-и се показват sentence-case.

export const TIPO_DIPENDENTE: Record<string, string> = {
  TECNICO: "Tecnico",
  AMMINISTRATIVO: "Amministrativo",
  COMMERCIALE: "Commerciale",
  MAGAZZINIERE: "Magazziniere",
};

export const TIPO_MAGAZZINO: Record<string, string> = {
  COMPONENTI: "Componenti",
  VENDITA: "Vendita",
};

export const TIPO_FATTURA: Record<string, string> = {
  EMESSA: "Emessa",
  RICEVUTA: "Ricevuta",
};

export const TIPO_COTTIMISTA: Record<string, string> = {
  DITTA_INDIVIDUALE: "Ditta individuale",
  COOPERATIVA: "Cooperativa",
  AZIENDA: "Azienda",
};

export const TIPO_AMMINISTRATORE: Record<string, string> = {
  PERSONA_FISICA: "Persona fisica",
  SOCIETA: "Società", // главните букви НЕ премахват акцента в италианския
};

export const TIPO_SCADENZA: Record<string, string> = {
  revisione: "Revisione",
  certificazione: "Certificazione",
  manutenzione: "Manutenzione",
};

export const STATO_AUTOMEZZO: Record<string, string> = {
  verde: "In regola",
  giallo: "In scadenza",
  rosso: "Scaduto",
};

export function etichetta(mappa: Record<string, string>, v: string): string {
  return mappa[v] ?? v;
}
