// Чистата логика на измерването (без база, без server-only, без Node API) —
// ползва се и от middleware (Edge), и от сървъра, и от тестовете.
// Определенията на метриките са в docs/tracking-plan.md — той е източникът.

import { isBot } from "@/lib/stats-core";

// ───────────────────────── Кои заявки са „преглед“ ─────────────────────────

export type PageRequest = {
  method: string;
  pathname: string;
  header: (name: string) => string | null;
};

export type ViewDecision =
  | { count: true }
  | { count: false; reason: "method" | "path" | "prefetch" | "bot" | "not-page" };

// Файлове и служебни адреси — никога преглед. (Matcher-ът в middleware ги
// изключва и сам; тук е втората линия, и тя е тук, за да се тества.)
const EXCLUDED_PREFIXES = ["/admin", "/api", "/_next", "/p/", "/.well-known"];
const FILE_RX = /\.[a-z0-9]{1,8}$/i;

export function isExcludedPath(pathname: string): boolean {
  const p = pathname || "/";
  for (const x of EXCLUDED_PREFIXES) {
    const base = x.replace(/\/$/, "");
    if (p === base || p.startsWith(base + "/")) return true;
  }
  return FILE_RX.test(p);
}

// Предварително зареждане (браузърът или Next <Link> „на всеки случай“) не е
// посещение. Next 15: Next-Router-Prefetch (и сегментното зареждане);
// браузърите: Purpose / Sec-Purpose: prefetch; Firefox: X-Moz: prefetch.
export function isPrefetch(header: (name: string) => string | null): boolean {
  if (header("next-router-prefetch")) return true;
  if (header("next-router-segment-prefetch")) return true;
  if (header("x-middleware-prefetch")) return true;
  if ((header("purpose") ?? "").toLowerCase().includes("prefetch")) return true;
  if ((header("sec-purpose") ?? "").toLowerCase().includes("prefetch")) return true;
  if ((header("x-moz") ?? "").toLowerCase().includes("prefetch")) return true;
  return false;
}

/**
 * Дали заявката е истински преглед на страница = ПЪЛНО зареждане на HTML
 * документ (Accept: text/html; Sec-Fetch-Dest: document или липсва).
 *
 * Навигациите вътре в сайта без презареждане (next/link, заявки „RSC: 1“) НЕ
 * се броят тук: Next.js 15 маха заглавките RSC / Next-Router-Prefetch /
 * Next-Router-State-Tree от заявката, ПРЕДИ да я даде на middleware
 * (node_modules/next/dist/server/web/adapter.js, FLIGHT_HEADERS). Без тях
 * навигация и предварително зареждане изглеждат еднакво, а броенето на всичко
 * би надуло числата с всяка видима връзка. Затова: точно броене на входовете,
 * подценяване на дълбочината — описано в docs/tracking-plan.md.
 *
 * Не се броят и: prefetch на браузъра, ботове, /admin, /api, /_next,
 * /p/<код> (QR има свой брояч), файлове, POST (server actions) и HEAD.
 */
export function classifyPageRequest(req: PageRequest): ViewDecision {
  if (req.method !== "GET") return { count: false, reason: "method" };
  if (isExcludedPath(req.pathname)) return { count: false, reason: "path" };
  if (isPrefetch(req.header)) return { count: false, reason: "prefetch" };
  if (isBot(req.header("user-agent"))) return { count: false, reason: "bot" };
  // Втора линия: ако някоя версия на Next остави RSC заявката с Accept: text/html.
  if (req.header("rsc") === "1") return { count: false, reason: "not-page" };
  const accept = (req.header("accept") ?? "").toLowerCase();
  const dest = (req.header("sec-fetch-dest") ?? "").toLowerCase();
  const isDocument = accept.includes("text/html") && (dest === "" || dest === "document");
  if (!isDocument) return { count: false, reason: "not-page" };
  return { count: true };
}

// ───────────────────────── Групиране на пътищата ─────────────────────────

// Само познатите раздели на сайта се пазят поименно; всичко друго (404,
// скенери „/wp-admin“…) отива в „/other“. Така таблицата не расте безкрайно
// от боклук, а броят на посещенията пак е верен.
// ⚠ Нов публичен раздел → добави го тук (иначе се брои като „/other“).
export const KNOWN_SECTIONS = new Set([
  "biskvitki", "biznes", "danaci-srokove", "dezhurna-apteka", "dobrovolci",
  "dostapnost", "evroto", "galeriya", "grada", "grafik-smetosabirane", "imen-den",
  "instaliraj", "istoriya", "izmami", "kak-da", "kak-da-polzvam-sayta", "kontakti",
  "novini", "obyavi", "pechat", "pomeni", "pomoshti", "poveritelnost", "pravila",
  "prekysvaniya", "prozrachnost", "reklama", "sabitiya", "signali", "smetishta",
  "spodeleno-patuvane", "spomeni", "tarsene", "transport", "uslugi", "za-blizkite",
  "za-nas", "zov-za-pomosht",
]);

