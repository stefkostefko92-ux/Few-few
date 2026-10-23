import { z } from "zod";

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

// Целта е САМО вътрешен път. Иначе „/“ — за да не стане краткият адрес
// отворено пренасочване към чужд сайт (измамите обичат точно това).
// Отказваме: всичко, което не започва с една „/“; „//…“ (без схема = чужд
// домейн); обратна наклонена черта (браузърите четат „/\…“ като „//…“);
// интервали и контролни знаци; цел към самия /p/ (безкраен кръг) и /api/.
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
  const p = u.pathname.toLowerCase();
  if (p === "/p" || p.startsWith("/p/") || p === "/api" || p.startsWith("/api/")) return "/";
  return t;
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
