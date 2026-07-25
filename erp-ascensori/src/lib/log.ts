// Структурирано логване — JSON, един ред на събитие, на stdout.
//
// ЖЕЛЕЗНО ПРАВИЛО: allowlist, не blocklist. Сериализаторът приема САМО
// изброените ключове; всичко останало се изхвърля мълчаливо. Blocklist винаги
// изостава от новото поле, което някой добавя утре.
//
// Никога не влизат: имейл, парола, тяло на заявката, Cookie/Authorization,
// codiceFiscale, телефон, IBAN, съдържанието на audit `dettagli`.

export type Livello = "info" | "warn" | "error";

/** Единствените полета, които някога напускат процеса. */
const CAMPI_AMMESSI = [
  "ts",
  "livello",
  "msg",
  "req_id",
  "metodo",
  "rotta",
  "stato",
  "durata_ms",
  "utente_id",
  "ruolo",
  "tenant_id",
  "err_tipo",
  "err_codice",
  "esito",
  "conteggio",
] as const;

export type CampoLog = (typeof CAMPI_AMMESSI)[number];
export type Evento = Partial<Record<CampoLog, string | number | boolean | null>>;

const AMMESSI = new Set<string>(CAMPI_AMMESSI);

/** Изхвърля всичко извън allowlist-а. Изнесено, за да е тестваемо. */
export function filtra(evento: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(evento)) {
    if (!AMMESSI.has(k)) continue;
    if (v === undefined) continue;
    out[k] = typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null
      ? v
      : String(v);
  }
  return out;
}

function scrivi(livello: Livello, msg: string, evento: Evento = {}): void {
  const riga = filtra({ ...evento, ts: new Date().toISOString(), livello, msg });
  const testo = JSON.stringify(riga);
  if (livello === "error") console.error(testo);
  else console.log(testo);
}

export const log = {
  info: (msg: string, e?: Evento) => scrivi("info", msg, e),
  warn: (msg: string, e?: Evento) => scrivi("warn", msg, e),
  error: (msg: string, e?: Evento) => scrivi("error", msg, e),
};

/** Безопасно описание на грешка: тип и код, НИКОГА съобщението.
 *
 *  Съобщенията на Prisma съдържат аргументите на заявката — тоест точно
 *  данните от тялото (имейл, лични данни). Затова message не се логва. */
export function descriviErrore(e: unknown): { err_tipo: string; err_codice: string } {
  const tipo = e instanceof Error ? e.constructor.name : typeof e;
  const codice =
    typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
  return { err_tipo: tipo, err_codice: codice };
}

/** Шаблон на маршрута вместо конкретния път: /api/impianti/<uuid> → /api/impianti/[id] */
export function rottaModello(percorso: string): string {
  return percorso.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    "/[id]"
  );
}
