// Zod схеми + CRUD конфигурации за всички анагрифики.
// Decimal стойностите пътуват като низове с ≤2 десетични — точност без float.

import { z, type ZodTypeAny as ZodTipo } from "zod";
import type { CrudConfig } from "@/lib/crud";
import { prisma } from "@/lib/prisma";
import { statoAutomezzo } from "@/lib/scadenze-logic";
import { TIPI_RITENUTA, CAUSALI_RITENUTA } from "@/lib/fiscale/ritenuta";
import { modalitaValida, condizioneValida } from "@/lib/fiscale/pagamenti";
import { TIPI_NOTIFICA } from "@/lib/fiscale/sdi-stato";
import {
  TIPI_VERIFICA,
  ESITI_VERIFICA,
  CONTROLLI_ART15,
} from "@/lib/normativa/verifiche";
import { TIPI_INTERVENTO } from "@/lib/normativa/interventi";
import { TIPI_IMPIANTO, REGIMI_IMPIANTO } from "@/lib/normativa/impianti";

// Приема точка ИЛИ запетая като десетичен разделител; нормализира към точка.
// Таванът е 8 цифри (< 100 милиона): произведението количество × цена трябва да
// се побере в Decimal(12,2) на схемата. При 10 цифри на всяко от двете полета
// тоталът стига 10^20, прелива колоната и заявката гърми със 500.
export const dec = z
  .string()
  .trim()
  .transform((v) => v.replace(",", "."))
  .pipe(
    z
      .string()
      .regex(
        /^\d{1,8}(\.\d{1,2})?$/,
        "Importo non valido: usare il punto o la virgola come separatore decimale (max. 2 decimali, max. 8 cifre intere)",
      ),
  );

/** Ставка на ДДС: колоната е `Decimal(5,2)`, тоест до 999,99.
 *
 *  Дотогава се ползваше `dec` (до 8 цели цифри): операторът напише „2200"
 *  вместо „22", Postgres връща numeric field overflow, а кодът 22003 не е сред
 *  обработваните и потребителят получава 500 „Errore interno" за собствената си
 *  печатна грешка. Горната граница е и семантична — 100 % ДДС не съществува. */
export const aliquota = z
  .string()
  .trim()
  .transform((v) => v.replace(",", "."))
  .pipe(
    z
      .string()
      .regex(
        /^\d{1,2}(\.\d{1,2})?$/,
        "Aliquota IVA non valida (0–99, max. 2 decimali)",
      )
      .refine((v) => Number(v) <= 99, "Aliquota IVA non valida (0–99)"),
  );

/** Количество/цена в редовете: по-строг таван, за да не прелее произведението. */
export const decRiga = z
  .string()
  .trim()
  .transform((v) => v.replace(",", "."))
  .pipe(
    z
      .string()
      .regex(
        /^\d{1,6}(\.\d{1,2})?$/,
        "Valore non valido (max. 6 cifre intere, 2 decimali)",
      )
      .refine((v) => Number(v) <= 999_999, "Valore troppo grande"),
  );
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
  /// Адресът за е-фактурата е НА КОНДОМИНИУМА: получателят е той, не студиото.
  pec: z
    .string()
    .trim()
    .email("PEC non valida")
    .max(200)
    .nullish()
    .or(z.literal("").transform(() => null)),
  codiceSdi: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z0-9]{6,7}$/,
      "Codice destinatario non valido (6 o 7 caratteri)",
    )
    .nullish()
    .or(z.literal("").transform(() => null)),
  /// Изключва се само за кондоминиум без данъчен номер — иначе удържането по
  /// чл. 25-ter се дължи по закон и отметката не е избор на фирмата.
  sostitutoImposta: z.boolean().optional(),
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
  pec: z
    .string()
    .trim()
    .email()
    .max(200)
    .nullish()
    .or(z.literal("").transform(() => null)),
  /** Codice destinatario НА КЛИЕНТА: 6 знака за PA, 7 за частен получател. */
  codiceSdi: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z0-9]{6,7}$/,
      "Codice destinatario: 6 o 7 caratteri alfanumerici",
    )
    .nullish()
    .or(z.literal("").transform(() => null)),
  email: z
    .string()
    .trim()
    .email()
    .max(200)
    .nullish()
    .or(z.literal("").transform(() => null)),
  telefono: strOpt,
  indirizzo: strOpt,
  citta: strOpt,
  cap: strOpt,
  /// Част от фискалния адрес. Колоната и XML-ът за SDI я искат от самото
  /// начало, но схемата я нямаше — формата я показваше, Zod я изхвърляше
  /// мълчаливо, а експортът после се оплакваше, че липсва.
  provincia: z.string().trim().max(4).nullish(),
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
  tipo: z
    .enum(["TECNICO", "AMMINISTRATIVO", "COMMERCIALE", "MAGAZZINIERE"])
    .optional(),
  codiceFiscale: strOpt,
  dataAssunzione: dataOpt,
  /** Цена на ЧАС за фирмата (заплата + осигуровки), без ДДС. Влиза в отчета за
   *  рентабилност; липсата ѝ прави труда невидим разход. */
  costoOrario: dec.nullish().or(z.literal("").transform(() => null)),
  patente: strOpt,
  specializzazioni: z.array(z.string().trim().min(1).max(100)).optional(),
  email: z
    .string()
    .trim()
    .email()
    .max(200)
    .nullish()
    .or(z.literal("").transform(() => null)),
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
  targa: z
    .string()
    .trim()
    .min(2)
    .max(12)
    .transform((v) => v.toUpperCase()),
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
      new Date(),
    );
    if (stato !== a.stato)
      await prisma.automezzo.update({ where: { id }, data: { stato } });
  },
};

