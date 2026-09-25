// frontend/scripts/prerender.mjs
// Build-time static prerender — pure Node, NO browser (runs in node:22-alpine).
//
// Problem it solves: the app is a client-side SPA, so AEO crawlers that do not
// execute JavaScript (ClaudeBot, PerplexityBot, GPTBot, OAI-SearchBot) only see
// an empty <div id="root"> + <noscript>. This script post-processes `dist/`:
//   • localized routes (/bg …/pl) get their own index.html with translated
//     <title>/description/<html lang>, hreflang cluster, per-locale
//     WebPage+FAQPage JSON-LD, and a crawlable content snapshot in #root;
//   • the English root gets a crawlable content snapshot injected into #root;
//   • legal/status routes get correct per-route <title>/description/canonical.
//
// The SPA still boots normally: main.jsx uses createRoot().render(), which
// REPLACES the snapshot in #root on mount (no hydration, so no mismatch).
// Crawlers without JS read the snapshot; users get the live SPA.
//
// Wired into `npm run build` as `vite build && node scripts/prerender.mjs`.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LANDING_TRANSLATIONS } from "../src/i18n/landing.js";
import { LANDING_EN } from "../src/i18n/landingEn.js";
import { SITE_STRINGS } from "../src/i18n/siteStrings.js";
import { HEADER, HERO } from "../src/site/heroClasses.js";
import { COMMAND_CATALOG } from "../src/data/commandsCatalog.js";
import {
  TICKET_TOOL_COMPARE, APPY_COMPARE, BEST_TICKET_BOT_GUIDE, GDPR_GUIDE, PANEL_SETUP_GUIDE, CHECKED_DATE,
} from "../src/data/growthContent.js";
import { FEATURES_HUB, FEATURE_PAGES, featureJsonLd, hubJsonLd } from "../src/data/featurePages.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "..", "dist");
const SITE = "https://supremebot.carbonstealth.eu";

// Keep in sync with src/components/Seo.jsx (LANDING_LOCALES + landingPath).
const LANDING_LOCALES = ["en", "bg", "de", "es", "fr", "it", "nl", "pl"];
const landingPath = (loc) => (loc === "en" ? "/" : `/${loc}`);
const OG_LOCALE = {
  en: "en_US", bg: "bg_BG", de: "de_DE", es: "es_ES",
  fr: "fr_FR", it: "it_IT", nl: "nl_NL", pl: "pl_PL",
};

