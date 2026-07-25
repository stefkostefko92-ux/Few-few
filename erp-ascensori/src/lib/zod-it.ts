// Италиански съобщения за Zod (дефолтите са на английски) — целият UI е IT.
import { z } from "zod";

export const erroreMapIt: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === "undefined" || issue.received === "null")
        return { message: "Campo obbligatorio" };
      return { message: "Valore non valido" };
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === "email") return { message: "Indirizzo e-mail non valido" };
      if (issue.validation === "uuid") return { message: "Identificativo non valido" };
      return { message: "Formato non valido" };
    case z.ZodIssueCode.too_small:
      if (issue.type === "string")
        return issue.minimum === 1
          ? { message: "Campo obbligatorio" }
          : { message: `Minimo ${issue.minimum} caratteri` };
      if (issue.type === "number") return { message: `Valore minimo: ${issue.minimum}` };
      if (issue.type === "array") return { message: "Elenco vuoto" };
      return { message: "Valore troppo piccolo" };
    case z.ZodIssueCode.too_big:
      if (issue.type === "string") return { message: `Massimo ${issue.maximum} caratteri` };
      if (issue.type === "number") return { message: `Valore massimo: ${issue.maximum}` };
      return { message: "Valore troppo grande" };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: "Valore non ammesso" };
    default:
      return { message: ctx.defaultError === "Invalid input" ? "Valore non valido" : ctx.defaultError };
  }
};

z.setErrorMap(erroreMapIt);

/** Италиански етикети на вътрешните имена на полета (за съобщенията за грешка). */
export const ETICHETTE_CAMPI: Record<string, string> = {
  nome: "Nome",
  cognome: "Cognome",
  ragioneSociale: "Ragione sociale",
  partitaIva: "Partita IVA",
  codiceFiscale: "Codice fiscale",
  pec: "PEC",
  email: "E-mail",
  telefono: "Telefono",
  indirizzo: "Indirizzo",
  citta: "Città",
  cap: "CAP",
  provincia: "Provincia",
  unitaImmobiliari: "Unità immobiliari",
  matricola: "Matricola",
  marca: "Marca",
  modello: "Modello",
  anno: "Anno",
  portata: "Portata",
  fermate: "Fermate",
  stato: "Stato",
  piano: "Piano",
  targa: "Targa",
  chilometraggio: "Chilometraggio",
  codice: "Codice",
  barcode: "Barcode",
  descrizione: "Descrizione",
  categoria: "Categoria",
  ubicazione: "Ubicazione",
  quantita: "Quantità",
  sogliaMinima: "Soglia minima",
  prezzoAcquisto: "Prezzo di acquisto",
  prezzoVendita: "Prezzo di vendita",
  aliquotaIva: "Aliquota IVA",
  prezzoUnitario: "Prezzo unitario",
  oggetto: "Oggetto",
  validitaGiorni: "Validità (giorni)",
  priorita: "Priorità",
  dataScadenza: "Data di scadenza",
  dataInizio: "Data di inizio",
  dataFine: "Data di fine",
  password: "Password",
  ruolo: "Ruolo",
  titolo: "Titolo",
  causale: "Causale",
  destinatario: "Destinatario",
  vettore: "Vettore",
  capocantiere: "Capocantiere",
  note: "Note",
  nota: "Nota",
  tipo: "Tipo",
  data: "Data",
  slug: "Slug",
  peso: "Peso",
  um: "Unità di misura",
};