const cottimistaBase = z.object({
  ragioneSociale: str,
  tipo: z.enum(["DITTA_INDIVIDUALE", "COOPERATIVA", "AZIENDA"]).optional(),
  partitaIva: z.string().trim().max(20).nullish(),
  email: z
    .string()
    .trim()
    .email()
    .max(200)
    .nullish()
    .or(z.literal("").transform(() => null)),
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
  /// Номерът от ОБЩИНАТА (чл. 12 D.P.R. 162/1999) — официалната самоличност на
  /// уредбата и това, което се изписва на табелата в кабината.
  matricolaComune: strOpt,
  comune: strOpt,
  dataComunicazione: dataOpt,
  tipo: z.enum(TIPI_IMPIANTO).optional(),
  regime: z.enum(REGIMI_IMPIANTO).optional(),
  marca: str,
  modello: str,
  anno: z.number().int().min(1900).max(2100).nullish(),
  portata: z.number().int().min(0).nullish(),
  persone: z.number().int().min(0).max(200).nullish(),
  velocita: z
    .string()
    .trim()
    .transform((v) => v.replace(",", "."))
    .pipe(
      z
        .string()
        .regex(
          /^\d{1,2}(\.\d{1,3})?$/,
          "Velocità non valida (m/s, max 3 decimali)",
        ),
    )
    .nullish()
    .or(z.literal("").transform(() => null)),
  fermate: z.number().int().min(0).nullish(),
  /// `FERMO_AMMINISTRATIVO` НЕ е тук нарочно: то се налага само от отрицателна
  /// проверка и се вдига само от нова положителна. Изборът му от падащо меню
  /// би направил състоянието безсмислено. Проверката е и сървърна.
  stato: z
    .enum(["ATTIVO", "FERMO", "MANUTENZIONE", "FUORI_SERVIZIO", "DISMESSO"])
    .optional(),
  indirizzo: strOpt,
  piano: strOpt,
  dataInstallazione: dataOpt,
  organismoNotificato: strOpt,
  manutentoreDal: dataOpt,
  ultimaRevisione: dataOpt,
  prossimaRevisione: dataOpt,
  condominioId: uuidOpt,
  amministratoreId: uuidOpt,
  note: strOpt,
  attivo: z.boolean().optional(),
});

/** Законова проверка от трета страна (чл. 13/14). */
export const verificaImpiantoSchema = z.object({
  tipo: z.enum(TIPI_VERIFICA).optional(),
  data: z.coerce.date(),
  esito: z.enum(ESITI_VERIFICA),
  organismo: strOpt,
  numeroVerbale: strOpt,
  prescrizioni: strOpt,
  scadenzaPrescrizioni: dataOpt,
  /// Изричният срок надделява над законовия: органът може да даде по-кратък.
  prossimaVerifica: dataOpt,
  documentoId: uuidOpt,
  note: strOpt,
});

