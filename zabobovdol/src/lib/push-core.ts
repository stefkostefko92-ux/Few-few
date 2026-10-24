// Чиста логика на известията (без база и без мрежа) — тества се с node:test.

export const PUSH_TOPIC_KEYS = ["outages", "scams", "news", "pharmacy"] as const;
export type PushTopicKey = (typeof PUSH_TOPIC_KEYS)[number];

/** Максимален размер на JSON товара (байтове). Лимитът на услугите е ~4 KB. */
export const MAX_PAYLOAD_BYTES = 3000;
/** След толкова поредни неуспеха абонаментът се изтрива. */
export const MAX_FAILS = 5;
/** Колко известия се пращат едновременно. */
export const CONCURRENCY = 20;
/** Колко живее известието при недостъпно устройство (секунди). */
export const TTL_SECONDS = 6 * 60 * 60;

/** „outages,scams“ → ["outages","scams"] (само известни теми, без повторения). */
export function parseTopics(raw: string | null | undefined): PushTopicKey[] {
  const out: PushTopicKey[] = [];
  for (const part of (raw ?? "").split(",")) {
    const t = part.trim() as PushTopicKey;
    if ((PUSH_TOPIC_KEYS as readonly string[]).includes(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

export function joinTopics(topics: readonly string[]): string {
  return parseTopics(topics.join(",")).join(",");
}

/** Избира абонатите, които са се записали за темата (точно съвпадение). */
export function selectSubscribers<T extends { topics: string }>(subs: readonly T[], topic: string): T[] {
  return subs.filter((s) => parseTopics(s.topics).includes(topic as PushTopicKey));
}

export type SendOutcome = "ok" | "gone" | "fail";

/** 404/410 — абонаментът е изчезнал завинаги; всичко друго е временно. */
export function classifyPushError(statusCode: number | undefined | null): Exclude<SendOutcome, "ok"> {
  return statusCode === 404 || statusCode === 410 ? "gone" : "fail";
}

/** Какво да се направи с абонамента след опит за изпращане. */
export function nextAction(
  outcome: SendOutcome,
  failCount: number,
): { kind: "ok" } | { kind: "delete" } | { kind: "fail"; failCount: number } {
  if (outcome === "ok") return { kind: "ok" };
  if (outcome === "gone") return { kind: "delete" };
  const next = failCount + 1;
  return next >= MAX_FAILS ? { kind: "delete" } : { kind: "fail", failCount: next };
}

/** Само вътрешен път (започва с един „/“); иначе „/“. */
export function safeInternalPath(url: unknown): string {
  if (typeof url !== "string") return "/";
  const u = url.trim();
  if (!u.startsWith("/") || u.startsWith("//") || u.includes("\\") || /[\u0000-\u001f]/.test(u)) return "/";
  return u.length > 300 ? "/" : u;
}

/** Сглобява JSON товар ≤ MAX_PAYLOAD_BYTES (скъсява текста, ако трябва). */
export function buildPayload(p: { title: string; body: string; url: string }): string {
  const title = p.title.slice(0, 120);
  let body = p.body;
  const url = safeInternalPath(p.url);
  let json = JSON.stringify({ title, body, url });
  while (Buffer.byteLength(json, "utf8") > MAX_PAYLOAD_BYTES && body.length > 0) {
    body = body.slice(0, Math.max(0, body.length - Math.ceil(body.length / 4) - 1));
    json = JSON.stringify({ title, body: body ? body + "…" : "", url });
  }
  return json;
}

const B64URL = /^[A-Za-z0-9_-]+$/;
export function isBase64Url(s: string, min = 8, max = 200): boolean {
  return s.length >= min && s.length <= max && B64URL.test(s);
}

// Хостовете на истинските push услуги на браузърите (Chrome/Edge/Opera → FCM,
// Firefox → Mozilla autopush, Safari → Apple, стар Edge/Windows → WNS). Сървърът
// праща POST към адреса на абоната, затова всичко извън този списък е отказ
// (fail-closed): иначе анонимен посетител би накарал сървъра да вика вътрешни
// адреси (127.0.0.1, 10.x, метаданни) или бавен чужд хост, който задържа
// публикуването в админа (SSRF + DoS).
const PUSH_HOSTS: readonly RegExp[] = [
  /^fcm\.googleapis\.com$/,
  /^([a-z0-9-]+\.)+push\.services\.mozilla\.com$/, // вкл. updates.push.services.mozilla.com
  /^([a-z0-9-]+\.)+push\.apple\.com$/, // вкл. web.push.apple.com
  /^([a-z0-9-]+\.)+notify\.windows\.com$/, // вкл. wns2-*.notify.windows.com
];

/** Само https адрес на позната push услуга, без порт, потребител и парола. */
export function isPushEndpoint(s: string): boolean {
  if (typeof s !== "string" || s.length > 1000) return false;
  // Без интервали, контролни знаци, „\“ и „@“ — различните парсери на адреси
  // (WHATWG тук, url.parse в web-push) ги тълкуват различно.
  if (/[\s\u0000-\u001f\u007f\\@]/.test(s)) return false;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
    return PUSH_HOSTS.some((rx) => rx.test(u.hostname));
  } catch {
    return false;
  }
}

/** Адрес на Viber канал — само https към Viber. */
export function isViberUrl(s: string): boolean {
  return /^https:\/\/(invite\.viber\.com|vb\.me|viber\.com|www\.viber\.com)\//i.test(s.trim());
}