// ─── helpers ────────────────────────────────────────────────────────────────
const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Safe JSON-LD embedding (prevent </script> breakout).
const jsonLd = (obj) =>
  `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;

// Replace exactly once; throw if the anchor is missing so the build fails loudly
// instead of silently shipping wrong <head> tags.
function replaceOnce(html, regex, replacement, label) {
  if (!regex.test(html)) throw new Error(`prerender: anchor not found for ${label}`);
  return html.replace(regex, replacement);
}

// Apply the common <head> overrides (title, description trio, canonical, og:url,
// og:locale, html lang) to a copy of the template.
function withHead(template, { title, description, path, lang, keywords }) {
  const url = `${SITE}${path}`;
  let h = template;
  h = replaceOnce(h, /<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`, "title");
  h = replaceOnce(h, /(<meta name="description" content=")[\s\S]*?("\s*\/>)/,
    `$1${esc(description)}$2`, "meta description");
  // Per-route keyword override — root CLAUDE.md rule: ≥5 keywords, always incl.
  // "Carbon Stealth". Optional: routes that don't pass `keywords` keep the
  // default set already in index.html (which also satisfies the rule).
  if (keywords && keywords.length) {
    h = replaceOnce(h, /(<meta name="keywords" content=")[\s\S]*?("\s*\/>)/,
      `$1${esc(keywords.join(", "))}$2`, "meta keywords");
  }
  h = replaceOnce(h, /(<meta property="og:description" content=")[\s\S]*?("\s*\/>)/,
    `$1${esc(description)}$2`, "og:description");
  h = replaceOnce(h, /(<meta name="twitter:description" content=")[\s\S]*?("\s*\/>)/,
    `$1${esc(description)}$2`, "twitter:description");
  h = replaceOnce(h, /(<meta property="og:title" content=")[\s\S]*?("\s*\/>)/,
    `$1${esc(title)}$2`, "og:title");
  h = replaceOnce(h, /(<meta name="twitter:title" content=")[\s\S]*?("\s*\/>)/,
    `$1${esc(title)}$2`, "twitter:title");
  h = replaceOnce(h, /(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`, "canonical");
  h = replaceOnce(h, /(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`, "og:url");
  h = replaceOnce(h, /(<meta property="og:locale" content=")[^"]*(")/,
    `$1${OG_LOCALE[lang] || "en_US"}$2`, "og:locale");
  h = replaceOnce(h, /<html lang="[^"]*"/, `<html lang="${lang}"`, "html lang");
  return h;
}

// Inject extra <head> markup (hreflang links + per-route JSON-LD) before </head>.
function injectHead(html, markup) {
  return html.replace("</head>", `${markup}\n</head>`);
}

// Inject a crawlable content snapshot into the (empty) #root.
function injectRoot(html, snapshot) {
  return replaceOnce(html, /<div id="root">\s*<\/div>/,
    `<div id="root">${snapshot}</div>`, "#root");
}

function hreflangCluster() {
  const links = LANDING_LOCALES.map(
    (loc) => `<link rel="alternate" hreflang="${loc}" href="${SITE}${landingPath(loc)}" />`
  );
  links.push(`<link rel="alternate" hreflang="x-default" href="${SITE}/" />`);
  return links.join("\n  ");
}

function writeRoute(path, html) {
  const outDir = path === "/" ? DIST : join(DIST, path.replace(/^\//, ""));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.html"), html, "utf8");
}

// ─── вътрешни връзки към ръководствата ───────────────────────────────────────
// ЗАЩО (одит, 16.08.2026): футърът с тези пет връзки беше добавен в React-а
// (#214), но снимката ТУК не е рендериран React — тя е ръчно поддържан HTML.
// Тоест връзките ги виждаше само обхождач, който ИЗПЪЛНЯВА JavaScript, а тази
// снимка съществува точно заради онези, които НЕ изпълняват (ClaudeBot,
// PerplexityBot, GPTBot, OAI-SearchBot — изброени в заглавието на файла).
// Поправката от #214 не стигаше до аудиторията, за която е писана.
//
// Етикетите идват от СЪЩИЯ обект, който храни футъра (`t.guides`), за да не
// станат две определения на едно нещо — точно дефектът, гонен цяла сесия.
const GUIDE_LINKS = [
  ["/guides/ticket-panel-setup", "panel"],
  ["/guides/best-discord-ticket-bot", "best"],
  ["/guides/gdpr-discord-bot", "gdpr"],
  ["/compare/ticket-tool-alternative", "vsTicketTool"],
  ["/compare/appy-alternative", "vsAppy"],
];

// Връзки към /features/* — същият масив, който храни components/FeatureLinks.jsx.
// Заглавието е на езика на посетителя (t.guides.features), етикетите са
// английските имена на страниците (съдържанието им е на английски).
function featureLinks(heading) {
  const items = FEATURE_PAGES.map((p) => `<li><a href="${p.path}">${esc(p.nav)}</a></li>`).join("");
  return `<nav><h2>${esc(heading)}</h2><ul>${items}<li><a href="${FEATURES_HUB.path}">${esc(FEATURES_HUB.nav)}</a></li></ul></nav>`;
}

function guideLinks(t) {
  if (!t.guides) return "";
  const items = GUIDE_LINKS
    .filter(([, key]) => t.guides[key])
    .map(([href, key]) => `<li><a href="${href}">${esc(t.guides[key])}</a></li>`)
    .join("");
  return items ? `<nav><h2>${esc(t.guides.heading)}</h2><ul>${items}</ul></nav>` : "";
}

// ─── Стилизираното hero (редизайн 25.09.2026) ──────────────────────────────
// Същите класове като site/Landing.jsx и site/SiteChrome.jsx (heroClasses.js):
// дизайнът се вижда преди JS, React го подменя с идентичен елемент. Обгръщащият
// min-h-screen държи обикновения текст за обхождачите под сгъвката.
function heroSnapshot(t, locale) {
  const nav = SITE_STRINGS[locale]?.nav || SITE_STRINGS.en.nav;
  const home = locale === "en" ? "/" : landingPath(locale);
  const links = [["features", nav.features], ["game", nav.game], ["pricing", nav.pricing], ["faq", nav.faq]]
    .map(([id, label]) => `<a href="#${id}">${esc(label)}</a>`).join("");
  const notes = String(t.ctaNote || "").split(/\s+·\s+/).filter(Boolean).map((c) => `<li>${esc(c)}</li>`).join("");
  return `<div class="site min-h-screen" lang="${locale}">
  <header class="relative z-20"><div class="${HEADER.bar}"><a href="${home}" class="${HEADER.brand}"><img src="/logo-emblem.png" alt="" width="36" height="36" class="w-9 h-9"><span class="${HEADER.name}">Supreme Bot</span></a><nav class="${HEADER.nav}">${links}</nav><div class="${HEADER.actions}"><a href="/api/auth/login" class="${HEADER.signIn}">${esc(nav.signIn)}</a></div></div><nav class="${HEADER.mobileNav}">${links}</nav></header>
  <section class="${HERO.section}"><div class="${HERO.col}"><h1 class="${HERO.h1}">${esc(t.h1a)}<br>${esc(t.h1b)}</h1><p class="${HERO.sub}">${esc(t.sub)}</p><div class="${HERO.ctaRow}"><a href="/api/auth/login" class="site-btn">${esc(t.cta)}</a><a href="#pricing" class="site-btn-quiet">${esc(String(t.seePricing || "").replace(/\s*→\s*$/, ""))}</a></div><ul class="${HERO.notes}">${notes}</ul></div></section>
</div>`;
}

// ─── content snapshot from a landing translation object ──────────────────────
function landingSnapshot(t, locale = t.locale) {
  const features = t.features.map(
    (f) => `<li><h3>${esc(f.title)}</h3><p>${esc(f.desc)}</p></li>`
  ).join("");
  const eu = t.euBullets.map((b) => `<li>${esc(b)}</li>`).join("");
  const faq = t.faq.map(
    (f) => `<div><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></div>`
  ).join("");
  const tier = (x) =>
    `<div><h3>${esc(x.name)} — ${esc(x.price)}${esc(x.per || "")}</h3><ul>${
      x.bullets.map((b) => `<li>${esc(b)}</li>`).join("")
    }</ul></div>`;
  // Free-vs-Premium comparison as a real <table> so non-JS AEO crawlers can quote it.
  const compare = t.compare
    ? `<section><h2>${esc(t.compare.heading)}</h2><table><thead><tr><th>${esc(t.compare.colCap)}</th><th>${esc(t.compare.colFree)}</th><th>${esc(t.compare.colPremium)}</th></tr></thead><tbody>${
        t.compare.rows.map(([c, f, p]) => `<tr><td>${esc(c)}</td><td>${esc(f)}</td><td>${esc(p)}</td></tr>`).join("")
      }</tbody></table></section>`
    : "";
  return `${heroSnapshot(t, locale)}<div class="site prerender-content" style="max-width:72rem;margin:0 auto;padding:2rem;color:#c3c9d3;background:#16171b;font-family:system-ui,sans-serif">
    <section><h2>${esc(t.featuresHeading)}</h2><p>${esc(t.featuresSub)}</p><ul>${features}</ul></section>
    <section><h2>${esc(t.euHeading)}</h2><ul>${eu}</ul></section>
    ${compare}
    <section><h2>${esc(t.faqHeading)}</h2>${faq}</section>
    <section><h2>${esc(t.pricingHeading)}</h2>${tier(t.tiers.free)}${tier(t.tiers.premium)}${tier(t.tiers.whitelabel)}${
      t.priceNote ? `<p>${esc(t.priceNote)}</p>` : ""
    }</section>
    ${guideLinks(t)}
    ${featureLinks(t.guides?.features || "Features")}
  </div>`;
}

function landingJsonLd(locale, t) {
  const path = landingPath(locale);
  return jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${SITE}${path}#webpage`,
        url: `${SITE}${path}`,
        name: t.title,
        description: t.description,
        inLanguage: locale,
        isPartOf: { "@id": `${SITE}/#website` },
        about: { "@id": `${SITE}/#software` },
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE}${path}#faq`,
        inLanguage: locale,
        mainEntity: t.faq.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  });
}

