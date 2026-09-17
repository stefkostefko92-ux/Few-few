// build.test.mjs — гейтът на портфолиото. Проверява НЕ „изглежда ли добре", а това, което е проверимо:
// паритет на езиците, SEO инварианти на всяка страница, законът за ключовите думи, цените ≥15% под пазара.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../build.mjs";
import { I18N } from "../src/i18n/index.mjs";
import { DEMOS } from "../src/demos/index.mjs";
import { WIDGET_KINDS } from "../src/templates/widgets.mjs";
import { DEMO_ICONS } from "../src/templates/icons.mjs";
import { TIERS, ADDONS, MIN_DISCOUNT, discountPct, SOURCES } from "../src/pricing.mjs";
import { LANGS } from "../src/lib/html.mjs";

const OUT = join(fileURLToPath(new URL("..", import.meta.url)), ".tmp-test-dist");
build({ out: OUT, quiet: true });

const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const pages = walk(OUT).filter((p) => p.endsWith(".html") && !p.endsWith("404.html") && p !== join(OUT, "index.html"));
const keys = (o, pre = "") => Object.keys(o).flatMap((k) => (o[k] && typeof o[k] === "object" && !Array.isArray(o[k]) ? keys(o[k], `${pre}${k}.`) : [`${pre}${k}`]));

test("i18n: en и it имат точно ключовете на bg (източникът на истината)", () => {
  const ref = keys(I18N.bg).sort();
  for (const l of ["en", "it"]) assert.deepEqual(keys(I18N[l]).sort(), ref, `разминаване в ${l}`);
});

test("демота: 10, уникални id/слъгове, всеки език с еднаква структура, валиден widget/икона", () => {
  assert.equal(DEMOS.length, 10);
  const ids = new Set(DEMOS.map((d) => d.id));
  assert.equal(ids.size, 10);
  for (const l of LANGS) assert.equal(new Set(DEMOS.map((d) => d.slug[l])).size, 10, `дублиран слъг в ${l}`);
  for (const d of DEMOS) {
    const ref = keys(d.t.bg).sort();
    for (const l of ["en", "it"]) assert.deepEqual(keys(d.t[l]).sort(), ref, `${d.id}: структура на ${l} ≠ bg`);
    for (const l of LANGS) {
      assert.ok(WIDGET_KINDS.includes(d.t[l].hero.widget.kind), `${d.id}/${l}: widget kind`);
      assert.ok(d.keywords[l].length >= 4, `${d.id}/${l}: ключови думи`);
      assert.equal(d.t[l].services.length, 6); assert.equal(d.t[l].faq.length, 5); assert.equal(d.t[l].reviews.length, 3);
    }
    assert.ok(DEMO_ICONS[d.icon], `${d.id}: икона`);
    assert.ok(d.theme.word && d.theme.fonts.length === 2 && d.theme.heroStyle, `${d.id}: тема`);
  }
});

test("всяка страница: един h1, title ≤60, description ≤160, canonical, hreflang ×3 + x-default, ключови думи, футър-кредит", () => {
  assert.equal(pages.length, 3 * (10 + 3));
  for (const p of pages) {
    const html = readFileSync(p, "utf8"), rel = p.slice(OUT.length);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${rel}: h1`);
    const un = (x) => x.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, "\"");
    const title = un(html.match(/<title>([^<]+)<\/title>/)[1]);
    assert.ok(title.length <= 60, `${rel}: title ${title.length} знака: ${title}`);
    const desc = un(html.match(/name="description" content="([^"]+)"/)[1]);
    assert.ok(desc.length <= 160 && desc.length >= 70, `${rel}: description ${desc.length} знака`);
    assert.ok(/<link rel="canonical" href="https:\/\/portfolio\.carbonstealth\.eu\/(bg|en|it)\//.test(html), `${rel}: canonical`);
    for (const l of [...LANGS, "x-default"]) assert.ok(html.includes(`hreflang="${l}"`), `${rel}: hreflang ${l}`);
    const kw = html.match(/name="keywords" content="([^"]+)"/)[1].split(",").map((s) => s.trim());
    assert.ok(kw.length >= 5 && kw.includes("Carbon Stealth"), `${rel}: keywords`);
    assert.ok(html.includes('href="https://carbonstealth.eu" target="_blank" rel="noopener"'), `${rel}: кредит на Carbon Stealth`);
    assert.ok(!/lorem ipsum/i.test(html), `${rel}: lorem ipsum`);
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => JSON.parse(m[1]), `${rel}: невалиден JSON-LD`);
    assert.ok(/<html lang="(bg|en|it)">/.test(html), `${rel}: lang`);
  }
});

test("цени: всеки пакет и добавка е поне 15% под пазарната референция; източниците са реални URL", () => {
  for (const t of [...TIERS, ...ADDONS]) assert.ok(1 - t.price / t.market >= MIN_DISCOUNT, `${t.id}: ${discountPct(t)}% < ${MIN_DISCOUNT * 100}%`);
  assert.ok(SOURCES.length >= 8);
  for (const s of SOURCES) assert.ok(/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\//.test(s.url), s.url);
  assert.ok(TIERS.filter((t) => t.popular).length === 1, "точно един „най-избиран“ пакет");
});

test("страницата с цени носи reverse charge за ЕС фирми на трите езика и числата от pricing.mjs", () => {
  for (const l of LANGS) {
    const html = readFileSync(join(OUT, I18N[l].code, { bg: "ceni", en: "pricing", it: "prezzi" }[l], "index.html"), "utf8");
    assert.ok(/reverse charge/i.test(html), `${l}: reverse charge`);
    assert.ok(html.includes("2006/112"), `${l}: Директива 2006/112`);
    for (const t of TIERS) assert.ok(html.includes(`id="${t.id}"`), `${l}: пакет ${t.id}`);
    assert.ok(html.includes("4 290"), `${l}: форматирана цена`);
  }
});

test("служебни файлове: sitemap с 39 URL и hreflang, robots сочи sitemap, llms.txt съдържа цените, security.txt", () => {
  const sm = readFileSync(join(OUT, "sitemap.xml"), "utf8");
  assert.equal((sm.match(/<loc>/g) || []).length, 39);
  assert.ok(sm.includes('hreflang="x-default"'));
  assert.ok(readFileSync(join(OUT, "robots.txt"), "utf8").includes("Sitemap: https://portfolio.carbonstealth.eu/sitemap.xml"));
  const llms = readFileSync(join(OUT, "llms.txt"), "utf8");
  assert.ok(llms.includes("reverse charge") && llms.includes("790 EUR"));
  assert.ok(readFileSync(join(OUT, ".well-known/security.txt"), "utf8").includes("Expires:"));
  assert.ok(readFileSync(join(OUT, "index.html"), "utf8").includes('hreflang="x-default" href="https://portfolio.carbonstealth.eu/bg/"'));
});
