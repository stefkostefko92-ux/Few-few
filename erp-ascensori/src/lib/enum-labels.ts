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

/** Законовата проверка на асансьор се казва „verifica periodica" (чл. 13
 *  D.P.R. 162/1999), не „revisione" — последното е автомобилната дума и издава
 *  превод вместо роден софтуер. Ключовете остават предишните, за да не се пипат
 *  вече записаните данни; сменя се само това, което вижда потребителят. */
export const TIPO_SCADENZA: Record<string, string> = {
  revisione: "Verifica periodica",
  certificazione: "Certificazione",
  manutenzione: "Manutenzione programmata",
};

/** Действията в регистъра на операциите. Дотогава излизаха суровите английски
 *  константи (CREATE, STATE_CHANGE) в изцяло италиански продукт. */
export const AZIONE_AUDIT: Record<string, string> = {
  CREATE: "Creazione",
  UPDATE: "Modifica",
  DELETE: "Eliminazione",
  LOGIN: "Accesso",
  LOGOUT: "Uscita",
  STATE_CHANGE: "Cambio di stato",
  IMPORT: "Importazione",
};

/** Статусите, показани извън баджовете (падащи менюта, съобщения). */
export const STATO_LABEL: Record<string, string> = {
  BOZZA: "Bozza",
  EMESSO: "Emesso",
  EMESSA: "Emessa",
  CONFERMATO: "Confermato",
  IN_LAVORO: "In lavorazione",
  SOSPESO: "Sospeso",
  COMPLETATO: "Completato",
  CHIUSO: "Chiuso",
  CONTESTATO: "Contestato",
  ANNULLATO: "Annullato",
  INVIATO: "Inviato",
  INVIATA: "Inviata",
  APPROVATO: "Approvato",
  RIFIUTATO: "Rifiutato",
  SCADUTO: "Scaduto",
  SCADUTA: "Scaduta",
  PAGATA: "Pagata",
  STORNATA: "Stornata (nota di credito)",
  // StatoSdi — на италиански, с думите на самите известия.
  NON_INVIATA: "Non trasmessa",
  GENERATA: "XML generato",
  CONSEGNATA: "Consegnata",
  MANCATA_CONSEGNA: "Mancata consegna (nel cassetto fiscale)",
  SCARTATA: "Scartata dallo SdI",
  ACCETTATA: "Accettata dalla PA",
  DECORSI_TERMINI: "Decorrenza termini",
  // StatoPagamentoFattura
  NON_PAGATA: "Non pagata",
  PARZIALE: "Parzialmente pagata",
  ATTIVO: "Attivo",
  FERMO: "Fermo",
  MANUTENZIONE: "In manutenzione",
  FUORI_SERVIZIO: "Fuori servizio",
  DISMESSO: "Dismesso",
  DISDETTO: "Disdetto",
  ORDINARIA: "Ordinaria",
  URGENTE: "Urgente",
  EMERGENZA: "Emergenza",
};

export const STATO_AUTOMEZZO: Record<string, string> = {
  verde: "In regola",
  giallo: "In scadenza",
  rosso: "Scaduto",
};

export function etichetta(mappa: Record<string, string>, v: string): string {
  return mappa[v] ?? v;
}
