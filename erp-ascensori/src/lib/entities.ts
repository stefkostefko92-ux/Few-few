// Zod схеми + CRUD конфигурации за всички анагрифики.
// Decimal стойностите пътуват като низове с ≤2 десетични — точност без float.

import { z } from "zod";
import type { CrudConfig } from "@/lib/crud";
import { prisma } from "@/lib/prisma";
import { statoAutomezzo } from "@/lib/scadenze-logic";

export const dec = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Importo non valido (usare il punto, max 2 decimali)");
export const decOpt = dec.nullish();
const str = z.string().trim().min(1).max(300);
const strOpt = z.string().trim().max(2000).nullish();
const dataOpt = z.coerce.date().nullish();
const uuid = z.string().uuid();
const uuidOpt = uuid.nullish();

// ── Анагрифики ──────────────────────────────────────────────────────────────

const condominioBase = z.object({
  nome: str,
  indirizzo: str,
  citta: str,
  cap: strOpt,
  provincia: z.string().trim().max(4).nullish(),
  codiceFiscale: strOpt,
  unitaImmobiliari: z.number().int().min(0).nullish(),
  amministratoreId: uuidOpt,
  note: strOpt,
  attivo: z.boolean().optional(),
});

export const condomini: CrudConfig = {
  entita: "condomini",
  model: "condominio",
  schemaCreate: condominioBase,
  schemaUpdate: condominioBase.partial(),
  searchFields: ["nome", "indirizzo", "citta"],
  include: { amministratore: true, _count: { select: { impianti: true } } },
  orderBy: { nome: "asc" },
};

const amministratoreBase = z.object({
  tipo: z.enum(["PERSONA_FISICA", "SOCIETA"]).optional(),
  nome: str,
  cognome: strOpt,
  ragioneSociale: strOpt,
  partitaIva: z.string().trim().max(20).nullish(),
  codiceFiscale: z.string().trim().max(20).nullish(),
  pec: z.string().trim().email().max(200).nullish().or(z.literal("").transform(() => null)),
  email: z.string().trim().email().max(200).nullish().or(z.literal("").transform(() => null)),
  telefono: strOpt,
  indirizzo: strOpt,
  citta: strOpt,
  cap: strOpt,
  note: strOpt,
  attivo: z.boolean().optional(),
});

export const amministratori: CrudConfig = {
  entita: "amministratori",
  model: "amministratore",
  schemaCreate: amministratoreBase,
  schemaUpdate: amministratoreBase.partial(),
  searchFields: ["nome", "cognome", "ragioneSociale", "email"],
  orderBy: { nome: "asc" },
};

const dipendenteBase = z.object({
  nome: str,
  cognome: str,
  tipo: z.enum(["TECNICO", "AMMINISTRATIVO", "COMMERCIALE", "MAGAZZINIERE"]).optional(),
  codiceFiscale: strOpt,
  dataAssunzione: dataOpt,
  patente: strOpt,
  specializzazioni: z.array(z.string().trim().min(1).max(100)).optional(),
  email: z.string().trim().email().max(200).nullish().or(z.literal("").transform(() => null)),
  telefono: strOpt,
  note: strOpt,
  attivo: z.boolean().optional(),
});

export const dipendenti: CrudConfig = {
  entita: "dipendenti",
  model: "dipendente",
  schemaCreate: dipendenteBase,
  schemaUpdate: dipendenteBase.partial(),
  searchFields: ["nome", "cognome", "codiceFiscale"],
  orderBy: { cognome: "asc" },
};

const automezzoBase = z.object({
  targa: z.string().trim().min(2).max(12).transform((v) => v.toUpperCase()),
  marca: str,
  modello: str,
  chilometraggio: z.number().int().min(0).optional(),
  scadenzaRevisione: dataOpt,
  scadenzaAssicurazione: dataOpt,
  scadenzaTagliando: dataOpt,
  conducenteId: uuidOpt,
  note: strOpt,
  attivo: z.boolean().optional(),
});

export const automezzi: CrudConfig = {
  entita: "automezzi",
  model: "automezzo",
  schemaCreate: automezzoBase,
  schemaUpdate: automezzoBase.partial(),
  searchFields: ["targa", "marca", "modello"],
  include: { conducente: true },
  orderBy: { targa: "asc" },
  // цветният статус се преизчислява при всеки запис по най-близката дата
  afterWrite: async (id) => {
    const a = await prisma.automezzo.findUnique({ where: { id } });
    if (!a) return;
    const stato = statoAutomezzo(
      [a.scadenzaRevisione, a.scadenzaAssicurazione, a.scadenzaTagliando],
      new Date()
    );
    if (stato !== a.stato) await prisma.automezzo.update({ where: { id }, data: { stato } });
  },
};