// ─── main ─────────────────────────────────────────────────────────────────
const template = readFileSync(join(DIST, "index.html"), "utf8");
let count = 0;

// 1) Localized landing routes (/bg …/pl) — full snapshot + per-locale head.
for (const [locale, t] of Object.entries(LANDING_TRANSLATIONS)) {
  if (locale === "en") continue; // root handled below
  let html = withHead(template, {
    title: t.title, description: t.description, path: landingPath(locale), lang: locale,
  });
  const cyr = locale === "bg" ? `\n  <link rel="preload" href="/fonts/tektur-cyrillic-700-normal.woff2" as="font" type="font/woff2" crossorigin />` : "";
  html = injectHead(html, `  ${hreflangCluster()}\n  ${landingJsonLd(locale, t)}${cyr}`);
  html = injectRoot(html, landingSnapshot(t));
  writeRoute(landingPath(locale), html);
  count++;
}

// 2) English root "/" — its rich @graph stays in index.html; hreflang + snapshot.
//    От редизайна (25.09.2026) английският е ЕДИН от преводите (i18n/landingEn.js)
//    и минава през същия landingSnapshot(). Ръчното копие тук се беше разминало:
//    „One bot replaces six“ (навсякъде другаде е осем) и „White-label & Agency
//    servers“ (Agency не се продава от v3.3) — точно в текста за обхождачите.
{
  let html = injectHead(template, `  ${hreflangCluster()}`);
  html = injectRoot(html, landingSnapshot(LANDING_EN));
  writeRoute("/", html);
  count++;
}

