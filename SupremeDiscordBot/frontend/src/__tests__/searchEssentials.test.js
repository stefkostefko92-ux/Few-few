// frontend/src/__tests__/searchEssentials.test.js
// Google Search Essentials — гейтове от SEO одита на 22.10.2026 (обхождане на
// живия сайт с Googlebot UA). Проверява ГЕНЕРАТОРИТЕ (index.html, prerender.mjs,
// React страниците), защото тестовете тичат преди билда; изходът в dist/ се
// проверява от самия prerender.mjs (секция „gates“) и спира билда при дефект.
//
// Намерено на живо:
//  1) по ДВА <h1> на всяка от 34-те страници — <noscript> блокът в шаблона
//     носеше свой h1 до този от пререндерираната снимка;
//  2) FAQPage в шаблона с осем въпроса, различни от деветте, които Login.jsx
//     показва — и копиран във ВСЯКА страница (/terms, /bg, /features/…);
//  3) LocalBusiness ×2 (+ ProfessionalService) за онлайн SaaS без място,
//     което клиентите посещават;
//  4) маршрутният JSON-LD два пъти в рендерирания DOM (статичен + Seo.jsx).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EN_LANDING_FAQ } from "../data/landingFaqEn.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => readFileSync(join(SRC, ...p), "utf8");
const indexHtml = readFileSync(join(SRC, "..", "index.html"), "utf8");
const prerender = readFileSync(join(SRC, "..", "scripts", "prerender.mjs"), "utf8");

const staticGraph = () => {
  const m = indexHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  expect(m, "index.html няма JSON-LD блок").toBeTruthy();
  return JSON.parse(m[1])["@graph"];
};
const typesOf = (n) => [].concat(n["@type"]);

describe("един <h1> на страница", () => {
  it("шаблонът index.html няма собствен <h1> (единственият идва от снимката в #root)", () => {
    expect(indexHtml.match(/<h1[\s>]/gi) || []).toEqual([]);
  });

  it("всяка снимка в prerender.mjs има точно едно <h1>", () => {
    // Всеки шаблонен низ, който започва с `<div class="prerender-content"`.
    const snaps = [...prerender.matchAll(/`<div class="prerender-content"[\s\S]*?<\/div>`/g)].map((m) => m[0]);
    expect(snaps.length, "не намирам снимките — тестът е сляп").toBeGreaterThanOrEqual(8);
    for (const s of snaps) expect((s.match(/<h1[\s>]/g) || []).length, s.slice(0, 120)).toBe(1);
  });
});

describe("структурираните данни съвпадат с видимото съдържание", () => {
  it("нула LocalBusiness / ProfessionalService — Supreme Bot е онлайн SaaS", () => {
    const LB = ["LocalBusiness", "ProfessionalService", "Store", "OpeningHoursSpecification"];
    for (const n of staticGraph()) {
      for (const t of typesOf(n)) expect(LB, `${n["@id"]}: ${t}`).not.toContain(t);
    }
    expect(indexHtml).not.toMatch(/openingHoursSpecification/i);
  });

  it("шаблонът няма FAQPage — той е само на „/“ и идва от видимия списък", () => {
    expect(staticGraph().some((n) => typesOf(n).includes("FAQPage"))).toBe(false);
    expect(prerender).toContain('from "../src/data/landingFaqEn.js"');
    expect(prerender).toMatch(/"@type": "FAQPage",\s*"@id": `\$\{SITE\}\/#faq`,[\s\S]{0,80}mainEntity: EN_LANDING_FAQ\.map/);
  });

  it("Login.jsx рендерира FAQ от СЪЩИЯ списък, без втори ръчен вариант", () => {
    const login = read("pages", "Login.jsx");
    expect(login).toContain('from "../data/landingFaqEn"');
    expect(login).toMatch(/EN_LANDING_FAQ\.map\(/);
    expect(login, "останал ръчно написан въпрос").not.toMatch(/<FaqItem\s+q="/);
    expect(EN_LANDING_FAQ.length).toBeGreaterThanOrEqual(5);
    for (const { q, a } of EN_LANDING_FAQ) {
      expect(q.trim().length && a.trim().length, q).toBeTruthy();
    }
  });

  it("възлите, които prerender пренася на другите страници, съществуват в шаблона", () => {
    const ids = new Set(staticGraph().map((n) => n["@id"]));
    for (const id of ["https://carbonstealth.eu/#organization", "https://supremebot.carbonstealth.eu/#website",
                      "https://supremebot.carbonstealth.eu/#software", "https://supremebot.carbonstealth.eu/#service"]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("адресът в Organization е регистрираният адрес, който футърът показва", () => {
    const org = staticGraph().find((n) => n["@id"] === "https://carbonstealth.eu/#organization");
    expect(org.address.streetAddress).toBe("ul. Samuil 3");
    expect(read("pages", "Login.jsx")).toContain("ul. Samuil 3, 2670 Bobov dol");
  });
});

describe("маршрутният JSON-LD не се дублира в рендерирания DOM", () => {
  it("prerender маркира блока със същото id, по което Seo.jsx го намира и подменя", () => {
    const seo = read("components", "Seo.jsx");
    const seoId = seo.match(/const ID = "([^"]+)"/)?.[1];
    expect(seoId).toBeTruthy();
    expect(prerender).toContain(`const ROUTE_JSONLD_ID = "${seoId}";`);
    expect(seo).toMatch(/document\.getElementById\(ID\)/);
    // Страниците, които подават jsonLd на <Seo>, минават през routeJsonLd в prerender.
    expect(prerender).toContain("routeJsonLd(featureJsonLd(p))");
    expect(prerender).toContain("routeJsonLd(hubJsonLd())");
    expect(prerender).toMatch(/function landingJsonLd[\s\S]{0,200}return routeJsonLd\(/);
  });
});

describe("страницата за 404", () => {
  it("prerender пише dist/404.html с noindex, без canonical и без JSON-LD", () => {
    expect(prerender).toContain('writeFileSync(join(DIST, "404.html")');
    const block = prerender.slice(prerender.indexOf("// 6) dist/404.html"), prerender.indexOf('writeFileSync(join(DIST, "404.html")'));
    expect(block).toContain("withSiteGraph(template, [])");
    expect(block).toMatch(/noindex, follow/);
    expect(block).toMatch(/404 canonical/);
  });

  it("вътрешните връзки не водят към несъществуващи маршрути", () => {
    // /pricing никога не е съществувал (цените са секция #pricing на „/“); с
    // истинския 404 такава връзка вече е твърд 404 за потребителя и за Google.
    for (const f of ["TermsPage.jsx", "PrivacyPage.jsx", "EulaPage.jsx", "CookiesPage.jsx", "NotFoundPage.jsx"]) {
      expect(read("pages", f), f).not.toMatch(/href="\/pricing"/);
    }
  });
});
