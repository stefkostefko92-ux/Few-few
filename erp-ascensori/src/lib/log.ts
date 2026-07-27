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
export type Evento = Partial<
  Record<CampoLog, string | number | boolean | null>
>;

const AMMESSI = new Set<string>(CAMPI_AMMESSI);

/** Изхвърля всичко извън allowlist-а. Изнесено, за да е тестваемо. */
export function filtra(
  evento: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(evento)) {
    if (!AMMESSI.has(k)) continue;
    if (v === undefined) continue;
    out[k] =
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean" ||
      v === null
        ? v
        : String(v);
  }
  return out;
}

function scrivi(livello: Livello, msg: string, evento: Evento = {}): void {
  const riga = filtra({
    ...evento,
    ts: new Date().toISOString(),
    livello,
    msg,
  });
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
export function descriviErrore(e: unknown): {
  err_tipo: string;
  err_codice: string;
} {
  const tipo = e instanceof Error ? e.constructor.name : typeof e;
  const codice =
    typeof e === "object" && e !== null && "code" in e
      ? String((e as { code: unknown }).code)
      : "";
  return { err_tipo: tipo, err_codice: codice };
}

/**
 * Всеки сегмент, който РЕАЛНО съществува като папка в `src/app/api`.
 *
 * Списъкът се сверява с файловата система от тест (`log.test.ts`), тоест не
 * може да остарее мълчаливо: нов маршрут без ред тук вали гейта.
 */
export const SEGMENTI_NOTI = new Set([
  "api",
  "i",
  "ai",
  "allegati",
  "amministratori",
  "anonimizza",
  "articoli",
  "assegnazioni",
  "audit",
  "auth",
  "automatismi",
  "automezzi",
  "beni-significativi",
  "calendario",
  "check",
  "chiavi",
  "condomini",
  "conservazione",
  "contratti",
  "cottimisti",
  "csp-report",
  "dashboard",
  "dati-azienda",
  "ddt",
  "dipendenti",
  "documenti",
  "elabora",
  "esegui",
  "esporta",
  "estrai",
  "fatture",
  "firma",
  "gdpr",
  "healthz",
  "impianti",
  "impianti-media",
  "import",
  "libretto",
  "login",
  "logout",
  "materiali",
  "me",
  "metrics",
  "mfa",
  "movimenti",
  "notifiche",
  "ordini",
  "pagamenti",
  "password",
  "pdf",
  "preventivi",
  "pubblica",
  "qr",
  "rapportini",
  "readyz",
  "redditivita",
  "refresh",
  "report",
  "retention",
  "righe",
  "scadenzario",
  "scadenze",
  "sdi",
  "sessioni",
  "sla",
  "solleciti",
  "squadre",
  "stato",
  "stats",
  "tenants",
  "trasmetti",
  "utenti",
  "v1",
  "verifica",
  "verifiche",
  "voci",
  "webhooks",
  "xml",
]);

/**
 * Шаблон на маршрута вместо конкретния път: `/api/impianti/<uuid>` → `/api/impianti/[id]`.
 *
 * ЗАТВОРЕНО МНОЖЕСТВО, НЕ „ПОЧИСТЕН" НИЗ. Стойността става етикет на метрика, а
 * регистърът е Map в паметта, която нищо не чисти. Дотук се заменяха само
 * UUID-та: `GET /api/fatture/боклук/ddt` минаваше СУРОВ, а маршрутът отговаря и
 * без сесия (грешката се брои и при 401). Пет хиляди такива заявки изчерпваха
 * тавана и оттам нататък ИСТИНСКИ 5xx на нов маршрут вече не раждаше редица —
 * тоест алармите по бюджета за грешки ослепяваха.
 *
 * Проверката по ФОРМА не стига: `/api/fatture/x0/ddt`, `x1`, `x2`… също
 * приличат на имена. Стига само речник на това, което наистина съществува.
 */
export function rottaModello(percorso: string): string {
  return percorso
    .split("/")
    .map((p, i) => (i === 0 || p === "" || SEGMENTI_NOTI.has(p) ? p : "[id]"))
    .join("/");
}
