// Планът за анонимизация — ЧИСТА логика, без база.
//
// Защо анонимизация, а не изтриване. Правото на заличаване (чл. 17 GDPR) се
// сблъсква челно с два по-силни режима:
//
//   • чл. 2220 Codice Civile — счетоводните записи и подкрепящите ги документи
//     се пазят ДЕСЕТ години. Фактурата на едно физическо лице не се трие,
//     защото лицето го е поискало;
//   • чл. 17(3)(б) GDPR — обработването, нужно за изпълнение на правно
//     задължение, е изрично изключено от заличаването.
//
// Затова заличаваме ЛИЦЕТО, не СЛЕДАТА: идентифициращите полета падат, връзките
// остават, документите продължават да се броят и сверяват. Това е решението,
// което издържа и пред клиента, и пред Garante.
//
// Планът се смята отделно от прилагането, за да носи тестове и за да може да
// бъде ПОКАЗАН на човека, преди да натисне бутона: „ето какво изчезва, ето
// какво остава и по каква разпоредба".

/** Видовете субекти, за които маршрутът работи. */
export const TIPI_SOGGETTO = [
  "utente",
  "dipendente",
  "amministratore",
] as const;
export type TipoSoggetto = (typeof TIPI_SOGGETTO)[number];

export const ETICHETTA_SOGGETTO: Record<TipoSoggetto, string> = {
  utente: "Utente del sistema",
  dipendente: "Dipendente",
  amministratore: "Amministratore / cliente",
};

/** Стойността, с която се заменя име — разпознаваема, не празна. */
export const ANONIMO = "Anonimizzato";

/**
 * Домейн за подменените адреси.
 *
 * `.invalid` е ЗАПАЗЕН от RFC 2606 точно за това: гарантирано не се резолвва,
 * тоест подмененият адрес не може случайно да стигне до чуждо истинско лице.
 */
export const DOMINIO_ANONIMO = "anonimizzato.invalid";

export interface CampoAnonimizzato {
  campo: string;
  /** `null` = полето се изчиства. */
  valore: string | null;
}

export interface Conservato {
  cosa: string;
  /** Разпоредбата, заради която остава — на италиански, за човека насреща. */
  base: string;
}

export interface PianoAnonimizzazione {
  tipo: TipoSoggetto;
  campi: CampoAnonimizzato[];
  conservati: Conservato[];
  /** Сесиите падат — иначе анонимизираният акаунт продължава да работи. */
  revocaSessioni: boolean;
}

/** Уникален, но безсмислен адрес: `email` е уникална колона, константа не става. */
export function emailAnonima(id: string): string {
  return `anonimo-${id.slice(0, 8)}@${DOMINIO_ANONIMO}`;
}

const CONSERVATI_COMUNI: Conservato[] = [
  {
    cosa: "Documenti contabili e fiscali (fatture, DDT, preventivi, ordini) e i relativi collegamenti",
    base: "art. 2220 c.c. (dieci anni) — art. 17(3)(b) GDPR",
  },
  {
    cosa: "Registro delle operazioni (audit): le voci restano firmate e non modificabili",
    base: "art. 17(3)(b) GDPR — la cancellazione romperebbe la catena di firma; le voci escono da sole alla scadenza dei termini di conservazione",
  },
];

/**
 * Какво пада и какво остава за даден вид субект.
 *
 * `id` влиза само за да се построи уникалният подменен адрес.
 */
export function pianoAnonimizzazione(
  tipo: TipoSoggetto,
  id: string,
): PianoAnonimizzazione {
  switch (tipo) {
    case "utente":
      return {
        tipo,
        campi: [
          { campo: "nome", valore: ANONIMO },
          { campo: "cognome", valore: "—" },
          { campo: "email", valore: emailAnonima(id) },
          { campo: "note", valore: null },
          { campo: "totpSegreto", valore: null },
          { campo: "refreshToken", valore: null },
        ],
        conservati: [
          {
            cosa: "L'account resta collegato alle operazioni che ha compiuto, senza nome",
            base: "necessario per la tracciabilità delle scritture — art. 17(3)(b) GDPR",
          },
          ...CONSERVATI_COMUNI,
        ],
        revocaSessioni: true,
      };

    case "dipendente":
      return {
        tipo,
        campi: [
          { campo: "nome", valore: ANONIMO },
          { campo: "cognome", valore: "—" },
          { campo: "codiceFiscale", valore: null },
          { campo: "email", valore: null },
          { campo: "telefono", valore: null },
          { campo: "patente", valore: null },
          { campo: "note", valore: null },
        ],
        conservati: [
          {
            cosa: "Interventi e rapportini restano attribuiti alla posizione, non alla persona",
            base: "prova dell'esecuzione — art. 17(3)(e) GDPR; verifiche periodiche art. 13 D.P.R. 162/1999",
          },
          ...CONSERVATI_COMUNI,
        ],
        revocaSessioni: false,
      };

    case "amministratore":
      return {
        tipo,
        campi: [
          { campo: "nome", valore: ANONIMO },
          { campo: "cognome", valore: "—" },
          { campo: "codiceFiscale", valore: null },
          { campo: "email", valore: null },
          { campo: "pec", valore: null },
          { campo: "telefono", valore: null },
          { campo: "indirizzo", valore: null },
          { campo: "note", valore: null },
        ],
        conservati: [
          {
            cosa: "Partita IVA, denominazione e dati di fatturazione delle società",
            base: "art. 21 D.P.R. 633/1972 — requisito della fattura già emessa",
          },
          ...CONSERVATI_COMUNI,
        ],
        revocaSessioni: false,
      };
  }
}

/** Полетата като обект за записа — редът е без значение, стойностите не. */
export function datiAnonimizzati(
  piano: PianoAnonimizzazione,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const c of piano.campi) out[c.campo] = c.valore;
  return out;
}

/**
 * Проверява дали записът НАИСТИНА е анонимизиран.
 *
 * Не е излишна педантичност: ако утре някой добави поле с лични данни и забрави
 * плана, „анонимизираният" запис пак носи име — а ние вече сме казали на лицето,
 * че е заличено. Проверката се пуска СЛЕД записа.
 */
export function residuiPersonali(
  piano: PianoAnonimizzazione,
  record: Record<string, unknown>,
): string[] {
  const attesi = datiAnonimizzati(piano);
  const residui: string[] = [];
  for (const [campo, valore] of Object.entries(attesi)) {
    const attuale = record[campo];
    if (valore === null && attuale !== null && attuale !== undefined)
      residui.push(campo);
    if (valore !== null && attuale !== valore) residui.push(campo);
  }
  return residui;
}