export const impianti: CrudConfig = {
  entita: "impianti",
  model: "impianto",
  schemaCreate: impiantoBase,
  schemaUpdate: impiantoBase.partial(),
  searchFields: [
    "matricola",
    "marca",
    "modello",
    "indirizzo",
    "matricolaComune",
  ],
  include: { condominio: true, amministratore: true },
  orderBy: { matricola: "asc" },
  // Административното спиране се вдига САМО с нова положителна проверка
  // (чл. 14, ал. 2 D.P.R. 162/1999). Ако падащото меню може да го махне,
  // състоянието не значи нищо — а то трябва да значи именно забрана.
  vincoloModifica: (prima, data) => {
    const p = prima as { stato?: string };
    const d = data as { stato?: string };
    if (p.stato !== "FERMO_AMMINISTRATIVO" || !d.stato || d.stato === p.stato)
      return null;
    return "Impianto in fermo amministrativo: può essere rimesso in servizio solo registrando una nuova verifica con esito positivo (art. 14 c.2 D.P.R. 162/1999).";
  },
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
  filterFields: ["impiantoId"],
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
  include: {
    impianto: { select: { matricola: true, marca: true, indirizzo: true } },
  },
  filterFields: ["impiantoId"],
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
  filterFields: ["impiantoId", "dipendenteId"],
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
  aliquotaIva: aliquota.optional(),
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
  tipo: z.enum([
    "CARTELLO_CANTIERE",
    "VERBALE_CANTIERE",
    "CERTIFICATO",
    "CONTRATTO",
    "ALTRO",
  ]),
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
  campiSessione: (s) => ({ utenteId: s.sub }),
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
  // САМО MASTER. `senzaTenant` изключва филтъра по фирма (crud.ts), затова с
  // ниво ADMIN администраторът на един клиент четеше търговския списък с всички
  // фирми, удължаваше собствения си абонамент (`scadenzaAbbonamento`) и можеше
  // да деактивира конкурент. Служебна таблица = ниво на доставчика.
  ruoloLettura: "MASTER",
  ruoloScrittura: "MASTER",
  ruoloCancellazione: "MASTER",
  senzaTenant: true, // самата таблица с фирмите не се филтрира по фирма
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

/** Таванът на самата колона `Decimal(12,2)`: 9 999 999 999,99. */
const MAX_IMPORTO = 9_999_999_999;

export const voceSchema = z.object({
  articoloId: uuidOpt,
  descrizione: str,
  quantita: decRiga,
  prezzoUnitario: decRiga,
  aliquotaIva: aliquota.optional(),
  /** „Natura" по кодировката на SDI — иска се САМО при ставка 0. */
  naturaIva: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^N[1-7](\.[0-9])?$/, "Natura non valida (N1…N7, es. N2.2)")
    .nullish()
    .or(z.literal("").transform(() => null)),
  /// „Значимо благо" по D.M. 29.12.1999 — асансьорите са първи в списъка.
  /// Отметката решава дали редът влиза в облекчената основа или в горницата.
  beneSignificativo: z.boolean().optional(),
  ordine: z.number().int().min(0).optional(),
});

/** Слага тавана на произведението върху вече оформена схема за редица.
 *
 *  Поотделно количеството и цената се събират в колоната; ПРОИЗВЕДЕНИЕТО им —
 *  не: 999999 × 999999 ≈ 10¹² прелива `Decimal(12,2)`, Postgres връща 22003 и
 *  потребителят получава 500 вместо 400. Помощникът е отделен, защото `.refine`
 *  връща `ZodEffects` и маршрутите губят `.omit()`/`.partial()` — затова се
 *  прилага НАКРАЯ, след като схемата е стеснена. */
export function conLimiteImporto<T extends ZodTipo>(schema: T) {
  return schema.refine(
    (v: { quantita?: string; prezzoUnitario?: string }) =>
      v.quantita === undefined ||
      v.prezzoUnitario === undefined ||
      Number(v.quantita) * Number(v.prezzoUnitario) <= MAX_IMPORTO,
    {
      message:
        "Importo della riga troppo elevato: verificare quantità e prezzo",
    },
  );
}

