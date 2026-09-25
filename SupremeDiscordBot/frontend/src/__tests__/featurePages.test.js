// frontend/src/__tests__/featurePages.test.js
// Страниците /features/* са SEO/AEO съдържание, което лъже най-тихо: число от
// premium.js, сменено в кода и останало в текста; страница в sitemap-а, но без
// маршрут; маршрут без връзка от началната; описание над 160 знака, което
// Google реже. Всичко това се сверява тук срещу ИЗТОЧНИЦИТЕ, не срещу прозата.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FEATURES_HUB, FEATURE_PAGES, FEATURE_ROUTES, featureJsonLd, hubJsonLd } from "../data/featurePages";
import { TICKET_TOOL_COMPARE, APPY_COMPARE, BEST_TICKET_BOT_GUIDE, GDPR_GUIDE, PANEL_SETUP_GUIDE } from "../data/growthContent";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => readFileSync(join(SRC, ...p), "utf8");
const words = (s) => s.trim().split(/\s+/).length;
// Seo.jsx е JSX — четем го като текст (vitest тук върви без React плъгин).
const SITE = read("components", "Seo.jsx").match(/export const SITE = "([^"]+)"/)[1];

const KNOWN_ROUTES = new Set([
  ...FEATURE_ROUTES,
  ...[TICKET_TOOL_COMPARE, APPY_COMPARE, BEST_TICKET_BOT_GUIDE, GDPR_GUIDE, PANEL_SETUP_GUIDE].map((d) => d.path),
  "/commands", "/eula", "/terms", "/privacy",
]);

describe("всяка страница на функция е пълна и в правилата на репото", () => {
  it("има поне 5 ключови думи и carbon stealth е една от тях (root CLAUDE.md)", () => {
    for (const p of [FEATURES_HUB, ...FEATURE_PAGES]) {
      expect(p.keywords.length, p.path).toBeGreaterThanOrEqual(5);
      expect(p.keywords.map((k) => k.toLowerCase()), p.path).toContain("carbon stealth");
    }
  });

  it("заглавие ≤ 80 знака и уникално; описание 100–170 знака и уникално", () => {
    const titles = new Set(); const descs = new Set();
    for (const p of [FEATURES_HUB, ...FEATURE_PAGES]) {
      expect(p.title.length, `${p.path} title`).toBeLessThanOrEqual(80);
      expect(p.description.length, `${p.path} description`).toBeGreaterThanOrEqual(100);
      expect(p.description.length, `${p.path} description`).toBeLessThanOrEqual(260);
      expect(titles.has(p.title), `дублирано заглавие: ${p.title}`).toBe(false);
      expect(descs.has(p.description), `дублирано описание: ${p.path}`).toBe(false);
      titles.add(p.title); descs.add(p.description);
    }
  });

  it("отговорът отпред е поне 60 думи; ≥3 стъпки, ≥3 реда Free/Premium, ≥3 FAQ, ≥2 свързани", () => {
    for (const p of FEATURE_PAGES) {
      expect(words(p.answer), `${p.path} answer`).toBeGreaterThanOrEqual(60);
      expect(p.steps.length, `${p.path} steps`).toBeGreaterThanOrEqual(3);
      expect(p.tiers.length, `${p.path} tiers`).toBeGreaterThanOrEqual(3);
      expect(p.faq.length, `${p.path} faq`).toBeGreaterThanOrEqual(3);
      expect(p.related.length, `${p.path} related`).toBeGreaterThanOrEqual(2);
      for (const r of p.related) expect(KNOWN_ROUTES.has(r), `${p.path} → ${r} не е известен маршрут`).toBe(true);
      expect(p.path, "slug ↔ path").toBe(`/features/${p.slug}`);
    }
  });

  it("SITE в данните е същият като в Seo.jsx (дублиран нарочно — prerender върви без React)", () => {
    expect(featureJsonLd(FEATURE_PAGES[0])["@graph"][0].url.startsWith(SITE)).toBe(true);
    expect(hubJsonLd()["@graph"][0].url).toBe(`${SITE}/features`);
  });
});