// 3) Public commands reference — full catalog as a crawlable snapshot (the
//    AEO content for this route; mirrors PublicCommandsPage.jsx exactly so
//    the snapshot and the live SPA never drift).
{
  const totalCommands = COMMAND_CATALOG.reduce((n, cat) => n + (cat.commands || []).length, 0);
  const totalCategories = COMMAND_CATALOG.length;
  const title = "Supreme Bot Commands — Full Reference";
  const description = `Every Supreme Bot slash command and dashboard feature: ${totalCommands} commands across ${totalCategories} categories — tickets, forms, verification, polls, giveaways, automation, and more.`;
  const PREMIUM_MARK = /\s*\(Premium\)\s*$/;
  const stripPremium = (label) => label.replace(PREMIUM_MARK, "");
  const isPremium = (label) => PREMIUM_MARK.test(label);
  const catHtml = COMMAND_CATALOG.map((cat) => {
    const cmds = (cat.commands || []).map((cmd) => `<li><code>${esc(stripPremium(cmd.name))}</code>${
      isPremium(cmd.name) ? " (Premium)" : ""
    } — <span>${esc(cmd.signature || "")}</span><p>${esc(cmd.description)}</p></li>`).join("");
    const dashOnly = (cat.dashboardOnly || []).map((f) => `<li><strong>${esc(stripPremium(f.feature))}</strong>${
      isPremium(f.feature) ? " (Premium)" : ""
    } — dashboard-only<p>${esc(f.description)}</p></li>`).join("");
    return `<section><h2>${esc(cat.icon)} ${esc(cat.category)}</h2><p>${esc(cat.description)}</p><ul>${cmds}${dashOnly}</ul></section>`;
  }).join("");
  const snapshot = `<div class="site prerender-content" style="max-width:72rem;margin:0 auto;padding:2rem;color:#c3c9d3;background:#16171b;font-family:system-ui,sans-serif">
    <h1>${esc(title)}</h1>
    <p>Supreme Bot has ${totalCommands} slash commands across ${totalCategories} categories — tickets, panels, forms &amp; applications, verification, polls, giveaways, scheduled &amp; sticky messages, integrations, and server administration. Most features are also reachable from the web dashboard; this page is the full reference (the same list <code>/help</code> shows in Discord).</p>
    ${catHtml}
  </div>`;
  let html = withHead(template, { title, description, path: "/commands", lang: "en" });
  html = injectRoot(html, snapshot);
  writeRoute("/commands", html);
  count++;
}

