// Разбор на доклада за нарушение на CSP.
//
// Докладът пристига от БРАУЗЪРА, тоест е външен вход по маршрут без сесия.
// Затова тук няма доверие към нищо в тялото и излизат само две неща:
//
//   • ДИРЕКТИВАТА — от затворен списък. Тя е етикет на метрика; свободен низ
//     оттам би дал на всеки минувач право да ражда нови времеви редици в
//     Prometheus (cardinality bomb), докато паметта свърши.
//   • ПРОИЗХОДЪТ на блокирания ресурс — само схема+хост, без път и без заявка.
//     Пълният адрес на нашата страница носи идентификатори на фактури и
//     кондоминиуми; на блокирания ресурс — понякога чужд токен. Нито едното
//     не е нужно, за да се разбере кое правило е сработило.
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
  /** `self`, `inline`, `eval`, `data`, произход, или `altro`. */
  origine: string;
}

/** Ключовите думи, които браузърът връща вместо адрес. */
const PAROLE = new Set(["inline", "eval", "self", "data", "blob", "wasm-eval"]);

function origine(bloccato: unknown): string {
  if (typeof bloccato !== "string" || bloccato === "") return "altro";
  if (PAROLE.has(bloccato)) return bloccato;
  try {
    const u = new URL(bloccato);
    // Схема без хост (`data:`, `blob:`) — самата схема е отговорът.
    return u.origin === "null" ? u.protocol.replace(":", "") : u.origin;
  } catch {
    return "altro";
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
export function leggiRapporto(corpo: unknown): Violazione[] {
  if (Array.isArray(corpo))
    return corpo
      .filter(
        (r): r is { type?: unknown; body?: unknown } =>
          !!r && typeof r === "object",
      )
      .filter((r) => r.type === undefined || r.type === "csp-violation")
      .map((r) => r.body)
      .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
      .map((b) => ({
        direttiva: normalizza(b.effectiveDirective ?? b.violatedDirective),
        origine: origine(b.blockedURL ?? b.blockedURI),
      }));

  if (!corpo || typeof corpo !== "object") return [];
  const r = (corpo as Record<string, unknown>)["csp-report"];
  if (!r || typeof r !== "object") return [];
  const b = r as Record<string, unknown>;
  return [
    {
      direttiva: normalizza(b["effective-directive"] ?? b["violated-directive"]),
      origine: origine(b["blocked-uri"]),
    },
  ];
}