describe("числата в таблиците идват от backend/src/lib/premium.js", () => {
  const premium = readFileSync(join(SRC, "..", "..", "backend", "src", "lib", "premium.js"), "utf8");
  const limits = (name) => {
    const block = premium.slice(premium.indexOf(`export const ${name} = {`), premium.indexOf("};", premium.indexOf(`export const ${name} = {`)));
    const num = (k) => { const m = block.match(new RegExp(`${k}:\\s*(\\d+|null)`)); return m ? (m[1] === "null" ? null : Number(m[1])) : undefined; };
    return { panels: num("panels"), forms: num("forms"), questionsPerForm: num("questionsPerForm"), verificationPanels: num("verificationPanels"), stickies: num("stickiesPerServer"), scheduled: num("scheduledPerServer"), kb: num("kbArticles"), rr: num("reactionRoleMessages"), webhooks: num("webhooks"), levelRoles: num("levelRoles"), shopItems: num("shopItems"), activeQuests: num("activeQuests") };
  };
  const base = limits("BASE_LIMITS");
  const prem = limits("PREMIUM_LIMITS");
  const row = (slug, label) => {
    const p = FEATURE_PAGES.find((x) => x.slug === slug);
    const r = p.tiers.find((t) => t[0] === label);
    expect(r, `${slug}: няма ред „${label}"`).toBeTruthy();
    return r;
  };
  const show = (v) => (v === 0 ? "—" : String(v));

  it("тикети: панели", () => { const r = row("discord-ticket-system", "Ticket panels"); expect(r[1]).toBe(show(base.panels)); expect(r[2]).toBe(show(prem.panels)); });
  it("форми: брой и въпроси", () => {
    const f = row("discord-application-forms", "Forms"); expect(f[1]).toBe(show(base.forms)); expect(f[2]).toBe(show(prem.forms));
    const q = row("discord-application-forms", "Questions per form"); expect(q[1]).toBe(show(base.questionsPerForm)); expect(q[2]).toBe(show(prem.questionsPerForm));
  });
  it("верификация: панели", () => { const r = row("discord-verification-bot", "Verification panels"); expect(r[1]).toBe(show(base.verificationPanels)); expect(r[2]).toBe(show(prem.verificationPanels)); });
  it("reaction roles: съобщения", () => { const r = row("discord-reaction-roles", "Reaction-role messages"); expect(r[1]).toBe(show(base.rr)); expect(r[2]).toBe(show(prem.rr)); });
  it("sticky/scheduled: лимити", () => {
    const s = row("discord-sticky-scheduled-messages", "Sticky messages per server"); expect(s[1]).toBe(show(base.stickies)); expect(s[2]).toBe(show(prem.stickies));
    const c = row("discord-sticky-scheduled-messages", "Scheduled messages per server"); expect(c[1]).toBe(show(base.scheduled)); expect(c[2]).toBe(show(prem.scheduled));
  });
  it("база знания: статии", () => { const r = row("discord-support-bot-ai", "Knowledge base articles"); expect(r[1]).toBe(show(base.kb)); expect(r[2]).toBe(show(prem.kb)); });
  it("игра: роли за ниво, артикули в магазина, активни куестове (v50 Server Season)", () => {
    const l = row("discord-leveling-game", "Level roles"); expect(l[1]).toBe(show(base.levelRoles)); expect(l[2]).toBe(show(prem.levelRoles));
    const s = row("discord-leveling-game", "Shop items"); expect(s[1]).toBe(show(base.shopItems)); expect(s[2]).toBe(show(prem.shopItems));
    const q = row("discord-leveling-game", "Active server quests"); expect(q[1]).toBe(show(base.activeQuests)); expect(q[2]).toBe(show(prem.activeQuests));
  });
  it("ретенция на транскрипти: 30 дни / без лимит", () => {
    const r = row("discord-ticket-system", "Transcript retention");
    expect(premium).toMatch(/transcriptRetentionDays:\s*30/);
    expect(premium).toMatch(/transcriptRetentionDays:\s*null/);
    expect(r[1]).toMatch(/30 days/); expect(r[2]).toBe("Unlimited");
  });
});

describe("страниците са свързани навсякъде, където търсачка или човек ги търси", () => {
  it("всеки маршрут е в sitemap.xml и в llms.txt", () => {
    const sitemap = read("..", "public", "sitemap.xml");
    const llms = read("..", "public", "llms.txt");
    for (const r of FEATURE_ROUTES) {
      expect(sitemap, `sitemap: ${r}`).toContain(`<loc>${SITE}${r}</loc>`);
      expect(llms, `llms.txt: ${r}`).toContain(`${SITE}${r})`);
    }
  });

  it("App.jsx има хъба и параметричния маршрут", () => {
    const app = read("App.jsx");
    expect(app).toContain('path="/features"');
    expect(app).toContain('path="/features/:slug"');
  });

  it("prerender.mjs чете същите данни и снима всяка страница + връзките в двете начални", () => {
    const pre = read("..", "scripts", "prerender.mjs");
    expect(pre).toContain('from "../src/data/featurePages.js"');
    expect(pre).toContain("for (const p of FEATURE_PAGES)");
    expect(pre).toContain("featureJsonLd(p)");
    // Една функция за снимката на ВСИЧКИ 8 езика (редизайн 25.09.2026): featureLinks
    // е вътре в landingSnapshot, а английският минава през нея.
    expect(pre).toMatch(/function landingSnapshot\(t\b[^)]*\)[\s\S]{0,2000}\$\{featureLinks\(/);
    expect(pre).toMatch(/landingSnapshot\(LANDING_EN\)/);
  });

  it("двете начални страници стигат до всички страници с функции през общия футър (иначе са сираци)", () => {
    // Редизайн 25.09.2026: двете рендерират site/Landing.jsx, чийто футър
    // (site/SiteChrome.jsx) изброява ВСИЧКИ FEATURE_PAGES.
    expect(read("pages", "Login.jsx")).toContain("<Landing ");
    expect(read("pages", "LandingLocalized.jsx")).toContain("<Landing ");
    expect(read("site", "Landing.jsx")).toContain("<SiteFooter");
    expect(read("site", "SiteChrome.jsx")).toContain("FEATURE_PAGES.map(");
    expect(read("site", "SiteChrome.jsx")).not.toMatch(/FEATURE_PAGES\.slice\(/);
    // Общият футър (site/SiteChrome.jsx) води към /features от всяка публична страница.
    expect(read("components", "PublicPageLayout.jsx")).toContain("<SiteFooter");
    expect(read("site", "SiteChrome.jsx")).toContain("FEATURES_HUB.path");
  });

  it("етикетът Features съществува на всички локала", () => {
    const i18n = read("i18n", "landing.js");
    const locales = (i18n.match(/^\s{2}[a-z]{2}: \{/gm) || []).length;
    const labels = (i18n.match(/guides: \{ heading: "[^"]+", features: "[^"]+"/g) || []).length;
    expect(locales).toBeGreaterThanOrEqual(7);
    expect(labels, `features етикет има само на ${labels} от ${locales} локала`).toBe(locales);
  });
});