// 4) Growth Level-2 content pages (docs/PRODUCT_ROADMAP.md) — /compare and
//    /guides. Answer-first paragraph + the comparison table as a real <table>
//    (the AEO meat: non-JS crawlers can quote cells directly), FAQ as
//    Q/A pairs. Data comes from src/data/growthContent.js — the SAME object
//    the live React pages render — so the snapshot can never drift from the
//    live page's numbers.
function compareSnapshot(d) {
  const rows = d.rows.map(
    ([cap, supreme, competitor]) => `<tr><td>${esc(cap)}</td><td>${esc(supreme)}</td><td>${esc(competitor)}</td></tr>`
  ).join("");
  const faq = d.faq.map((f) => `<div><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></div>`).join("");
  const sources = d.sourceUrls.map((u) => `<a href="${esc(u)}">${esc(u)}</a>`).join(", ");
  return `<div class="site prerender-content" style="max-width:72rem;margin:0 auto;padding:2rem;color:#c3c9d3;background:#16171b;font-family:system-ui,sans-serif">
    <h1>Supreme Bot vs ${esc(d.competitor)}</h1>
    <p>${esc(d.answer)}</p>
    <p><small>Checked ${esc(CHECKED_DATE)} against ${sources}. Prices as published by each vendor, not converted.</small></p>
    <section><h2>Feature &amp; pricing comparison</h2><table><thead><tr><th>Capability</th><th>Supreme Bot</th><th>${esc(d.competitor)}</th></tr></thead><tbody>${rows}</tbody></table></section>
    <section><h2>Frequently asked questions</h2>${faq}</section>
  </div>`;
}

for (const d of [TICKET_TOOL_COMPARE, APPY_COMPARE]) {
  const keywords = d === TICKET_TOOL_COMPARE
    ? ["discord ticket bot", "ticket tool alternative", "best discord ticket bot", "supreme bot", "discord bot comparison", "carbon stealth"]
    : ["discord application bot", "appy bot alternative", "discord ticket bot", "supreme bot", "discord bot comparison", "carbon stealth"];
  let html = withHead(template, { title: d.title, description: d.description, path: d.path, lang: "en", keywords });
  html = injectRoot(html, compareSnapshot(d));
  writeRoute(d.path, html);
  count++;
}

{
  const d = BEST_TICKET_BOT_GUIDE;
  const criteria = d.criteria.map(
    (c) => `<div><h3>${esc(c.title)}</h3><p>${esc(c.body)}</p><p><strong>How Supreme Bot covers this:</strong> ${esc(c.supreme)}</p></div>`
  ).join("");
  const snapshot = `<div class="site prerender-content" style="max-width:72rem;margin:0 auto;padding:2rem;color:#c3c9d3;background:#16171b;font-family:system-ui,sans-serif">
    <h1>How to choose the best Discord ticket bot</h1>
    <p>${esc(d.answer)}</p>
    ${criteria}
    <section><h2>Other bots worth evaluating</h2><p>${esc(d.mentions)}</p></section>
  </div>`;
  let html = withHead(template, {
    title: d.title, description: d.description, path: d.path, lang: "en",
    keywords: ["best discord ticket bot", "discord ticket bot", "how to choose a discord bot", "supreme bot", "discord support tool", "carbon stealth"],
  });
  html = injectRoot(html, snapshot);
  writeRoute(d.path, html);
  count++;
}

