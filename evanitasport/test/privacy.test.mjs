// Поверителност на evanita-bg.com (собственикът, 24.11.2026): нито един ресурс на трета страна при
// зареждане — шрифтовете са при нас, картата на Google се зарежда едва след клик — и страница за
// поверителност с реалните данни от сайта. Без зависимости: node --test evanitasport/test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const PAGES = ["index.html", "404.html", "poveritelnost.html"];

test("нито една страница не тегли шрифтове от Google", () => {
  for (const p of PAGES) {
    const h = read(p);
    assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(h), `${p}: Google Fonts`);
  }
});

test("шрифтовете са при нас: @font-face за Onest и Cormorant Garamond, файловете съществуват", () => {
  const css = read("css/style.css");
  for (const fam of ["Onest", "Cormorant Garamond"]) {
    assert.match(css, new RegExp(`@font-face\\s*\\{[^}]*font-family:\\s*['"]${fam}['"]`), fam);
  }
  const urls = [...css.matchAll(/url\(["']?(\/fonts\/[^"')]+\.woff2)["']?\)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 6, `очаквах ≥6 woff2, има ${urls.length}`);
  for (const u of urls) assert.ok(existsSync(join(ROOT, u)), `липсва ${u}`);
});

test("картата не се зарежда при отваряне — iframe се появява едва след клик", () => {
  const h = read("index.html");
  assert.ok(!/<iframe\b[^>]*\bsrc=/.test(h), "iframe със src в HTML-а");
  assert.match(h, /<button[^>]*data-map-src="https:\/\/maps\.google\.com\/maps\?[^"]*output=embed"/);
  assert.match(h, /href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=42\.2597447,23\.1238442"/, "алтернатива без вграждане");
  const js = read("js/main.js");
  assert.match(js, /data-map-src/);
  assert.match(js, /createElement\(['"]iframe['"]\)/);
});

test("страницата за поверителност носи реалните данни и всичко, което сайтът обработва", () => {
  const h = read("poveritelnost.html");
  for (const s of ["Еванита Спорт ЕООД", "ул. Рилски Езера 1, 2600 Дупница", "+359 88 504 5112", "netcup", "Google", "Viber", "Facebook", "Комисия за защита на личните данни", "бисквитки"]) {
    assert.ok(h.includes(s), `липсва „${s}“`);
  }
  assert.match(h, /<meta name="keywords" content="[^"]*Carbon Stealth[^"]*"/);
  assert.match(h, /<link rel="canonical" href="https:\/\/evanita-bg\.com\/poveritelnost\.html"/);
});

test("връзка „Поверителност“ от началната и от 404, страницата е в sitemap и в деплоя", () => {
  assert.match(read("index.html"), /<a href="\/?poveritelnost\.html">Поверителност<\/a>/);
  assert.match(read("404.html"), /href="\/poveritelnost\.html"/);
  assert.match(read("sitemap.xml"), /<loc>https:\/\/evanita-bg\.com\/poveritelnost\.html<\/loc>/);
  const dep = read("deploy.sh");
  assert.match(dep, /\bpoveritelnost\.html\b/);
  assert.match(dep, /\bfonts\b/);
});

test("CSP: шрифтове само от нас, без Google Fonts; картата остава позволена във frame-src", () => {
  const csp = (read("nginx.conf").match(/Content-Security-Policy "([^"]+)"/) || [])[1] || "";
  assert.match(csp, /font-src 'self'/);
  assert.ok(!/googleapis|gstatic/.test(csp), "Google Fonts в CSP");
  assert.match(csp, /frame-src https:\/\/maps\.google\.com/);
});
