// Типовете на документите (relazioni) — общи за сървъра и за офлайн приложението в браузъра.
// Папката condiviso/ се компилира в чисти ES модули без зависимости: браузърът ги зарежда като
// /admin/documenti/lib/*.js (само за влезли), затова тук няма импорти от node_modules.

export const TIPI_DOCUMENTO = ["SOPRALLUOGO", "CONTROLLO_QUALITA", "ESAME_DOCUMENTALE", "VERBALE"] as const;
export type TipoDocumento = (typeof TIPI_DOCUMENTO)[number];

export const TIPI_IMPIANTO = ["elettrico_lm", "elettrico_mrl", "oleodinamico", "piattaforma", "montacarichi"] as const;
export type TipoImpianto = (typeof TIPI_IMPIANTO)[number];

export const PRIORITA = ["alta", "media", "bassa"] as const;
export type Priorita = (typeof PRIORITA)[number];

// ---------- Каталог (съдържание; в репото — само с наши думи, без текст от нормите) ----------

/** Готова фраза за аномалия: какво се вижда + какво препоръчваме на възложителя + ориентировъчен приоритет. */
export interface FraseAnomalia {
  id: string;
  testo: string;
  raccomandazione: string;
  priorita: Priorita;
}

export interface VoceChecklist {
  id: string; // „sezione.voce“, уникален в каталога
  testo: string; // какво се наблюдава (описателно)
  aiuto?: string; // подсказка за техника на място
  applicabile?: TipoImpianto[]; // липсва = всички
  anomalie: FraseAnomalia[];
  chiarimenti: string[]; // готови въпроси за „Punti da chiarire“
}

export interface SezioneChecklist {
  id: string;
  titolo: string;
  ubicazione: string; // къде е (за надписите на снимките): „Locale macchina“, „Fossa“…
  applicabile?: TipoImpianto[];
  voci: VoceChecklist[];
}

export interface VoceDocumentale {
  id: string;
  nome: string;
  aiuto?: string;
  riferimento?: string; // само проверен правен източник (напр. „DPR 162/1999, art. 13“)
  applicabile?: TipoImpianto[];
}

export interface CategoriaLavori {
  id: string;
  titolo: string;
  voci: string[]; // типични позиции от оферта/поръчка (подсказки при попълване)
}

// ---------- Данните на документа ----------

export const ESITI_VOCE = ["ok", "anomalia", "chiarire", "nv", "na"] as const;
export type EsitoVoce = (typeof ESITI_VOCE)[number];
// ok = nessuna anomalia osservata · nv = non verificabile (non accessibile/non visibile) · na = non applicabile

export interface Persona {
  nome: string;
  ruolo: string; // „Tecnico manutentore, ditta …“, „Amministratore“…
}

export interface Intestazione {
  titolo: string;
  committente: { nome: string; qualita: string; condominio: string; email: string; telefono: string };
  impianto: {
    indirizzo: string;
    comune: string;
    provincia: string;
    matricola: string;
    tipo: TipoImpianto | "";
    costruttore: string;
    manutentore: string;
    anno: string;
    fermate: string;
    portata: string;
    note: string;
  };
  data: string; // YYYY-MM-DD (sopralluogo/riunione)
  oraInizio: string;
  oraFine: string;
  presenti: Persona[];
  oggetto: string;
  limiti: string;
}

export interface EsitoChecklist {
  esito: EsitoVoce;
  nota: string;
  anomalia?: { fraseId: string; testo: string; raccomandazione: string; priorita: Priorita };
  domanda?: string; // за „chiarire“
  foto: string[]; // id на снимки
}

export interface DatiSopralluogo {
  esiti: Record<string, EsitoChecklist>;
  osservazioni: Array<{ id: string; sezioneId: string; testo: string; foto: string[] }>;
  documentiVisti: Array<{ voceId: string; nome: string; esito: EsitoDocumento; nota: string }>;
  conclusioni: string;
}

export const ESITI_LAVORO = ["corrispondente", "parziale", "difforme", "chiarire", "nv"] as const;
export type EsitoLavoro = (typeof ESITI_LAVORO)[number];

export interface DatiControllo {
  riferimento: string; // „Preventivo n. … del …, ditta …“
  ditta: string;
  voci: Array<{ id: string; richiesto: string; dichiarato: string; osservato: string; esito: EsitoLavoro; nota: string; foto: string[] }>;
  conclusioni: string;
}

export const ESITI_DOCUMENTO = ["presente", "incompleto", "assente", "richiedere", "na"] as const;
export type EsitoDocumento = (typeof ESITI_DOCUMENTO)[number];

export const STATI_PRESCRIZIONE = ["aperta", "in_corso", "risolta", "chiarire"] as const;
export type StatoPrescrizione = (typeof STATI_PRESCRIZIONE)[number];

export interface DatiEsame {
  documenti: Array<{ voceId: string; nome: string; esito: EsitoDocumento; estremi: string; nota: string }>;
  verbale: string; // „Verbale di verifica del … (organismo …)“
  prescrizioni: Array<{ id: string; testo: string; stato: StatoPrescrizione; nota: string; foto: string[] }>;
  conclusioni: string;
}

export interface DatiVerbale {
  sottotipo: "riunione" | "avanzamento";
  luogo: string;
  ordineDelGiorno: string[];
  punti: Array<{ id: string; titolo: string; discussione: string; decisione: string }>;
  azioni: Array<{ id: string; cosa: string; chi: string; entro: string; stato: "aperta" | "chiusa" }>;
  avanzamento: Array<{ id: string; lavorazione: string; percentuale: number; nota: string; foto: string[] }>;
  prossimaRiunione: string;
}

export type DatiPerTipo = {
  SOPRALLUOGO: DatiSopralluogo;
  CONTROLLO_QUALITA: DatiControllo;
  ESAME_DOCUMENTALE: DatiEsame;
  VERBALE: DatiVerbale;
};

export interface Foto {
  id: string;
  ordine: number;
  didascalia: string;
  ubicazione: string;
  riferimento: string; // id на точка/позиция, към която е закачена („“ = свободна)
  larghezza: number;
  altezza: number;
}

export interface DocumentoCompleto<T extends TipoDocumento = TipoDocumento> {
  id: string;
  tipo: T;
  stato: "BOZZA" | "EMESSO";
  numero: string | null;
  revisione: number;
  versione: number;
  intestazione: Intestazione;
  dati: DatiPerTipo[T];
  foto: Foto[];
  autore: { nome: string; qualifica: string };
  emessoIl: string | null;
}
