// Шаблонът на печатните документи — какво фирмата може да промени и какво НЕ.
//
// Чисто: схема, стойности по подразбиране, заместване на полета в текстовете.
// Генераторът (`documento.ts`, `libretto.ts`) чете само резултата от
// `leggiModello` — повреден или непълен запис в базата никога не проваля
// документ, а пада на стойността по подразбиране поле по поле.
//
// ФИРМАТА ПРОМЕНЯ: лого, цвят, шрифт, полета, заглавията, текста преди и след
// таблицата, бележката под линия, подписа „за приемане", номерата на страници,
// кои контакти да се печатат.
//
// НЕ СЕ ПРОМЕНЯ, и това не е недоглеждане:
//   • наименованието, седалището и ДДС номерът на издателя — винаги на листа
//     (чл. 1, ал. 3 D.P.R. 472/1996 за DDT; чл. 21 D.P.R. 633/1972);
//   • REA и капиталът, когато са попълнени — винаги (чл. 2250 c.c.: „negli atti
//     e nella corrispondenza");
//   • обобщението на ДДС по аликвота и предупрежденията на документа (че не е
//     електронна фактура; че отчетът не е подписан);
//   • заглавието на фактурата: документът НЕ е минал през SDI и не бива да
//     изглежда като издадена електронна фактура (чл. 6 D.Lgs. 471/1997).

import { z } from "zod";

export const TIPI_DOCUMENTO = [
  "preventivo",
  "fattura",
  "ddt",
  "rapportino",
  "libretto",
] as const;
export type TipoDocumento = (typeof TIPI_DOCUMENTO)[number];

/** Документите, чието заглавие е фиксирано (виж горе). */
export const TITOLO_FISSO: ReadonlySet<TipoDocumento> = new Set(["fattura"]);

/**
 * Шрифтовете са стандартните 14 на PDF — вградени в четеца, без файл за
 * пренасяне и без лиценз. Свой шрифт би значел TTF в изданието и въпрос за
 * лиценза му при всеки клиент.
 */
export const CARATTERI = {
  Helvetica: {
    etichetta: "Sans serif (Helvetica)",
    normale: "Helvetica",
    grassetto: "Helvetica-Bold",
    corsivo: "Helvetica-Oblique",
  },
  Times: {
    etichetta: "Serif (Times)",
    normale: "Times-Roman",
    grassetto: "Times-Bold",
    corsivo: "Times-Italic",
  },
  Courier: {
    etichetta: "Monospaziato (Courier)",
    normale: "Courier",
    grassetto: "Courier-Bold",
    corsivo: "Courier-Oblique",
  },
} as const;
export type Carattere = keyof typeof CARATTERI;

export const MARGINI = { stretto: 28, normale: 40, ampio: 56 } as const;
export type Margine = keyof typeof MARGINI;

/** Полетата, които потребителят може да сложи в текстовете. Нищо друго. */
export const SEGNAPOSTI = {
  azienda: "ragione sociale dell'azienda",
  numero: "numero del documento",
  data: "data del documento",
  destinatario: "nome del destinatario",
  iban: "IBAN dell'azienda",
  totale: "totale del documento",
} as const;
export type Segnaposto = keyof typeof SEGNAPOSTI;

const HEX = /^#[0-9a-f]{6}$/i;
const testo = (max: number) => z.string().max(max).catch("");

const schemaDocumento = (titolo: string, extra: { iban: boolean }) =>
  z
    .object({
      titolo: z.string().trim().max(60).catch(titolo),
      testoIniziale: testo(2000),
      testoFinale: testo(2000),
      notaPiede: testo(500),
      mostraIban: z.boolean().catch(extra.iban),
      /** „Per accettazione" — празно поле за подпис и печат (оферта). */
      firmaAccettazione: z.boolean().catch(false),
    })
    .catch({
      titolo,
      testoIniziale: "",
      testoFinale: "",
      notaPiede: "",
      mostraIban: extra.iban,
      firmaAccettazione: false,
    });

/** Заглавията по подразбиране — същите, които документите носеха досега. */
export const TITOLI_PREDEFINITI: Record<TipoDocumento, string> = {
  preventivo: "Preventivo",
  fattura: "Documento contabile",
  ddt: "Documento di trasporto",
  rapportino: "Rapportino di intervento",
  libretto: "Libretto dell'impianto",
};

const schemaDocumenti = z.object({
  preventivo: schemaDocumento(TITOLI_PREDEFINITI.preventivo, { iban: false }),
  fattura: schemaDocumento(TITOLI_PREDEFINITI.fattura, { iban: true }),
  ddt: schemaDocumento(TITOLI_PREDEFINITI.ddt, { iban: false }),
  rapportino: schemaDocumento(TITOLI_PREDEFINITI.rapportino, { iban: false }),
  libretto: schemaDocumento(TITOLI_PREDEFINITI.libretto, { iban: false }),
});

