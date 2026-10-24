// Чистите функции на статистиката (без база и без server-only) — за да могат
// да се тестват. Записът е в ./stats.ts.

import { SITE } from "@/lib/site";

// Денят по българско време — „днес“ за жителя, не за сървъра в UTC.
export function sofiaDay(d: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return new Date(`${ymd}T00:00:00Z`);
}

// Път без query/hash и без опашна наклонена черта; само безопасни знаци и
// ограничена дължина — пътят идва от заявката, значи е чужд вход.
export function normalizePath(raw: string | null | undefined): string {
  let p = String(raw ?? "").split(/[?#]/)[0].trim();
  try {
    p = decodeURIComponent(p);
  } catch {
    /* остава както е */
  }
  if (!p.startsWith("/")) p = "/" + p;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  if (!/^\/[\p{L}\p{N}/_.-]*$/u.test(p)) return "/other";
  return p.slice(0, 160).toLowerCase();
}

// Явните маркери на източник (?s=…), които сайтът сам слага: споделяне, иконата
// на телефона, QR по място, RSS, известие и т.н. Всичко друго → „other“.
const SOURCE_RX = /^(share|app|rss|push|viber|facebook|family|print|qr-[a-z0-9-]{1,40})$/;

const REFERRER_GROUPS: [RegExp, string][] = [
  [/(^|\.)google\./, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)yandex\./, "yandex"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|m\.facebook\.com|l\.facebook\.com|lm\.facebook\.com)$/, "facebook"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)viber\.com$/, "viber"],
  [/(^|\.)(chatgpt\.com|chat\.openai\.com)$/, "chatgpt"],
  [/(^|\.)perplexity\.ai$/, "perplexity"],
  [/(^|\.)claude\.ai$/, "claude"],
  [/(^|\.)egov\.bg$/, "egov"],
];

/** Всеки непознат препращащ сайт — без името на домейна (виж normalizeSource). */
export const OTHER_SITE = "other-site";

// Хост без порт и без водещо „www.“ — за сравнение със собствения домейн.
function bareHost(h: string): string {
  return h.toLowerCase().split(":")[0].replace(/^www\./, "");
}

function siteHost(): string {
  try {
    return new URL(SITE.url).hostname;
  } catch {
    return SITE.domain;
  }
}

// Източникът на посещението: първо изричният маркер, после известна група
// (търсачка, социална мрежа, AI помощник), иначе „direct“. Името на чужд домейн
// НЕ се пази: Referer е чужд вход (всеки измислен хост би бил нов ред в
// DailyStat) и може да издаде частен сайт/интранет, откъдето идва човекът.
export function normalizeSource(
  s: string | null | undefined,
  referrer: string | null | undefined,
  ownHost: string | null | undefined,
): string {
  const mark = String(s ?? "").trim().toLowerCase();
  if (mark) return SOURCE_RX.test(mark) ? mark : "other";
  if (!referrer) return "direct";
  let host = "";
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "direct";
  }
  if (!host) return "direct";
  const own = [ownHost, siteHost()].filter(Boolean).map((h) => bareHost(String(h)));
  if (own.includes(bareHost(host))) return "internal";
  for (const [rx, name] of REFERRER_GROUPS) if (rx.test(host)) return name;
  return OTHER_SITE;
}

// Ботове и проверки не са посетители. Грубо, но достатъчно за брой на ден.
const BOT_RX =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|preview|monitor|uptime|pingdom|headless|lighthouse|curl|wget|python-requests|httpclient|axios|node-fetch|go-http/i;
export function isBot(ua: string | null | undefined): boolean {
  const s = String(ua ?? "");
  return s === "" || BOT_RX.test(s);
}