const cottimistaBase = z.object({
  ragioneSociale: str,
  tipo: z.enum(["DITTA_INDIVIDUALE", "COOPERATIVA", "AZIENDA"]).optional(),
  partitaIva: z.string().trim().max(20).nullish(),
  email: z.string().trim().email().max(200).nullish().or(z.literal("").transform(() => null)),
  telefono: strOpt,
  indirizzo: strOpt,
  note: strOpt,
  attivo: z.boolean().optional(),
});

export const cottimisti: CrudConfig = {
  entita: "cottimisti",
  model: "cottimista",
  schemaCreate: cottimistaBase,
  schemaUpdate: cottimistaBase.partial(),
  searchFields: ["ragioneSociale", "partitaIva"],
  orderBy: { ragioneSociale: "asc" },
};

const squadraBase = z.object({
  nome: str,
  cottimistiId: uuid,
  capocantiere: strOpt,
  membri: z.array(z.string().trim().min(1).max(150)).optional(),
  attiva: z.boolean().optional(),
  note: strOpt,
});

export const squadre: CrudConfig = {
  entita: "squadre",
  model: "squadra",
  schemaCreate: squadraBase,
  schemaUpdate: squadraBase.partial(),
  searchFields: ["nome", "capocantiere"],
  include: { cottimista: true },
  orderBy: { nome: "asc" },
};

const impiantoBase = z.object({
  matricola: str,
  marca: str,
  modello: str,
  anno: z.number().int().min(1900).max(2100).nullish(),
  portata: z.number().int().min(0).nullish(),
  fermate: z.number().int().min(0).nullish(),
  stato: z.enum(["ATTIVO", "FERMO", "MANUTENZIONE", "FUORI_SERVIZIO", "DISMESSO"]).optional(),
  indirizzo: strOpt,
  piano: strOpt,
  dataInstallazione: dataOpt,
  ultimaRevisione: dataOpt,
  prossimaRevisione: dataOpt,
  condominioId: uuidOpt,
  amministratoreId: uuidOpt,
  note: strOpt,
  attivo: z.boolean().optional(),
});

export const impianti: CrudConfig = {
  entita: "impianti",
  model: "impianto",
  schemaCreate: impiantoBase,
  schemaUpdate: impiantoBase.partial(),
  searchFields: ["matricola", "marca", "modello", "indirizzo"],
  include: { condominio: true, amministratore: true },
  orderBy: { matricola: "asc" },
};

const mediaBase = z.object({
  impiantoId: uuid,
  tipo: z.enum(["foto", "video", "documento"]),
  url: z.string().trim().min(1).max(1000),
  nome: strOpt,
});

export const impiantiMedia: CrudConfig = {
  entita: "impianti_media",
  model: "impiantoMedia",
  schemaCreate: mediaBase,
  schemaUpdate: mediaBase.partial(),
};

const scadenzaBase = z.object({
  impiantoId: uuid,
  tipo: z.enum(["revisione", "certificazione", "manutenzione"]),
  dataScadenza: z.coerce.date(),
  completata: z.boolean().optional(),
  note: strOpt,
});

export const scadenzeImpianti: CrudConfig = {
  entita: "scadenze_impianti",
  model: "scadenzaImpianto",
  schemaCreate: scadenzaBase,
  schemaUpdate: scadenzaBase.partial(),
  include: { impianto: { select: { matricola: true, marca: true, indirizzo: true } } },
  orderBy: { dataScadenza: "asc" },
};

const assegnazioneBase = z.object({
  impiantoId: uuid,
  dipendenteId: uuid,
  dataInizio: z.coerce.date().optional(),
  dataFine: dataOpt,
  attiva: z.boolean().optional(),
  note: strOpt,
});

export const assegnazioniTecnici: CrudConfig = {
  entita: "assegnazioni_tecnici",
  model: "assegnazioneTecnico",
  schemaCreate: assegnazioneBase,
  schemaUpdate: assegnazioneBase.partial(),
  ruoloScrittura: "RESPONSABILE",
  include: { impianto: { select: { matricola: true } }, dipendente: true },
  orderBy: { dataInizio: "desc" },
};