export const rigaDdtSchema = z.object({
  descrizione: str,
  quantita: decRiga,
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
  /** Платено на котимиста/външен изпълнител за този ордин, без ДДС. */
  costoEsterno: dec.nullish().or(z.literal("").transform(() => null)),
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
  /// ПОЛУЧАТЕЛЯТ, когато работата е за кондоминиум. Има предимство пред
  /// администратора: той е фискалният субект, администраторът — представител.
  condominioId: uuidOpt,
  amministratoreId: uuidOpt,
  ordineLavoroId: uuidOpt,
  note: strOpt,

  // ── Фискален режим ────────────────────────────────────────────────────
  ritenuta: z.boolean().optional(),
  ritenutaAliquota: aliquota.optional(),
  ritenutaTipo: z.enum(TIPI_RITENUTA).optional(),
  ritenutaCausale: z.enum(CAUSALI_RITENUTA).optional(),
  splitPayment: z.boolean().optional(),
  regimeBeniSignificativi: z.boolean().optional(),
  modalitaPagamento: z
    .string()
    .trim()
    .toUpperCase()
    .refine(modalitaValida, "Modalità di pagamento non prevista (MP01…MP23)")
    .optional(),
  condizioniPagamento: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      condizioneValida,
      "Condizione di pagamento non valida (TP01, TP02, TP03)",
    )
    .optional(),
  cig: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{10}$/, "CIG non valido: 10 caratteri alfanumerici")
    .nullish()
    .or(z.literal("").transform(() => null)),
  cup: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{15}$/, "CUP non valido: 15 caratteri alfanumerici")
    .nullish()
    .or(z.literal("").transform(() => null)),
});

/** Получено плащане по фактура. */
export const pagamentoSchema = z.object({
  data: z.coerce.date().optional(),
  importo: dec,
  modalita: z
    .string()
    .trim()
    .toUpperCase()
    .refine(modalitaValida, "Modalità di pagamento non prevista (MP01…MP23)")
    .optional(),
  riferimento: strOpt,
  note: strOpt,
});

/** Известие от SDI, въведено ръчно или подадено от посредника. */
export const notificaSdiSchema = z.object({
  tipo: z.enum(TIPI_NOTIFICA),
  identificativoSdi: strOpt,
  dataOra: z.coerce.date().optional(),
  descrizione: strOpt,
  /// Само при NE: EC01 приета, EC02 отказана от публичната администрация.
  esito: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^EC0[12]$/, "Esito non valido (EC01 o EC02)")
    .nullish()
    .or(z.literal("").transform(() => null)),
  errori: z
    .array(z.object({ codice: strOpt, descrizione: strOpt }))
    .max(50)
    .nullish(),
  nomeFile: strOpt,
});

// ── Договори за поддръжка ───────────────────────────────────────────────────

export const PERIODICITA_VALORI = [
  "MENSILE",
  "BIMESTRALE",
  "TRIMESTRALE",
  "QUADRIMESTRALE",
  "SEMESTRALE",
  "ANNUALE",
] as const;

/** Базата без проверката на срока — `.refine` връща `ZodEffects`, а маршрутите
 *  искат `.partial()`. Затова проверката се слага НАКРАЯ, върху вече стеснената
 *  схема (същият похват като при редовете на документите). */
export const contrattoBase = z.object({
  oggetto: str,
  canone: dec,
  aliquotaIva: aliquota.optional(),
  periodicitaVisite: z.enum(PERIODICITA_VALORI).optional(),
  periodicitaFatturazione: z.enum(PERIODICITA_VALORI).optional(),
  dataInizio: z.coerce.date(),
  dataFine: z.coerce.date(),
  rinnovoAutomatico: z.boolean().optional(),
  preavvisoMesi: z.number().int().min(0).max(24).optional(),
  amministratoreId: uuidOpt,
  condominioId: uuidOpt,
  /** Импиантите, покрити от договора. */
  impiantiIds: z.array(uuid).max(500).optional(),
  note: strOpt,
});

/** Договор с край преди началото ражда безсмислен график и отрицателна
 *  продължителност при подновяване. При частична промяна проверката важи само
 *  ако и двете дати са подадени. */
export function conPeriodoValido<T extends ZodTipo>(schema: T) {
  return schema.refine(
    (v: { dataInizio?: Date; dataFine?: Date }) =>
      !v.dataInizio || !v.dataFine || v.dataFine > v.dataInizio,
    { message: "La data di fine deve essere successiva alla data di inizio" },
  );
}

export const contrattoSchema = conPeriodoValido(contrattoBase);

// ── Отчет за намесата ───────────────────────────────────────────────────────

export const ESITI_INTERVENTO = [
  "RISOLTO",
  "DA_COMPLETARE",
  "RINVIATO",
  "NON_RISOLVIBILE",
] as const;

