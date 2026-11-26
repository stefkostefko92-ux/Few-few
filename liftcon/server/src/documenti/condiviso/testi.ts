// Стандартните текстове по вид документ (предмет, граници) и етикетите. Границите повтарят „Limiti
// dell'incarico“ от страниците на услугите на сайта (src/content/servizi-*.mjs) — едно и също обещание.
import type { EsitoDocumento, EsitoLavoro, EsitoVoce, Priorita, StatoPrescrizione, TipoDocumento, TipoImpianto } from "./tipi.js";

export const NOMI_TIPO: Record<TipoDocumento, string> = {
  SOPRALLUOGO: "Relazione descrittiva di sopralluogo",
  CONTROLLO_QUALITA: "Rapporto di controllo qualità delle lavorazioni",
  ESAME_DOCUMENTALE: "Relazione di esame documentale",
  VERBALE: "Verbale",
};

export const PREFISSI: Record<TipoDocumento, string> = { SOPRALLUOGO: "SOP", CONTROLLO_QUALITA: "CQL", ESAME_DOCUMENTALE: "ESD", VERBALE: "VRB" };

export const NOMI_IMPIANTO: Record<TipoImpianto, string> = {
  elettrico_lm: "Ascensore elettrico con locale macchina",
  elettrico_mrl: "Ascensore elettrico senza locale macchina",
  oleodinamico: "Ascensore oleodinamico",
  piattaforma: "Piattaforma elevatrice",
  montacarichi: "Montacarichi",
};

export const ETICHETTE_ESITO: Record<EsitoVoce, string> = {
  ok: "Nessuna anomalia osservata",
  anomalia: "Anomalia osservata",
  chiarire: "Da chiarire",
  nv: "Non verificabile",
  na: "Non applicabile",
};

export const ETICHETTE_PRIORITA: Record<Priorita, string> = { alta: "Alta", media: "Media", bassa: "Bassa" };

export const ETICHETTE_LAVORO: Record<EsitoLavoro, string> = {
  corrispondente: "Corrispondente",
  parziale: "Parzialmente corrispondente",
  difforme: "Difforme",
  chiarire: "Da chiarire",
  nv: "Non riscontrabile",
};

export const ETICHETTE_DOCUMENTO: Record<EsitoDocumento, string> = {
  presente: "Presente",
  incompleto: "Presente, incompleto",
  assente: "Non fornito",
  richiedere: "Da richiedere",
  na: "Non applicabile",
};

export const ETICHETTE_PRESCRIZIONE: Record<StatoPrescrizione, string> = {
  aperta: "Aperta",
  in_corso: "In corso",
  risolta: "Risolta (documentata)",
  chiarire: "Da chiarire",
};

const COMUNE = "Le operazioni sull'impianto (manovre, prove, apertura di quadri e porte) restano di competenza del manutentore; gli esiti di eventuali prove eseguite da lui sono riportati come riferiti.";

export const OGGETTO: Record<TipoDocumento, string> = {
  SOPRALLUOGO:
    "Sopralluogo descrittivo dell'impianto indicato, su incarico del committente, per documentare le condizioni osservabili, le anomalie visibili e i punti da chiarire, con report fotografico.",
  CONTROLLO_QUALITA:
    "Controllo delle lavorazioni eseguite sull'impianto indicato, confrontando quanto richiesto nel documento di riferimento, quanto dichiarato dall'impresa e quanto osservato.",
  ESAME_DOCUMENTALE:
    "Esame della documentazione dell'impianto messa a disposizione dal committente, con l'elenco dei documenti mancanti e dei punti aperti da chiarire prima della verifica.",
  VERBALE: "Resoconto della riunione indicata: argomenti trattati, decisioni prese, attività da svolgere con responsabili e scadenze.",
};

export const LIMITI: Record<TipoDocumento, string> = {
  SOPRALLUOGO: [
    "Il documento descrive condizioni osservabili: non è una verifica periodica o straordinaria ai sensi del DPR 162/1999 e non è una certificazione di sicurezza o di conformità dell'ascensore.",
    "Le parti non accessibili in sicurezza sono indicate come non verificabili. " + COMUNE,
  ].join(" "),
  CONTROLLO_QUALITA: [
    "Il controllo riguarda le lavorazioni visibili e i documenti messi a disposizione: non è un collaudo.",
    "Se l'intervento è una modifica costruttiva, la verifica straordinaria prevista dal DPR 162/1999 resta di competenza dei soggetti abilitati.",
    "Quando un dato non è riscontrabile, il documento lo indica in modo esplicito. " + COMUNE,
  ].join(" "),
  ESAME_DOCUMENTALE: [
    "L'esame riguarda i documenti ricevuti: non sostituisce la verifica straordinaria prevista dal DPR 162/1999, non ne anticipa l'esito e non rilascia verbali o attestazioni riservati agli organismi competenti.",
    COMUNE,
  ].join(" "),
  VERBALE: "Il verbale riporta quanto discusso e deciso dai presenti; le decisioni restano dell'assemblea e dell'amministratore.",
};
