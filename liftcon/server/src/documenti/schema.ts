// Валидация на документа, който идва от устройството (спецификация D1): всяко поле с горна граница,
// непознатите полета се махат, без управляващи символи. Типовете съвпадат с condiviso/tipi.ts.
import { z } from "zod";
import { ESITI_DOCUMENTO, ESITI_LAVORO, ESITI_VOCE, PRIORITA, STATI_PRESCRIZIONE, TIPI_DOCUMENTO, TIPI_IMPIANTO } from "./condiviso/tipi.js";

const CONTROLLO = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const t = (max: number) => z.string().max(max).refine((s) => !CONTROLLO.test(s), "caratteri non validi").default("");
const riga = (max: number) => t(max).refine((s) => !/[\r\n]/.test(s), "una sola riga");
const data = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default("");
const ora = z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]).default("");
export const ID = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, "id non valido");
const idLocale = z.string().regex(/^[A-Za-z0-9_.:-]{1,80}$/);
const fotoIds = z.array(ID).max(60).default([]);
const lista = <T extends z.ZodTypeAny>(s: T, max: number) => z.array(s).max(max).default([]);

export const IntestazioneSchema = z.object({
  titolo: riga(200),
  committente: z.object({ nome: riga(200), qualita: riga(120), condominio: riga(200), email: riga(200), telefono: riga(40) }),
  impianto: z.object({
    indirizzo: riga(200),
    comune: riga(100),
    provincia: riga(4),
    matricola: riga(60),
    tipo: z.union([z.literal(""), z.enum(TIPI_IMPIANTO)]).default(""),
    costruttore: riga(120),
    manutentore: riga(160),
    anno: riga(10),
    fermate: riga(20),
    portata: riga(40),
    note: t(2000),
  }),
  data,
  oraInizio: ora,
  oraFine: ora,
  presenti: lista(z.object({ nome: riga(120), ruolo: riga(160) }), 30),
  oggetto: t(4000),
  limiti: t(4000),
});

const EsitoChecklist = z.object({
  esito: z.enum(ESITI_VOCE),
  nota: t(2000),
  anomalia: z.object({ fraseId: riga(120), testo: t(1500), raccomandazione: t(1500), priorita: z.enum(PRIORITA) }).optional(),
  domanda: t(1500).optional(),
  foto: fotoIds,
});

const Sopralluogo = z.object({
  esiti: z.record(idLocale, EsitoChecklist).refine((r) => Object.keys(r).length <= 400, "troppe voci").default({}),
  osservazioni: lista(z.object({ id: idLocale, sezioneId: riga(80), testo: t(3000), foto: fotoIds }), 200),
  documentiVisti: lista(z.object({ voceId: riga(80), nome: riga(200), esito: z.enum(ESITI_DOCUMENTO), nota: t(1000) }), 80),
  conclusioni: t(6000),
});

const Controllo = z.object({
  riferimento: t(500),
  ditta: riga(200),
  voci: lista(z.object({ id: idLocale, richiesto: t(1000), dichiarato: t(1000), osservato: t(2000), esito: z.enum(ESITI_LAVORO), nota: t(2000), foto: fotoIds }), 300),
  conclusioni: t(6000),
});

const Esame = z.object({
  documenti: lista(z.object({ voceId: riga(80), nome: riga(200), esito: z.enum(ESITI_DOCUMENTO), estremi: riga(200), nota: t(1000) }), 120),
  verbale: t(500),
  prescrizioni: lista(z.object({ id: idLocale, testo: t(2000), stato: z.enum(STATI_PRESCRIZIONE), nota: t(1500), foto: fotoIds }), 200),
  conclusioni: t(6000),
});

const Verbale = z.object({
  sottotipo: z.enum(["riunione", "avanzamento"]).default("riunione"),
  luogo: riga(200),
  ordineDelGiorno: lista(t(500), 50),
  punti: lista(z.object({ id: idLocale, titolo: riga(300), discussione: t(5000), decisione: t(2000) }), 100),
  azioni: lista(z.object({ id: idLocale, cosa: t(1000), chi: riga(200), entro: data, stato: z.enum(["aperta", "chiusa"]) }), 200),
  avanzamento: lista(z.object({ id: idLocale, lavorazione: riga(300), percentuale: z.number().min(0).max(100), nota: t(2000), foto: fotoIds }), 200),
  prossimaRiunione: riga(200),
});

export const DATI_PER_TIPO = { SOPRALLUOGO: Sopralluogo, CONTROLLO_QUALITA: Controllo, ESAME_DOCUMENTALE: Esame, VERBALE: Verbale } as const;

export const FotoMetaSchema = z.object({ id: ID, ordine: z.number().int().min(0).max(100000), didascalia: t(500), ubicazione: riga(120), riferimento: riga(80) });

/** Тялото на PUT /admin/api/documenti/:id — данните по вида се валидират отделно (по `tipo`). */
export const DocumentoInSchema = z.object({
  tipo: z.enum(TIPI_DOCUMENTO),
  versione: z.number().int().min(0),
  intestazione: IntestazioneSchema,
  dati: z.unknown(),
  foto: lista(FotoMetaSchema, 300),
  richiestaId: z.string().max(40).nullable().optional(),
});

export const FraseInSchema = z.object({
  voceId: idLocale,
  tipo: z.enum(["anomalia", "chiarimento"]),
  testo: t(1500).refine((s) => s.trim().length >= 3, "testo troppo corto"),
  raccomandazione: t(1500),
  priorita: z.enum(PRIORITA).default("media"),
});
