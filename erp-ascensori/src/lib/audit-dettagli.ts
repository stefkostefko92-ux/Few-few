// Минимизация на audit детайлите (GDPR чл. 5(1)(в) — минимизация).
//
// Регистърът задържа ФАКТА на операцията (кой, кога, какво, върху кой запис),
// не СЪДЪРЖАНИЕТО на записа. Пълната снимка на редицата би означавала, че
// изтриването на служител всъщност преписва codice fiscale, телефон и адрес в
// таблица без маршрут за триене — тоест правото на изтриване става невъзможно.
//
// Затова тук пазим само ИМЕНАТА на променените полета, никога стойностите.

/** Полета, чиито стойности никога не влизат в регистъра, дори като име. */
const SENSIBILI = new Set(["password", "refreshToken", "hmac"]);

/** Полета, чиито стойности са безопасни и полезни за одита (статуси, флагове). */
const VALORI_AMMESSI = new Set([
  "stato",
  "statoPrecedente",
  "statoNuovo",
  "tipo",
  "priorita",
  "ruolo",
  "attivo",
  "attiva",
  "completata",
  "piano",
]);

function eOggetto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Кои полета реално се променят (плитко сравнение по JSON стойност). */
export function campiModificati(
  prima: unknown,
  dopo: unknown
): { campi: string[]; valori: Record<string, unknown> } {
  const campi: string[] = [];
  const valori: Record<string, unknown> = {};
  if (!eOggetto(prima) || !eOggetto(dopo)) return { campi, valori };

  for (const chiave of Object.keys(dopo)) {
    if (SENSIBILI.has(chiave)) continue;
    const a = JSON.stringify(prima[chiave] ?? null);
    const b = JSON.stringify(dopo[chiave] ?? null);
    if (a === b) continue;
    campi.push(chiave);
    if (VALORI_AMMESSI.has(chiave)) valori[chiave] = { da: prima[chiave], a: dopo[chiave] };
  }
  return { campi, valori };
}

/** Детайли за CREATE: само кои полета са попълнени, без стойностите им. */
export function dettagliCreazione(dati: unknown): Record<string, unknown> {
  if (!eOggetto(dati)) return { campi: [] };
  const campi = Object.keys(dati).filter((k) => !SENSIBILI.has(k));
  const valori: Record<string, unknown> = {};
  for (const k of campi) if (VALORI_AMMESSI.has(k)) valori[k] = dati[k];
  return Object.keys(valori).length > 0 ? { campi, valori } : { campi };
}

/** Детайли за UPDATE: имена на променените полета (+ стойности само за статуси). */
export function dettagliModifica(prima: unknown, dopo: unknown): Record<string, unknown> {
  const { campi, valori } = campiModificati(prima, dopo);
  return Object.keys(valori).length > 0 ? { campi, valori } : { campi };
}

/** Детайли за DELETE: НИКАКВО съдържание — само колко полета е имал записът. */
export function dettagliCancellazione(prima: unknown): Record<string, unknown> {
  return { campiPresenti: eOggetto(prima) ? Object.keys(prima).length : 0 };
}
