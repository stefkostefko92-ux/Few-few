// Content-Security-Policy — последната преграда пред вмъкнат скрипт.
//
// CSP не спира вкарването на скрипт; спира ИЗПЪЛНЕНИЕТО му. Затова е смислена
// точно тук: продуктът приема имена на кондоминиуми, бележки по рапортини,
// прикачени файлове и текст, прочетен от документ с AI. Всяко от тях е чужд
// вход, който някой ден ще излезе на страница по път, който днес изглежда
// безопасен. React екранира по подразбиране — но `dangerouslySetInnerHTML`
// съществува в кода (QR етикетите), а една бъдеща употреба върху потребителски
// вход е една заявка разстояние от кражба на сесията.
//
// ЗАЩО NONCE, А НЕ ХЕШОВЕ. App Router вгражда данните за хидратацията като
// вътрешни `<script>` тагове, чието съдържание се мени със всяка страница.
// Хеш върху тях е невъзможен, а `'unsafe-inline'` би обезсмислил цялата
// политика. Nonce се сменя на всяка заявка; Next сам го слага на своите тагове,
// като го прочита от хедъра на ВХОДЯЩАТА заявка.
//
// ЦЕНАТА, ПЛАТЕНА СЪЗНАТЕЛНО: nonce се различава на всяка заявка, значи
// страниците не могат да се предрисуват статично (запазеният HTML би носил
// стар nonce и браузърът би блокирал собствените ни скриптове). За вътрешен
// инструмент зад вход това не е загуба — там нямаше какво да се кешира.

type Ambiente = Record<string, string | undefined>;

/** Разрешава истинско поетапно въвеждане при клиент: първо се наблюдава. */
export function soloRapporto(env: Ambiente = process.env): boolean {
  return env.CSP_REPORT_ONLY === "1";
}

export function nomeHeaderCsp(env: Ambiente = process.env): string {
  return soloRapporto(env)
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";
}

/** Маршрутът, който събира нарушенията. Празно = без събиране. */
const RAPPORTI = "/api/csp-report";

export interface OpzioniCsp {
  nonce: string;
  /** В разработка React Refresh компилира на живо и иска `eval`. */
  sviluppo?: boolean;
}

/**
 * Съставя политиката.
 *
 * Чиста функция върху nonce-а — така редът и съдържанието ѝ носят тестове,
 * а не коментар в middleware-а.
 */
export function costruisciCsp({ nonce, sviluppo = false }: OpzioniCsp): string {
  const script = [
    "'self'",
    `'nonce-${nonce}'`,
    // `strict-dynamic` обезсилва списъците с адреси: доверието се предава от
    // скрипт на скрипт, вместо да зависи от домейн. Точно това пази, когато
    // Next зареди свой чънк с име, което не сме предвидили.
    "'strict-dynamic'",
    // Стари браузъри без CSP3 не разбират nonce; за тях остава списък с адреси,
    // който CSP3 браузърите ИГНОРИРАТ заради `strict-dynamic`.
    "https:",
    ...(sviluppo ? ["'unsafe-eval'"] : []),
  ].join(" ");

  const direttive: Array<[string, string]> = [
    ["default-src", "'self'"],
    ["script-src", script],
    // `style-src-elem` е строг: таблиците със стилове идват само от нас.
    // В разработка Next вкарва CSS-а като `<style>` през JavaScript (горещо
    // презареждане) — там строгото правило би счупило вида на всяка страница,
    // без да пази нищо: dev сървърът не е изложен.
    ["style-src-elem", sviluppo ? "'self' 'unsafe-inline'" : "'self'"],
    // `style-src-attr` НЕ може да бъде строг: React пише `style={{…}}` като
    // атрибут, а графиките (Recharts) позиционират така всеки елемент. Хеш
    // върху атрибут не съществува на практика — стойностите се смятат по време
    // на работа. Разхлабването е ОГРАНИЧЕНО до атрибути: вмъкнат `<style>` таг
    // пак се блокира, а атрибутният стил сам по себе си не изпълнява код.
    ["style-src-attr", "'unsafe-inline'"],
    // `data:` е за подписа на клиента (`canvas.toDataURL` → PNG в `<img>`).
    ["img-src", "'self' data:"],
    ["font-src", "'self'"],
    // Доставчиците на AI се викат ОТ СЪРВЪРА. Браузърът няма работа навън —
    // ако някой ден има, това е мястото, където се вижда.
    ["connect-src", "'self'"],
    ["object-src", "'none'"],
    ["base-uri", "'none'"],
    // Спира кражбата на форма: вмъкнат `<form action="https://…">` не тръгва.
    ["form-action", "'self'"],
    // Наследникът на X-Frame-Options; покрива и вложени рамки.
    ["frame-ancestors", "'none'"],
    ["frame-src", "'none'"],
    ["worker-src", "'self'"],
    ["manifest-src", "'self'"],
  ];

  if (!sviluppo) direttive.push(["upgrade-insecure-requests", ""]);
  direttive.push(["report-uri", RAPPORTI]);

  return direttive
    .map(([k, v]) => (v ? `${k} ${v}` : k))
    .join("; ");
}

/**
 * Nonce за една заявка.
 *
 * `crypto.getRandomValues` е наличен и в Edge runtime-а, където върви
 * middleware-ът — `node:crypto` там го няма. 16 байта са 128 бита ентропия:
 * познаването на nonce е единственият начин политиката да бъде заобиколена,
 * затова стойността трябва да е непредсказуема, не просто уникална.
 */
export function generaNonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}
