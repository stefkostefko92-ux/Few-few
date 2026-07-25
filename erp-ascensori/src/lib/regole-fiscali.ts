// Фискални правила като ЧИСТИ предикати — носят правна тежест, затова живеят
// извън маршрутите и се тестват без база.
//
// Досега тези решения бяха вградени в HTTP слоя и нямаха нито един тест.

// ── Преходи на състоянията при документите ─────────────────────────────────
// Ордините имат своя машина (workflow.ts). Фактурите и офертите също трябва да
// имат — иначе PAGATA → BOZZA минава и издаден фискален документ се съживява.

export const STATI_FATTURA = [
  "BOZZA",
  "EMESSA",
  "INVIATA",
  "PAGATA",
  "SCADUTA",
  "STORNATA",
] as const;
export type StatoFattura = (typeof STATI_FATTURA)[number];

export const TRANSIZIONI_FATTURA: Record<StatoFattura, readonly StatoFattura[]> = {
  BOZZA: ["EMESSA"],
  EMESSA: ["INVIATA", "PAGATA", "SCADUTA", "STORNATA"],
  INVIATA: ["PAGATA", "SCADUTA", "STORNATA"],
  SCADUTA: ["PAGATA", "STORNATA"],
  PAGATA: ["STORNATA"], // само сторно след плащане
  STORNATA: [], // финално — сторнираното не се съживява
};

export const STATI_PREVENTIVO = [
  "BOZZA",
  "INVIATO",
  "APPROVATO",
  "RIFIUTATO",
  "SCADUTO",
] as const;
export type StatoPreventivo = (typeof STATI_PREVENTIVO)[number];

export const TRANSIZIONI_PREVENTIVO: Record<StatoPreventivo, readonly StatoPreventivo[]> = {
  BOZZA: ["INVIATO"],
  INVIATO: ["APPROVATO", "RIFIUTATO", "SCADUTO"],
  SCADUTO: ["INVIATO"], // може да се преиздаде
  APPROVATO: [], // финално — от него се ражда ордин
  RIFIUTATO: [], // финално
};

export function transizioneFatturaAmmessa(da: StatoFattura, a: StatoFattura): boolean {
  return TRANSIZIONI_FATTURA[da].includes(a);
}

export function transizionePreventivoAmmessa(da: StatoPreventivo, a: StatoPreventivo): boolean {
  return TRANSIZIONI_PREVENTIVO[da].includes(a);
}

// ── Променимост на документите ─────────────────────────────────────────────

/** Редовете (и заглавието) на документ се менят само в изброените състояния. */
export function documentoModificabile(
  stato: string | undefined,
  statiModificabili: readonly string[] | undefined
): boolean {
  if (!statiModificabili || !stato) return true;
  return statiModificabili.includes(stato);
}

/** Издаден фискален документ не се трие — сторнира се. */
export function fatturaEliminabile(stato: string): boolean {
  return stato === "BOZZA";
}

// ── Склад ──────────────────────────────────────────────────────────────────

/** Знаковата промяна на наличността за даден тип движение. */
export function deltaGiacenza(tipo: "ENTRATA" | "USCITA" | "RETTIFICA", quantita: number): number {
  if (tipo === "ENTRATA") return quantita;
  if (tipo === "USCITA") return -quantita;
  return quantita; // RETTIFICA носи знака си
}

/** Валидно ли е количеството за дадения тип движение. */
export function quantitaValida(
  tipo: "ENTRATA" | "USCITA" | "RETTIFICA",
  quantita: number
): boolean {
  if (!Number.isInteger(quantita)) return false;
  if (tipo === "RETTIFICA") return quantita !== 0;
  return quantita > 0;
}