const articoloBase = z.object({
  codice: str,
  barcode: strOpt,
  nome: str,
  descrizione: z.string().trim().max(2000).optional(),
  tipo: z.enum(["COMPONENTI", "VENDITA"]).optional(),
  categoria: strOpt,
  ubicazione: strOpt,
  sogliaMinima: z.number().int().min(0).optional(),
  prezzoAcquisto: decOpt,
  prezzoVendita: decOpt,
  marginePerc: decOpt,
  aliquotaIva: dec.optional(),
  note: strOpt,
  attivo: z.boolean().optional(),
  // quantita НЕ е тук: движи се само чрез движения
});

export const articoli: CrudConfig = {
  entita: "articoli_magazzino",
  model: "articoloMagazzino",
  schemaCreate: articoloBase,
  schemaUpdate: articoloBase.partial(),
  searchFields: ["codice", "nome", "barcode", "categoria"],
  orderBy: { codice: "asc" },
};

const documentoBase = z.object({
  tipo: z.enum(["CARTELLO_CANTIERE", "VERBALE_CANTIERE", "CERTIFICATO", "CONTRATTO", "ALTRO"]),
  titolo: str,
  contenuto: z.string().max(50000).nullish(),
  fileUrl: z.string().trim().max(1000).nullish(),
  note: strOpt,
});

export const documenti: CrudConfig = {
  entita: "documenti",
  model: "documento",
  schemaCreate: documentoBase,
  schemaUpdate: documentoBase.partial(),
  searchFields: ["titolo"],
  include: { utente: { select: { nome: true, cognome: true } } },
};

const tenantBase = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Solo minuscole, numeri e trattini"),
  ragioneSociale: str,
  email: z.string().trim().email().max(200),
  piano: z.enum(["TRIAL", "STARTER", "PROFESSIONAL", "ENTERPRISE"]).optional(),
  attivo: z.boolean().optional(),
  scadenzaAbbonamento: dataOpt,
  note: strOpt,
});

export const tenants: CrudConfig = {
  entita: "tenants",
  model: "tenant",
  schemaCreate: tenantBase,
  schemaUpdate: tenantBase.partial(),
  ruoloLettura: "ADMIN",
  ruoloScrittura: "ADMIN",
  ruoloCancellazione: "MASTER",
  searchFields: ["slug", "ragioneSociale"],
};

const ddtBase = z.object({
  data: z.coerce.date().optional(),
  causale: strOpt,
  destinatario: strOpt,
  indirizzoConsegna: strOpt,
  vettore: strOpt,
  ordineLavoroId: uuidOpt,
  note: strOpt,
});

export const ddtSchema = { base: ddtBase };

// ── Редови схеми (voci / righe) ─────────────────────────────────────────────

export const voceSchema = z.object({
  articoloId: uuidOpt,
  descrizione: str,
  quantita: dec,
  prezzoUnitario: dec,
  aliquotaIva: dec.optional(),
  ordine: z.number().int().min(0).optional(),
});

export const rigaDdtSchema = z.object({
  descrizione: str,
  quantita: dec,
  um: z.string().trim().max(10).nullish(),
  peso: decOpt,
  ordine: z.number().int().min(0).optional(),
});

// ── Документи от активния цикъл ─────────────────────────────────────────────

export const preventivoSchema = z.object({
  oggetto: str,
  descrizione: strOpt,
  validitaGiorni: z.number().int().min(1).max(365).optional(),
  impiantoId: uuidOpt,
  amministratoreId: uuidOpt,
  note: strOpt,
});

export const ordineSchema = z.object({
  priorita: z.enum(["ORDINARIA", "URGENTE", "EMERGENZA"]).optional(),
  oggetto: str,
  descrizione: strOpt,
  noteInterne: strOpt,
  noteCommittente: strOpt,
  dataInizio: dataOpt,
  dataFine: dataOpt,
  impiantoId: uuidOpt,
  preventivoId: uuidOpt,
  tecnicoId: uuidOpt,
  cottimistiId: uuidOpt,
  squadraId: uuidOpt,
});

export const fatturaSchema = z.object({
  tipo: z.enum(["EMESSA", "RICEVUTA"]).optional(),
  data: z.coerce.date().optional(),
  dataScadenza: dataOpt,
  oggetto: strOpt,
  amministratoreId: uuidOpt,
  ordineLavoroId: uuidOpt,
  note: strOpt,
});
