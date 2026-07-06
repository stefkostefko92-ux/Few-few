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

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "..", "dist");
const SITE = "https://supreme.carbonstealth.eu";

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
function withHead(template, { title, description, path, lang }) {
  const url = `${SITE}${path}`;
  let h = template;
  h = replaceOnce(h, /<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`, "title");
  h = replaceOnce(h, /(<meta name="description" content=")[\s\S]*?("\s*\/>)/,
    `$1${esc(description)}$2`, "meta description");
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

// ─── content snapshot from a landing translation object ──────────────────────
function landingSnapshot(t) {
  const features = t.features.map(
    (f) => `<li><h3>${esc(f.title)}</h3><p>${esc(f.desc)}</p></li>`
  ).join("");
  const eu = t.euBullets.map((b) => `<li>${esc(b)}</li>`).join("");
  const faq = t.faq.map(
    (f) => `<div><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></div>`
  ).join("");
  const tier = (x) =>
    `<div><h3>${esc(x.name)} — ${esc(x.price)}</h3><ul>${
      x.bullets.map((b) => `<li>${esc(b)}</li>`).join("")
    }</ul></div>`;
  // Free-vs-Premium comparison as a real <table> so non-JS AEO crawlers can quote it.
  const compare = t.compare
    ? `<section><h2>${esc(t.compare.heading)}</h2><table><thead><tr><th>${esc(t.compare.colCap)}</th><th>${esc(t.compare.colFree)}</th><th>${esc(t.compare.colPremium)}</th></tr></thead><tbody>${
        t.compare.rows.map(([c, f, p]) => `<tr><td>${esc(c)}</td><td>${esc(f)}</td><td>${esc(p)}</td></tr>`).join("")
      }</tbody></table></section>`
    : "";
  return `<div class="prerender-content" style="max-width:72rem;margin:0 auto;padding:2rem;color:#c9c9c9;font-family:system-ui,sans-serif">
    <p>${esc(t.eyebrow)}</p>
    <h1>${esc(t.h1a)} ${esc(t.h1b)}</h1>
    <p>${esc(t.sub)}</p>
    <section><h2>${esc(t.featuresHeading)}</h2><p>${esc(t.featuresSub)}</p><ul>${features}</ul></section>
    <section><h2>${esc(t.euHeading)}</h2><ul>${eu}</ul></section>
    ${compare}
    <section><h2>${esc(t.faqHeading)}</h2>${faq}</section>
    <section><h2>${esc(t.pricingHeading)}</h2>${tier(t.tiers.free)}${tier(t.tiers.premium)}${tier(t.tiers.enterprise)}</section>
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
  html = injectHead(html, `  ${hreflangCluster()}\n  ${landingJsonLd(locale, t)}`);
  html = injectRoot(html, landingSnapshot(t));
  writeRoute(landingPath(locale), html);
  count++;
}

// 2) English root "/" — keep its rich @graph, add hreflang + crawlable snapshot.
//    The English answer-content is derived from the FAQPage already embedded in
//    the static @graph so the snapshot and structured data never drift.
{
  const faqMatch = template.match(/"@type":\s*"FAQPage"[\s\S]*?"mainEntity":\s*(\[[\s\S]*?\])\s*}/);
  let faqHtml = "";
  if (faqMatch) {
    try {
      const entities = JSON.parse(faqMatch[1]);
      faqHtml = entities.map(
        (q) => `<div><h3>${esc(q.name)}</h3><p>${esc(q.acceptedAnswer?.text || "")}</p></div>`
      ).join("");
    } catch { /* leave faqHtml empty if parsing fails */ }
  }
  // English answer-content for the x-default root. Kept at parity with the
  // localized snapshots (features + pricing + FAQ) so the most-important page
  // is not the thinnest for AEO crawlers. Features mirror the SoftwareApplication
  // featureList; pricing mirrors the enforced tiers (premium.js) and EUR offers.
  const EN_FEATURES = [
    ["Ticket system", "Unlimited tickets with button panels, claim, escalation, rename, two-step close and full HTML transcripts that survive channel deletion."],
    ["Forms & applications", "Multi-step questionnaires with validation, logic branching and an approve/deny review workflow — a full Appy.bot replacement."],
    ["Verification & anti-bot", "One-click button or math captcha, account-age requirements and brute-force protection."],
    ["Polls & giveaways", "Live polls (up to 9 options) and giveaways with role requirements, scheduled end and re-roll."],
    ["Automation", "Sticky messages and one-off or recurring (daily/weekly/monthly) scheduled messages."],
    ["AI auto-replies", "Optional first response powered by Anthropic Claude, with an EU AI Act Art. 50 disclosure."],
    ["Webhooks & API", "HMAC-signed webhook events and a public REST API with scoped bearer keys."],
    ["White-label bot", "Premium servers run their own branded bot with a custom token, encrypted with AES-256-GCM."],
  ];
  const featuresHtml = EN_FEATURES.map(([t, d]) => `<li><h3>${esc(t)}</h3><p>${esc(d)}</p></li>`).join("");
  const pricingHtml = `<div><h3>Free — €0</h3><ul><li>1 ticket panel</li><li>2 application forms (up to 5 questions each)</li><li>1 verification panel</li><li>Persistent transcripts (30-day retention)</li></ul></div>`
    + `<div><h3>Premium — €9.99 / server / month</h3><ul><li>Up to 50 panels, 50 forms, 50 questions each</li><li>AI auto-replies, round-robin assignment, white-label bot</li><li>Webhooks, advanced analytics, unlimited retention</li><li>14-day free trial, no credit card</li></ul></div>`
    + `<div><h3>Enterprise — custom</h3><ul><li>Everything in Premium</li><li>Custom branding and domain</li><li>Priority support and onboarding</li><li>Contact us for a quote</li></ul></div>`;
  // Free-vs-Premium comparison — the most AI-citable, answer-first content.
  // Rendered as a real <table> so non-JS AEO crawlers (ClaudeBot/GPTBot/Perplexity)
  // can quote it; the SPA replaces it on mount. Mirrors the visible CompareRow table.
  const compareRows = [
    ["Ticket panels", "1", "50"],
    ["Application forms", "2 (5 questions each)", "50 (50 questions each)"],
    ["Form logic", "—", "Conditional branching + regex validation"],
    ["Verification", "Button", "Button + math captcha + account-age gates"],
    ["Ticket workflow", "Basic", "Claim · escalate · rename · round-robin"],
    ["AI auto-replies", "—", "Claude-powered (assistive, human-in-the-loop)"],
    ["White-label bot", "—", "Your name, avatar and token"],
    ["Webhooks", "—", "20 HMAC-signed integrations"],
    ["Transcript retention", "30 days", "Unlimited"],
    ["Price", "€0 forever", "€9.99 / server / month · 14-day trial, no card"],
  ];
  const compareHtml = `<table><thead><tr><th>Capability</th><th>Free</th><th>Premium</th></tr></thead><tbody>${
    compareRows.map(([c, f, p]) => `<tr><td>${esc(c)}</td><td>${esc(f)}</td><td>${esc(p)}</td></tr>`).join("")
  }</tbody></table>`;
  const upsellPassage = "Free gets you running; Premium gets you scaling. The Free tier gives one ticket panel, two application forms and 30-day transcript retention — enough to run real support today at no cost. Premium (€9.99 per server per month, with a 14-day free trial and no credit card) raises the limits to 50 panels, 50 forms and 50 questions each, and unlocks Claude-powered AI auto-replies, round-robin assignment, conditional form logic, a white-label bot, 20 webhook integrations, advanced analytics and unlimited transcript retention. Billing is per server, so a small community can stay on Free while your main server runs Premium; cancel anytime and nothing is deleted.";
  const rootSnapshot = `<div class="prerender-content" style="max-width:72rem;margin:0 auto;padding:2rem;color:#c9c9c9;font-family:system-ui,sans-serif">
    <p>One bot replaces six. Built in the EU.</p>
    <h1>Supreme Bot — Discord Ticket Bot &amp; SaaS Platform</h1>
    <p>Six bots. Six bills. One dashboard. Tickets, applications, verification, giveaways, scheduled messages, webhooks and Claude-powered replies for Discord communities that outgrew a folder full of single-purpose bots. Multi-tenant Discord bot management by Carbon Stealth VCC — EU-hosted (Germany), GDPR-native.</p>
    <section><h2>Free vs Premium</h2><p>${upsellPassage}</p>${compareHtml}</section>
    <section><h2>Everything, integrated</h2><ul>${featuresHtml}</ul></section>
    <section><h2>Simple pricing, per server</h2>${pricingHtml}</section>
    <section><h2>Frequently asked questions</h2>${faqHtml}</section>
  </div>`;
  let html = injectHead(template, `  ${hreflangCluster()}`);
  html = injectRoot(html, rootSnapshot);
  writeRoute("/", html);
  count++;
}

// 3) Legal / status routes — correct per-route head + a minimal heading so
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
  html = injectRoot(html, `<div class="prerender-content" style="max-width:48rem;margin:0 auto;padding:2rem;color:#c9c9c9;font-family:system-ui,sans-serif"><h1>${esc(title)}</h1><p>${esc(description)}</p></div>`);
  writeRoute(path, html);
  count++;
}

console.log(`[prerender] ✅ wrote ${count} static route(s) under dist/`);
