import { z } from "zod";
import { isPrefetch } from "@/lib/analytics-core";
import { isBot } from "@/lib/stats-core";

// Кратките адреси за QR кодовете по места: /p/<код> → вътрешна страница с
// маркер ?s=qr-<код>. Тук е само чистата логика (без база и без server-only),
// за да се тества. Пренасочването е в src/app/p/[code]/route.ts.

// Кодът: малки латински букви, цифри и тире, до 40 знака — същото като
// маркера „qr-…“, който статистиката приема (src/lib/stats-core.ts).
export const SHORT_CODE_RX = /^[a-z0-9-]{1,40}$/;

export const shortCodeSchema = z.string().trim().toLowerCase().regex(SHORT_CODE_RX);

// Кодът от адреса или от ?kod=… (може да дойде като масив) → валиден код или null.
export function parseShortCode(raw: unknown): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const r = shortCodeSchema.safeParse(v);
  return r.success ? r.data : null;
}

// Въображаем произход само за разбора на пътя — никога не излиза навън.
const BASE = "https://vatreshen.invalid";

// Пътят, както ще го види браузърът/сървърът: декодиран (до 3 пъти — срещу
// „%252e“) и с премахнати „.“/„..“ сегменти. null = нещо подозрително
// (развалено кодиране, „\“ или контролен знак, скрити в кодирането).
function normalizedPath(pathname: string): string | null {
  let p = pathname;
  for (let i = 0; i < 3; i++) {
    let next: string;
    try {
      next = decodeURIComponent(p);
    } catch {
      return null;
    }
    if (next === p) break;
    p = next;
  }
  if (/[\\\u0000-\u001f\u007f]/.test(p)) return null;
  if (!p.startsWith("/") || p.startsWith("//")) return null;
  try {
    return new URL(p, BASE).pathname;
  } catch {
    return null;
  }
}

function isLoopOrApi(path: string): boolean {
  const p = path.toLowerCase();
  return p === "/p" || p.startsWith("/p/") || p === "/api" || p.startsWith("/api/");
}

// Целта е САМО вътрешен път. Иначе „/“ — за да не стане краткият адрес
// отворено пренасочване към чужд сайт (измамите обичат точно това).
// Отказваме: всичко, което не започва с една „/“; „//…“ (без схема = чужд
// домейн); обратна наклонена черта (браузърите четат „/\…“ като „//…“);
// интервали и контролни знаци; цел към самия /p/ (безкраен кръг) и /api/.
//
// Проверяваме НОРМАЛИЗИРАНИЯ път, а не суровия низ: „/.//evil.com“,
// „/a/..//evil.com“ и „/%2e//evil.com“ минаваха проверката на суровия низ, а
// URL ги свежда до „//evil.com“ (protocol-relative → чужд сайт). Връщаме
// нормализирания вид — точно това, което после отива в Location.
export function safeInternalTarget(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim();
  if (!t.startsWith("/") || t.startsWith("//")) return "/";
  if (t.length > 300) return "/";
  if (/[\\\s\u0000-\u001f\u007f]/.test(t)) return "/";
  let u: URL;
  try {
    u = new URL(t, BASE);
  } catch {
    return "/";
  }
  if (u.origin !== BASE) return "/";
  if (u.pathname.startsWith("//")) return "/";
  const decoded = normalizedPath(u.pathname);
  if (decoded === null || decoded.startsWith("//")) return "/";
  if (isLoopOrApi(u.pathname) || isLoopOrApi(decoded)) return "/";
  return u.pathname + u.search + u.hash;
}

// Относителният адрес за пренасочването: целта + ?s=qr-<код> (останалите
// параметри и котвата се пазят). Относителен Location не може да изведе
// човека извън нашия сайт.
export function qrRedirectLocation(target: string, code: string): string {
  const u = new URL(safeInternalTarget(target), BASE);
  u.searchParams.set("s", `qr-${code}`);
  return u.pathname + u.search + u.hash;
}

// Пътят без параметри — за статистиката (bump нормализира и него).
export function targetPath(target: string): string {
  return new URL(safeInternalTarget(target), BASE).pathname;
}

export function shortLinkPath(code: string): string {
  return `/p/${code}`;
}

// --- Пренасочването /p/<код> (route.ts ползва тези, за да се тестват) ---

/** Условието за търсене на кода — САМО публикуваните кратки адреси. */
export function shortLinkWhere(code: string) {
  return { code: { equals: code, mode: "insensitive" as const }, published: true };
}

export type ShortLinkFinder = (code: string) => Promise<{ target: string } | null>;

/**
 * Кодът от адреса → { код, безопасна цел } или null (невалиден код, няма
 * такъв/непубликуван, грешка в базата). `find` е заявката към базата.
 */
export async function resolveShortLink(
  raw: unknown,
  find: ShortLinkFinder,
): Promise<{ code: string; target: string } | null> {
  const code = parseShortCode(raw);
  if (!code) return null;
  try {
    const link = await find(code);
    return link ? { code, target: safeInternalTarget(link.target) } : null;
  } catch {
    // Без база — пак водим човека към сайта, не към грешка.
    return null;
  }
}

/** Заглавките на пренасочването: относителен Location, без кеш, без индекс. */
export function shortLinkRedirectHeaders(location: string): Record<string, string> {
  return {
    // Относителен адрес — не може да изведе човека извън сайта.
    Location: location,
    // Всяко сканиране да стига до сървъра (кешът би „изял“ броенето).
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
  };
}

/** Броим само хора: без ботове и визуализатори на връзки (Viber/Facebook
 *  правят преглед на адреса) и без предварително зареждане. */
export function isHumanScan(header: (name: string) => string | null): boolean {
  return !isPrefetch(header) && !isBot(header("user-agent"));
}

// Конкретното обещание на плаката според това накъде води кодът. Хората
// сканират, когато знаят какво ще получат — „Всичко за града“ е твърде общо.
// Само обещания, които сайтът реално изпълнява (страниците съществуват).
const PROMISES: [string, string][] = [
  ["/dezhurna-apteka", "Дежурната аптека днес — с един поглед"],
  ["/prekysvaniya", "Кога спира токът и водата — обявените прекъсвания"],
  ["/izmami", "Пазете се от измами — как да ги познаете"],
  ["/uslugi", "Важните телефони на града — на едно място"],
  ["/transport", "Автобуси, влак и такси — кога и откъде"],
  ["/pomoshti", "Пенсии и помощи — какво ви се полага и как"],
  ["/danaci-srokove", "Данъци и такси — кога и как да платите"],
  ["/kak-da", "„Как да…“ — стъпка по стъпка, с картинки"],
  ["/novini", "Новините на Бобов дол"],
  ["/imen-den", "Кой има имен ден днес"],
  ["/sabitiya", "Какво се случва в града"],
  ["/instaliraj", "Сложете „За Бобов дол“ на телефона си"],
  ["/za-blizkite", "Сложете „За Бобов дол“ на телефона на мама и татко"],
];

export const GENERAL_PROMISE = "Всичко за града — на едно място";

export function posterPromise(target: string): string {
  const p = targetPath(target);
  for (const [prefix, text] of PROMISES) {
    if (p === prefix || p.startsWith(prefix + "/")) return text;
  }
  return GENERAL_PROMISE;
}