/** Нормализиран път → път за статистиката („/“, познат раздел или „/other“). */
export function groupPath(normalized: string): string {
  if (!normalized || normalized === "/") return "/";
  if (normalized === "/other") return "/other";
  const segs = normalized.split("/").filter(Boolean);
  if (segs.length === 0) return "/";
  if (!KNOWN_SECTIONS.has(segs[0])) return "/other";
  // Най-много 3 нива — достатъчно за /kak-da/<slug>, /uslugi/<slug>, /pechat/plakat.
  return "/" + segs.slice(0, 3).join("/");
}

// ───────────────────────── Вътрешният ключ ─────────────────────────

/** Заглавката, с която middleware доказва, че броенето идва от самия сървър. */
export const HIT_HEADER = "x-zbd-hit";

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Ключът за вътрешния адрес /api/stats/hit: HMAC-SHA256(AUTH_SECRET, етикет).
 * Изведен е, а не самият AUTH_SECRET — дори да изтече, не дава вход в админа.
 * null, ако тайната липсва/е къса (тогава просто не броим — fail closed).
 */
export async function hitKey(secret: string | undefined | null): Promise<string | null> {
  if (!secret || secret.length < 32) return null;
  if (/ПРОМЕНИ_МЕ|CHANGE_?ME|changeme/i.test(secret)) return null; // примерната стойност
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode("zabobovdol:stats-hit:v1")));
}

/** Сравнение в постоянно време (без Node API — работи и в Edge). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ───────────────────────── Седмици, медиани, дялове ─────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** Понеделникът на седмицата (дните са полунощ UTC на датата по София). */
export function weekStart(day: Date): Date {
  const d = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const offset = (d.getUTCDay() + 6) % 7; // пон = 0 … нед = 6
  return new Date(d.getTime() - offset * DAY_MS);
}

export function addDays(day: Date, n: number): Date {
  return new Date(day.getTime() + n * DAY_MS);
}

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Медиана (не средно — разпределенията са с тежка опашка). null при празно. */
export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Минималната извадка, под която процент не се показва. */
export const MIN_N = 20;

/** Дял num/den, само ако den ≥ minN (иначе „малко данни“ → null). */
export function safeRate(num: number, den: number, minN = MIN_N): number | null {
  if (!Number.isFinite(den) || den < minN || den <= 0) return null;
  return num / den;
}

export function formatPct(r: number | null): string {
  return r === null ? "малко данни" : `${(r * 100).toFixed(1).replace(".", ",")} %`;
}

/** Сбор по седмици: {понеделник → брой}. */
export function sumByWeek(rows: { day: Date; count: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const k = ymd(weekStart(r.day));
    out.set(k, (out.get(k) ?? 0) + r.count);
  }
  return out;
}

export type NorthStar = {
  week: string; // понеделникът на текущата седмица
  current: number;
  baseline: number | null; // медиана на предишните 8 ПЪЛНИ седмици
  weeksOfData: number; // колко от тези 8 седмици са след началото на броенето
  previous: { week: string; count: number }[];
};

/**
 * North Star: тази седмица спрямо медианата на предишните 8 пълни седмици.
 * Седмиците преди началото на броенето (firstDay) не влизат — иначе нулите
 * преди старта биха свалили медианата. Под 4 седмици данни → baseline = null.
 */
export function northStar(
  rows: { day: Date; count: number }[],
  today: Date,
  firstDay: Date | null,
): NorthStar {
  const byWeek = sumByWeek(rows);
  const cur = weekStart(today);
  // Първата ПЪЛНА седмица: ако броенето е почнало в сряда, тази седмица е
  // непълна и не влиза в базата за сравнение.
  let firstFull: Date | null = null;
  if (firstDay) {
    const ws = weekStart(firstDay);
    firstFull = ymd(ws) === ymd(firstDay) ? ws : addDays(ws, 7);
  }
  const previous: { week: string; count: number }[] = [];
  for (let i = 8; i >= 1; i--) {
    const w = addDays(cur, -7 * i);
    if (!firstFull || w.getTime() < firstFull.getTime()) continue;
    previous.push({ week: ymd(w), count: byWeek.get(ymd(w)) ?? 0 });
  }
  return {
    week: ymd(cur),
    current: byWeek.get(ymd(cur)) ?? 0,
    baseline: previous.length >= 4 ? median(previous.map((p) => p.count)) : null,
    weeksOfData: previous.length,
    previous,
  };
}