const DOCUMENTI_PREDEFINITI = schemaDocumenti.parse({});

export const schemaModello = z.object({
  colore: z.string().regex(HEX).catch("#116bb5"),
  carattere: z.enum(["Helvetica", "Times", "Courier"]).catch("Helvetica"),
  margine: z.enum(["stretto", "normale", "ampio"]).catch("normale"),
  logo: z
    .object({
      posizione: z.enum(["sinistra", "sopra", "nessuna"]).catch("sinistra"),
      /** Ширина в точки (1 pt = 1/72"): 60–220. */
      larghezza: z.number().int().min(40).max(220).catch(110),
    })
    .catch({ posizione: "sinistra", larghezza: 110 }),
  intestazione: z
    .object({
      mostraTelefono: z.boolean().catch(true),
      mostraEmail: z.boolean().catch(true),
      mostraPec: z.boolean().catch(true),
      mostraSitoWeb: z.boolean().catch(true),
      /** Свободни редове под данните (сертификати, седалище на обекта…). */
      righeExtra: testo(400),
    })
    .catch({
      mostraTelefono: true,
      mostraEmail: true,
      mostraPec: true,
      mostraSitoWeb: true,
      righeExtra: "",
    }),
  numeriPagina: z.boolean().catch(true),
  documenti: schemaDocumenti.catch(DOCUMENTI_PREDEFINITI),
});
export type ModelloDocumenti = z.infer<typeof schemaModello>;

/**
 * Схемата за ВХОД (PUT от интерфейса) — строга: грешна стойност е 400 с
 * обяснение, не тихо заменена. `schemaModello` е за ЧЕТЕНЕ от базата и
 * прощава, за да не падне документ заради стар запис.
 */
const docIn = z.object({
  titolo: z.string().trim().max(60),
  testoIniziale: z.string().max(2000),
  testoFinale: z.string().max(2000),
  notaPiede: z.string().max(500),
  mostraIban: z.boolean(),
  firmaAccettazione: z.boolean(),
});
export const schemaModelloIngresso = z.object({
  colore: z.string().regex(HEX, "Colore non valido (formato #RRGGBB)"),
  carattere: z.enum(["Helvetica", "Times", "Courier"]),
  margine: z.enum(["stretto", "normale", "ampio"]),
  logo: z.object({
    posizione: z.enum(["sinistra", "sopra", "nessuna"]),
    larghezza: z.number().int().min(40).max(220),
  }),
  intestazione: z.object({
    mostraTelefono: z.boolean(),
    mostraEmail: z.boolean(),
    mostraPec: z.boolean(),
    mostraSitoWeb: z.boolean(),
    righeExtra: z.string().max(400),
  }),
  numeriPagina: z.boolean(),
  documenti: z.object({
    preventivo: docIn,
    fattura: docIn,
    ddt: docIn,
    rapportino: docIn,
    libretto: docIn,
  }),
});

export const MODELLO_PREDEFINITO: ModelloDocumenti = schemaModello.parse({});

/** Записът от базата (JSON или нищо) → винаги пълен, валиден шаблон. */
export function leggiModello(grezzo: unknown): ModelloDocumenti {
  const m = schemaModello.parse(
    grezzo && typeof grezzo === "object" ? grezzo : {},
  );
  // Фиксираното заглавие не се чете от записа, каквото и да пише там.
  for (const t of TITOLO_FISSO) m.documenti[t].titolo = TITOLI_PREDEFINITI[t];
  for (const t of TIPI_DOCUMENTO)
    if (!m.documenti[t].titolo) m.documenti[t].titolo = TITOLI_PREDEFINITI[t];
  return m;
}

/**
 * Замества `{поле}` в текста. Непознато поле остава както е написано: текст
 * като „{sconto}" е видимо сгрешен на листа, вместо да изчезне тихо.
 */
export function compila(
  testo: string,
  valori: Partial<Record<Segnaposto, string | null | undefined>>,
): string {
  return testo.replace(/\{([a-z]+)\}/g, (tutto, chiave: string) =>
    chiave in SEGNAPOSTI ? (valori[chiave as Segnaposto] ?? "") : tutto,
  );
}

/**
 * Контраст на цвета спрямо бялата хартия (WCAG 2.x). Под 4,5:1 заглавието се
 * чете трудно, особено при черно-бял печат — интерфейсът предупреждава.
 */
export function contrastoSuBianco(hex: string): number {
  const c = HEX.test(hex) ? hex : "#000000";
  const lin = (i: number) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
  return 1.05 / (l + 0.05);
}
