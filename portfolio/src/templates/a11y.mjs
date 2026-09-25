// a11y.mjs — декларация за достъпност (BG/EN/IT). Числата идват от a11y/report.json (tools/a11y.mjs) —
// реалният резултат от последната автоматична проверка; липсва ли докладът, редът с резултата не се показва.
import { esc, join, head, jsonLd, PATHS, SITE, ORG } from "../lib/html.mjs";
import { I18N } from "../i18n/index.mjs";
import { siteNav, siteFooter, HUB_FONTS, BRAND_BG } from "./hub.mjs";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPORT_FILE = fileURLToPath(new URL("../../a11y/report.json", import.meta.url));
export const A11Y_REPORT = existsSync(REPORT_FILE) ? JSON.parse(readFileSync(REPORT_FILE, "utf8")) : null;

const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));

export function renderA11y(lang) {
  const ui = I18N[lang], a = ui.a11y, path = PATHS.a11y[lang];
  const r = A11Y_REPORT;
  const vars = r ? { date: r.date, pages: r.summary.pages, errors: r.summary.errors, warnings: r.summary.warnings } : { date: "" };
  const list = (items) => `<ul class="a11y-list">${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  return join([
    head({ lang, title: a.title, description: a.metaDesc, keywords: a.keywords, path, paths: PATHS.a11y, fonts: HUB_FONTS, css: ["/assets/site.css"], themeColor: BRAND_BG, noindex: false, extra: jsonLd({ "@context": "https://schema.org", "@type": "WebPage", url: SITE + path, name: a.h1, inLanguage: lang, publisher: ORG, ...(r ? { dateModified: r.date } : {}) }) }),
    `<body class="hub">`, siteNav(lang, ui, PATHS.a11y),
    `<main id="main" class="section legal" style="padding-top:140px"><div class="wrap" style="max-width:820px"><div class="tag">${esc(a.eyebrow)}</div><h1 class="h2">${esc(a.h1)}</h1><p>${esc(a.intro)}</p>`,
    `<h2>${esc(a.statusTitle)}</h2><p>${esc(a.status)}</p>`,
    `<h2>${esc(a.checkTitle)}</h2><p>${esc(a.checkLede)}</p>${r ? `<p class="a11y-result"><strong>${esc(fill(a.result, vars))}</strong></p>` : ""}`,
    `<h2>${esc(a.featuresTitle)}</h2>${list(a.features)}`,
    `<h2>${esc(a.limitsTitle)}</h2>${list(a.limits)}`,
    `<h2>${esc(a.feedbackTitle)}</h2><p>${esc(a.feedback)}</p>`,
    `<p class="tiny">${esc(fill(a.prepared, vars))}</p></div></main>`,
    siteFooter(lang, ui), `<script src="/assets/site.js" defer></script>`, `</body></html>`,
  ]);
}
