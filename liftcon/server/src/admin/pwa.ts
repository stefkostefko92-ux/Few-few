// Приложението на началния екран (PWA) — за телефон и таблет на огледа. Обхватът е целият /admin/ (входът и
// 2FA остават в прозореца на приложението), стартира в документите. Service worker-ът е /admin/sw.js: версията
// му е отпечатък на файловете на приложението — всеки деплой с промяна пуска нов кеш, без смесени версии.
// Уроците от Rilievi: икони any + maskable (PNG — никога SVG), преки пътища, PDF през „Condividi“ на iPhone.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const QUI = dirname(fileURLToPath(import.meta.url));
export const STATIC_DIR = join(QUI, "..", "..", "admin-static");
/** Общите модули за браузъра (сглобяване, текстове) — компилираните condiviso/*.js. */
export const LIB_DIR = join(QUI, "..", "documenti", "condiviso");

export const START_URL = "/admin/documenti/";
export const SCOPE = "/admin/";

export function manifest(versione: string) {
  const icona = (file: string, size: number, purpose: "any" | "maskable") => ({ src: `/admin/static/pwa/${file}.png?v=${versione}`, sizes: `${size}x${size}`, type: "image/png", purpose });
  return {
    id: START_URL,
    name: "LiftCon – Documenti",
    short_name: "LiftCon",
    description: "Relazioni di sopralluogo, controllo qualità, esame documentale e verbali: anche senza connessione.",
    lang: "it",
    dir: "ltr",
    start_url: START_URL,
    scope: SCOPE,
    display: "standalone",
    orientation: "any",
    background_color: "#F5F6F3",
    theme_color: "#1E2226",
    categories: ["business", "productivity", "utilities"],
    prefer_related_applications: false,
    icons: [icona("icon-192", 192, "any"), icona("icon-512", 512, "any"), icona("icon-maskable-192", 192, "maskable"), icona("icon-maskable-512", 512, "maskable")],
    shortcuts: [
      { name: "Nuova relazione di sopralluogo", short_name: "Sopralluogo", url: "/admin/documenti/#/nuovo/SOPRALLUOGO", icons: [icona("icon-192", 192, "any")] },
      { name: "Nuovo verbale", short_name: "Verbale", url: "/admin/documenti/#/nuovo/VERBALE", icons: [icona("icon-192", 192, "any")] },
      { name: "Documenti", url: "/admin/documenti/", icons: [icona("icon-192", 192, "any")] },
      { name: "Richieste", url: "/admin/richieste", icons: [icona("icon-192", 192, "any")] },
    ],
  };
}

/** Отпечатъкът на всичко, което service worker-ът кешира (приложението, общите модули, стиловете, иконите). */
export function versioneApp(cartelle: string[]): string {
  const h = createHash("sha256");
  const visita = (dir: string) => {
    for (const nome of readdirSync(dir).sort()) {
      const p = join(dir, nome);
      if (statSync(p).isDirectory()) visita(p);
      else if (/\.(js|css|png|webp)$/.test(nome)) h.update(nome).update(readFileSync(p));
    }
  };
  for (const c of cartelle) visita(c);
  return h.digest("hex").slice(0, 12);
}

let cache: string | undefined;
/** Версията се смята веднъж при старт (файловете в образа не се менят до следващия деплой). */
export const versione = (): string => (cache ??= versioneApp([STATIC_DIR, LIB_DIR]));

/** Тагове за <head> на всяка страница на панела (инсталиране от телефон, таблет и компютър). */
export const testaPwa = (versione: string): string =>
  `<link rel="manifest" href="/admin/manifest.webmanifest">
<meta name="theme-color" content="#1E2226">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="LiftCon">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="apple-touch-icon" href="/admin/static/pwa/apple-touch-icon.png?v=${versione}">`;
