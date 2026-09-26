// Разбор на доклада за нарушение на CSP.
//
// Докладът пристига от БРАУЗЪРА, тоест е външен вход по маршрут без сесия.
// Затова тук няма доверие към нищо в тялото и излизат само две неща:
//
//   • ДИРЕКТИВАТА — от затворен списък. Тя е етикет на метрика; свободен низ
//     оттам би дал на всеки минувач право да ражда нови времеви редици в
//     Prometheus (cardinality bomb), докато паметта свърши.
//   • ПРОИЗХОДЪТ на блокирания ресурс — сведен до четири категории (наш, чужд
//     по HTTPS, чужд по HTTP, схема без хост). Пълният адрес на нашата
//     страница носи идентификатори на фактури и кондоминиуми; на блокирания
//     ресурс — понякога чужд токен. Нито едното не е нужно, за да се разбере
//     кое правило е сработило, а хостът, избран от изпращача, е втората врата
//     към същата cardinality bomb.
//
// Всичко останало (`script-sample`, `referrer`, `original-policy`) се изхвърля.

/**
 * Директивите, които политиката ни изобщо може да наруши.
 *
 * Затворен списък, защото стойността става етикет на метрика. Непознато име
 * не се отхвърля — броим го като `altro`, за да не изчезне сигналът.
 */
export const DIRETTIVE_NOTE = new Set([
  "default-src",
  "script-src",
  "script-src-elem",
  "script-src-attr",
  "style-src",
  "style-src-elem",
  "style-src-attr",
  "img-src",
  "font-src",
  "connect-src",
  "object-src",
  "base-uri",
  "form-action",
  "frame-ancestors",
  "frame-src",
  "worker-src",
  "manifest-src",
]);

export interface Violazione {
  direttiva: string;
  /** Затворено множество — виж `ORIGINI`. */
  origine: string;
}

/** Ключовите думи, които браузърът връща вместо адрес. */
const PAROLE = new Set(["inline", "eval", "self", "data", "blob", "wasm-eval"]);

/**
 * Всички стойности, които вторият етикет изобщо може да приеме.
 *
 * ЗАЩО НЕ ПРОИЗХОДЪТ. Дотук стоеше `u.origin` — тоест схема и хост, ИЗБРАНИ ОТ
 * ИЗПРАЩАЧА. Маршрутът е без сесия, а броячът в `metriche.ts` е Map без таван и
 * без изтичане: осем килобайта доклади побират около сто различни хоста, тоест
 * всеки минувач ражда нови времеви редици, докато паметта свърши. Затова тук
 * излиза САМО дали ресурсът е бил наш, чужд по HTTPS, чужд по HTTP, или схема
 * без хост. Кой точно е бил чуждият хост е въпрос за разследване по логовете на
 * браузъра, не етикет на метрика.
 */
export const ORIGINI = new Set([
  ...PAROLE,
  "proprio",
  "esterno-https",
  "esterno-http",
  "schema",
  "altro",
]);

function origine(bloccato: unknown, proprio: string | undefined): string {
  if (typeof bloccato !== "string" || bloccato === "") return "altro";
  if (PAROLE.has(bloccato)) return bloccato;
  try {
    const u = new URL(bloccato);
    // Схема без хост (`data:`, `blob:`) — блокираното няма произход.
    if (u.origin === "null") return "schema";
    if (proprio && u.origin === proprio) return "proprio";
    return u.protocol === "https:" ? "esterno-https" : "esterno-http";
  } catch {
    return "altro";
  }
}

/** Колко доклада се четат от едно тяло. */
export const MAX_RAPPORTI = 10;

/** Собственият произход, за да се различи наш ресурс от чужд. */
function origineNostra(
  env: Record<string, string | undefined>,
): string | undefined {
  try {
    return new URL(String(env.APP_URL ?? "")).origin;
  } catch {
    return undefined;
  }
}

function normalizza(direttiva: unknown): string {
  if (typeof direttiva !== "string") return "altro";
  // Браузърите пращат ту `script-src-elem`, ту `script-src-elem 'nonce-…'`.
  const nome = direttiva.split(/\s/)[0];
  return DIRETTIVE_NOTE.has(nome) ? nome : "altro";
}

/**
 * Изважда нарушенията от тялото.
 *
 * Двата формата съществуват едновременно и нито един браузър не праща и двата:
 * старият `application/csp-report` (един обект под `csp-report`) и новият
 * Reporting API (`application/reports+json` — МАСИВ от доклади).
 */
export function leggiRapporto(
  corpo: unknown,
  env: Record<string, string | undefined> = process.env,
): Violazione[] {
  const nostra = origineNostra(env);
  if (Array.isArray(corpo))
    return (
      corpo
        // Reporting API праща МАСИВ без таван: осем килобайта побират близо
        // двеста доклада в едно тяло. Броят на страниците ни е краен — толкова
        // различни нарушения наведнъж значи, че някой пълни брояча, не че сме
        // счупили нещо.
        .slice(0, MAX_RAPPORTI)
        .filter(
          (r): r is { type?: unknown; body?: unknown } =>
            !!r && typeof r === "object",
        )
        .filter((r) => r.type === undefined || r.type === "csp-violation")
        .map((r) => r.body)
        .filter(
          (b): b is Record<string, unknown> => !!b && typeof b === "object",
        )
        .map((b) => ({
          direttiva: normalizza(b.effectiveDirective ?? b.violatedDirective),
          origine: origine(b.blockedURL ?? b.blockedURI, nostra),
        }))
    );

  if (!corpo || typeof corpo !== "object") return [];
  const r = (corpo as Record<string, unknown>)["csp-report"];
  if (!r || typeof r !== "object") return [];
  const b = r as Record<string, unknown>;
  return [
    {
      direttiva: normalizza(
        b["effective-directive"] ?? b["violated-directive"],
      ),
      origine: origine(b["blocked-uri"], nostra),
    },
  ];
}