export const rapportinoSchema = z.object({
  dataOra: z.coerce.date().optional(),
  /** Часовете влизат във фактурирането — до две десетични, най-много 24 на ден. */
  oreLavoro: z
    .string()
    .trim()
    .transform((v) => v.replace(",", "."))
    .pipe(
      z
        .string()
        .regex(/^\d{1,2}(\.\d{1,2})?$/, "Ore non valide")
        .refine((v) => Number(v) <= 24, "Massimo 24 ore per intervento"),
    )
    .optional(),
  descrizione: z.string().trim().min(1).max(4000),
  esito: z.enum(ESITI_INTERVENTO).optional(),
  tipoIntervento: z.enum(TIPI_INTERVENTO).optional(),
  materiali: strOpt,
  noteInterne: strOpt,
  tecnicoId: uuidOpt,
  /// Проверките по чл. 15, ал. 4 D.P.R. 162/1999.
  ///
  /// `nullable`, не `boolean`: „не е гледано" и „гледано, не е наред" са
  /// различни неща, а при злополука разликата е между небрежност и открита
  /// неизправност. `undefined` при промяна значи „не пипай“.
  ...Object.fromEntries(
    CONTROLLI_ART15.map((c) => [c.campo, z.boolean().nullish()]),
  ),
});

export const firmaSchema = z.object({
  firmaCliente: z.string().max(700_000),
  firmatarioNome: z.string().trim().min(1).max(200),
  firmatarioRuolo: z.string().trim().max(200).nullish(),
});

// ── Схеми за попълване от документ (AI) ─────────────────────────────────────
//
// НЕ са нови правила: всяка е `.pick()` + `.partial()` върху схемата на самата
// форма. Едно място решава дали „22/13/2026“ е валидна дата — иначе AI пътят и
// ръчният биха приемали различни неща, а разликата щеше да изплува чак в
// отхвърлена от SDI фактура.
//
// Всички полета са незадължителни, защото извличането е ЧАСТИЧНО по природа:
// документът рядко носи всичко, а липсващото се дописва на ръка.

export const condominioSchemaAi = condominioBase
  .pick({
    nome: true,
    indirizzo: true,
    citta: true,
    cap: true,
    provincia: true,
    codiceFiscale: true,
    pec: true,
    codiceSdi: true,
    unitaImmobiliari: true,
  })
  .partial();

export const amministratoreSchemaAi = amministratoreBase
  .pick({
    ragioneSociale: true,
    nome: true,
    cognome: true,
    partitaIva: true,
    codiceFiscale: true,
    pec: true,
    codiceSdi: true,
    email: true,
    telefono: true,
    indirizzo: true,
    citta: true,
    cap: true,
    provincia: true,
  })
  .partial();

export const impiantoSchemaAi = impiantoBase
  .pick({
    matricolaComune: true,
    comune: true,
    dataComunicazione: true,
    tipo: true,
    regime: true,
    marca: true,
    modello: true,
    anno: true,
    portata: true,
    persone: true,
    velocita: true,
    fermate: true,
    indirizzo: true,
    piano: true,
    dataInstallazione: true,
    organismoNotificato: true,
  })
  .partial();

export const verificaSchemaAi = verificaImpiantoSchema
  .pick({
    data: true,
    esito: true,
    organismo: true,
    numeroVerbale: true,
    prescrizioni: true,
    scadenzaPrescrizioni: true,
    tipo: true,
  })
  .partial();

export const fatturaSchemaAi = fatturaSchema
  .pick({
    data: true,
    dataScadenza: true,
    oggetto: true,
    cig: true,
    cup: true,
    modalitaPagamento: true,
    condizioniPagamento: true,
  })
  .partial();

export const preventivoSchemaAi = preventivoSchema
  .pick({ oggetto: true, descrizione: true, validitaGiorni: true, note: true })
  .partial();

export const articoloSchemaAi = articoloBase
  .pick({
    codice: true,
    barcode: true,
    nome: true,
    descrizione: true,
    categoria: true,
    prezzoAcquisto: true,
    prezzoVendita: true,
    aliquotaIva: true,
    sogliaMinima: true,
    ubicazione: true,
  })
  .partial();

export const dipendenteSchemaAi = dipendenteBase
  .pick({
    nome: true,
    cognome: true,
    codiceFiscale: true,
    email: true,
    telefono: true,
    dataAssunzione: true,
    patente: true,
    specializzazioni: true,
  })
  .partial();

export const automezzoSchemaAi = automezzoBase
  .pick({
    targa: true,
    marca: true,
    modello: true,
    chilometraggio: true,
    scadenzaAssicurazione: true,
    scadenzaRevisione: true,
    scadenzaTagliando: true,
  })
  .partial();

export const cottimistaSchemaAi = cottimistaBase
  .pick({
    ragioneSociale: true,
    tipo: true,
    partitaIva: true,
    email: true,
    telefono: true,
    indirizzo: true,
  })
  .partial();