{
  const d = GDPR_GUIDE;
  const sections = d.sections.map((s) => `<div><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p></div>`).join("");
  const snapshot = `<div class="site prerender-content" style="max-width:72rem;margin:0 auto;padding:2rem;color:#c3c9d3;background:#16171b;font-family:system-ui,sans-serif">
    <h1>GDPR &amp; EU hosting for Discord communities</h1>
    <p>${esc(d.answer)}</p>
    ${sections}
    <p><small>${esc(d.disclaimer)}</small></p>
  </div>`;
  let html = withHead(template, {
    title: d.title, description: d.description, path: d.path, lang: "en",
    keywords: ["gdpr discord bot", "eu hosted discord bot", "discord data residency", "supreme bot", "discord dpa", "carbon stealth"],
  });
  html = injectRoot(html, snapshot);
  writeRoute(d.path, html);
  count++;
}

{
  const d = PANEL_SETUP_GUIDE;
  const optRows = (rows) => rows.map(
    (r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.body)}</td><td>${esc(r.values)}</td></tr>`
  ).join("");
  const layouts = d.layoutModes.map((m) => `<div><h3>${esc(m.name)}</h3><p>${esc(m.body)}</p></div>`).join("");
  const limits = d.limits.map(([c, v]) => `<tr><td>${esc(c)}</td><td>${esc(v)}</td></tr>`).join("");
  const snapshot = `<div class="site prerender-content" style="max-width:72rem;margin:0 auto;padding:2rem;color:#c3c9d3;background:#16171b;font-family:system-ui,sans-serif">
    <h1>Ticket panel &amp; button setup</h1>
    <p>${esc(d.answer)}</p>
    <section><h2>The panel message</h2><table><thead><tr><th>Option</th><th>What it does</th><th>Values</th></tr></thead><tbody>${optRows(d.panelOptions)}</tbody></table></section>
    <section><h2>Layouts</h2>${layouts}</section>
    <section><h2>Button options</h2><table><thead><tr><th>Option</th><th>What it does</th><th>Values</th></tr></thead><tbody>${optRows(d.buttonOptions)}</tbody></table></section>
    <section><h2>Close, claim &amp; the other actions are automatic</h2><p>${esc(d.inTicketButtons)}</p></section>
    <section><h2>Limits</h2><table><tbody>${limits}</tbody></table></section>
  </div>`;
  let html = withHead(template, {
    title: d.title, description: d.description, path: d.path, lang: "en",
    keywords: ["discord ticket panel", "ticket panel setup", "discord ticket bot buttons", "supreme bot", "discord support tool", "carbon stealth"],
  });
  html = injectRoot(html, snapshot);
  writeRoute(d.path, html);
  count++;
}

// 4б) /features + /features/* — по една страница за функция, която хората
//     търсят като отделен бот. Данни: src/data/featurePages.js (СЪЩИЯТ обект,
//     който рендерира FeaturePage.jsx). Снимката е пълна: отговор отпред, стъпки
//     като <ol>, Free/Premium като <table>, FAQ като H3/P, свързани връзки —
//     обхождач без JavaScript получава всичко цитируемо; JSON-LD (WebPage +
//     BreadcrumbList + FAQPage) влиза в <head>.
function featureSnapshot(p) {
  const steps = p.steps.map((s) => `<li><strong>${esc(s.title)}.</strong> ${esc(s.body)}</li>`).join("");
  const tiers = p.tiers.map(([c, f, pr]) => `<tr><td>${esc(c)}</td><td>${esc(f)}</td><td>${esc(pr)}</td></tr>`).join("");
  const faq = p.faq.map((f) => `<div><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></div>`).join("");
  const related = p.related.map((r) => `<li><a href="${r}">${esc(r)}</a></li>`).join("");
  return `<div class="site prerender-content" style="max-width:72rem;margin:0 auto;padding:2rem;color:#c3c9d3;background:#16171b;font-family:system-ui,sans-serif">
    <nav><a href="/">Supreme Bot</a> / <a href="${FEATURES_HUB.path}">Features</a> / ${esc(p.nav)}</nav>
    <h1>${esc(p.h1)}</h1>
    <p>${esc(p.answer)}</p>
    <section><h2>How it works</h2><ol>${steps}</ol></section>
    <section><h2>Free vs Premium</h2><table><thead><tr><th>Capability</th><th>Free</th><th>Premium</th></tr></thead><tbody>${tiers}</tbody></table></section>
    <section><h2>Frequently asked questions</h2>${faq}</section>
    <section><h2>Related</h2><ul>${related}</ul></section>
  </div>`;
}

{
  const hubItems = FEATURE_PAGES.map(
    (p) => `<li><h2><a href="${p.path}">${esc(p.h1)}</a></h2><p>${esc(p.description)}</p></li>`
  ).join("");
  const hubSnapshot = `<div class="site prerender-content" style="max-width:72rem;margin:0 auto;padding:2rem;color:#c3c9d3;background:#16171b;font-family:system-ui,sans-serif">
    <h1>${esc(FEATURES_HUB.h1)}</h1>
    <p>${esc(FEATURES_HUB.answer)}</p>
    <ul>${hubItems}</ul>
  </div>`;
  let html = withHead(template, { title: FEATURES_HUB.title, description: FEATURES_HUB.description, path: FEATURES_HUB.path, lang: "en", keywords: FEATURES_HUB.keywords });
  html = injectHead(html, `  ${jsonLd(hubJsonLd())}`);
  html = injectRoot(html, hubSnapshot);
  writeRoute(FEATURES_HUB.path, html);
  count++;
  for (const p of FEATURE_PAGES) {
    let page = withHead(template, { title: p.title, description: p.description, path: p.path, lang: "en", keywords: p.keywords });
    page = injectHead(page, `  ${jsonLd(featureJsonLd(p))}`);
    page = injectRoot(page, featureSnapshot(p));
    writeRoute(p.path, page);
    count++;
  }
}

// 5) Legal / status routes — correct per-route head + a minimal heading so
//    crawlers don't index them all under the homepage title.
const STATIC_ROUTES = {
  "/status":        ["Service Status — Supreme Bot", "Real-time service status for Supreme Bot: uptime and component health for the database, Discord bot, API and web dashboard."],
  "/terms":         ["Terms of Service — Supreme Bot", "Terms of Service for Supreme Bot by Carbon Stealth VCC."],
  "/privacy":       ["Privacy Policy — Supreme Bot", "Privacy Policy for Supreme Bot: what data we process, legal bases, retention and your GDPR rights."],
  "/cookies":       ["Cookie Policy — Supreme Bot", "Cookie Policy for Supreme Bot: a single strictly-necessary session cookie and a consent record, no advertising or tracking."],
  "/eula":          ["End User License Agreement — Supreme Bot", "End User License Agreement (EULA) for Supreme Bot by Carbon Stealth VCC."],
  "/accessibility": ["Accessibility Statement — Supreme Bot", "Accessibility Statement for Supreme Bot: our WCAG 2.1 AA / EN 301 549 commitment and how to report issues."],
};
for (const [path, [title, description]] of Object.entries(STATIC_ROUTES)) {
  let html = withHead(template, { title, description, path, lang: "en" });
  html = injectRoot(html, `<div class="site prerender-content" style="max-width:48rem;margin:0 auto;padding:2rem;color:#c3c9d3;background:#16171b;font-family:system-ui,sans-serif"><h1>${esc(title)}</h1><p>${esc(description)}</p></div>`);
  writeRoute(path, html);
  count++;
}

console.log(`[prerender] ✅ wrote ${count} static route(s) under dist/`);
