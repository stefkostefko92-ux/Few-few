// build.test.mjs — гейтът на портфолиото. Проверява НЕ „изглежда ли добре", а това, което е проверимо:
// паритет на езиците, SEO инварианти на всяка страница, законът за ключовите думи, цените ≥15% под пазара.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../build.mjs";
import { I18N } from "../src/i18n/index.mjs";
import { DEMOS } from "../src/demos/index.mjs";
import { WIDGET_KINDS } from "../src/templates/widgets.mjs";
import { DEMO_ICONS } from "../src/templates/icons.mjs";
import { TIERS, ADDONS, MIN_DISCOUNT, discountPct, SOURCES, shown, shownMarket, money, tx, VAT_CONVENTION } from "../src/pricing.mjs";
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

test("ДДС конвенцията е тази на carbonstealth.eu (cs-revolution/src/pricing.json @ c841100e4): BG бруто, EN/IT нето ÷1,20, пазар за BG ×1,20", () => {
  // Числата са преписани от pricing.json на сайта — ако някой смени конвенцията само на едното място, тестът пада.
  const site = {
    tiers: { start: { it: 658, en: 658, bg: 790 }, business: { it: 1575, en: 1575, bg: 1890 }, premium: { it: 3575, en: 3575, bg: 4290 }, ecommerce: { it: 1825, en: 1825, bg: 2190 } },
    market: { start: 1140, business: 2760, premium: 6240, ecommerce: 3120 },
    addons: { language: { net: 292, bg: 350, mbg: 600 }, page: { net: 100, bg: 120, mbg: 180 }, logo: { net: 325, bg: 390, mbg: 576 }, copy: { net: 75, bg: 90, mbg: 132 }, maintenance: { net: 58, bg: 69, mbg: 102 }, seo: { net: 242, bg: 290, mbg: 420 }, hosting: { net: 13, bg: 15, mbg: 23 } },
    discount: { start: 16, business: 17, premium: 17, ecommerce: 15, language: 30, page: 19, logo: 18, copy: 18, maintenance: 18, seo: 17, hosting: 21 },
  };
  assert.deepEqual(VAT_CONVENTION, { bg: "gross", en: "net", it: "net" });
  for (const t of TIERS) { for (const l of LANGS) assert.equal(shown(t.price, l), site.tiers[t.id][l], `${t.id}/${l}`); assert.equal(shownMarket(t.market, "bg"), site.market[t.id], `${t.id}: пазар BG`); assert.equal(shownMarket(t.market, "en"), t.market); assert.equal(discountPct(t), site.discount[t.id]); }
  for (const a of ADDONS) { assert.equal(shown(a.price, "en"), site.addons[a.id].net, a.id); assert.equal(shown(a.price, "it"), site.addons[a.id].net); assert.equal(shown(a.price, "bg"), site.addons[a.id].bg); assert.equal(shownMarket(a.market, "bg"), site.addons[a.id].mbg); assert.equal(discountPct(a), site.discount[a.id]); }
  assert.equal(money(1890, "bg"), "1\u202F890 €"); assert.equal(money(1575, "en"), "1,575 €"); assert.equal(money(1575, "it"), "1.575 €");
  assert.equal(tx("{start}/{hourly}", "en"), "658/45"); assert.equal(tx("{start}/{hourly}", "bg"), "790/54");
});

test("страницата с цени: reverse charge + Директива 2006/112 на трите езика, цените по ДДС конвенцията (BG „с включен 20% ДДС“, EN/IT „excl. VAT / IVA esclusa“), хъбът и llms.txt със същите числа", () => {
  const vatText = { bg: "с включен 20% ДДС", en: "Prices exclude VAT", it: "Prezzi IVA esclusa" };
  for (const l of LANGS) {
    const html = readFileSync(join(OUT, I18N[l].code, { bg: "ceni", en: "pricing", it: "prezzi" }[l], "index.html"), "utf8");
    assert.ok(/reverse charge/i.test(html), `${l}: reverse charge`);
    assert.ok(html.includes("2006/112"), `${l}: Директива 2006/112`);
    assert.ok(html.includes(vatText[l]), `${l}: ДДС текст „${vatText[l]}“`);
    for (const t of TIERS) { assert.ok(html.includes(`id="${t.id}"`), `${l}: пакет ${t.id}`); assert.ok(html.includes(`<strong>${money(shown(t.price, l), l)}</strong>`), `${l}: ${t.id} = ${money(shown(t.price, l), l)}`); assert.ok(html.includes(`<s>${money(shownMarket(t.market, l), l)}</s>`), `${l}: пазар ${t.id}`); }
    for (const a of ADDONS) assert.ok(html.includes(`<strong>${money(shown(a.price, l), l)}</strong>`), `${l}: добавка ${a.id}`);
    assert.ok(!/\{(start|business|premium|ecommerce|hosting|hourly)\}/.test(html), `${l}: непопълнен плейсхолдър`);
    assert.ok(html.includes(`"valueAddedTaxIncluded":${VAT_CONVENTION[l] === "gross"}`), `${l}: JSON-LD valueAddedTaxIncluded`);
    const hub = readFileSync(join(OUT, I18N[l].code, "index.html"), "utf8");
    assert.ok(hub.includes(`${money(shown(790, l), l)}`), `${l}: хъбът показва ${money(shown(790, l), l)}`);
    assert.ok(!/\{(start|business)\}/.test(hub), `${l}: хъб плейсхолдър`);
  }
});

test("шрифтовете са самостоятелно хостнати: нула заявки към Google Fonts, всеки font CSS и woff2 съществува", () => {
  for (const p of pages) {
    const html = readFileSync(p, "utf8"), rel = p.slice(OUT.length);
    assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(html), `${rel}: Google Fonts`);
    const cssLinks = [...html.matchAll(/href="(\/assets\/fonts\/[a-z0-9-]+\.css)"/g)].map((m) => m[1]);
    assert.ok(cssLinks.length >= 1, `${rel}: няма локален font CSS`);
    for (const c of cssLinks) {
      const css = readFileSync(join(OUT, c), "utf8");
      for (const m of css.matchAll(/url\((\/fonts\/[^)]+\.woff2)\)/g)) assert.ok(existsSync(join(OUT, m[1])), `${c}: липсва ${m[1]}`);
    }
  }
});

test("снимки: без public/img демото пада на генеративната графика (нула hero-bg/gallery), а картата в credits.json е незадължителна", () => {
  const html = readFileSync(join(OUT, "bg/demo/avtoservis/index.html"), "utf8");
  const hasPhotos = existsSync(join(fileURLToPath(new URL("..", import.meta.url)), "public/img/avtoservis/credits.json"));
  assert.equal(/class="hero-bg"/.test(html), hasPhotos);
  assert.equal(/id="gallery"/.test(html), hasPhotos);
  assert.ok(/data-widget="booking"/.test(html) && /<select name="service"/.test(html), "hero формата за резервация е реална форма");
});

test("логото на Carbon Stealth VCC е навсякъде: lockup в nav/footer, знак в boot/демо лентата/root, favicon.ico + icon-192 + apple-touch, og.png, Organization.logo — всички файлове съществуват", () => {
  const dist = OUT;
  for (const f of ["logo.png", "logo.webp", "logo-square.png", "logo-square.webp", "mark.png", "mark.webp", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "favicon.ico", "og.png"]) assert.ok(existsSync(join(dist, f)), f);
  assert.ok(!existsSync(join(dist, "favicon.svg")), "favicon.svg е заменен от favicon.ico");
  const rd = (p) => readFileSync(join(OUT, p), "utf8");
  const hub = rd("bg/index.html"), demo = rd("bg/demo/avtoservis/index.html"), root = rd("index.html"), nf = rd("404.html");
  for (const html of [hub, demo, root, nf]) {
    assert.ok(html.includes('<link rel="icon" href="/favicon.ico" sizes="32x32">'), "favicon.ico");
    assert.ok(html.includes('href="/icon-192.png"'), "icon-192");
    assert.ok(!html.includes("favicon.svg"));
  }
  assert.strictEqual((hub.match(/src="\/logo\.png" alt="Carbon Stealth VCC" width="673" height="160"/g) || []).length, 2, "nav + footer lockup");
  assert.ok(hub.includes('<picture class="boot-cs"><source srcset="/mark.webp"'), "boot знак");
  assert.ok(demo.includes('<a class="cs-mark" href="/bg/" aria-label="Carbon Stealth VCC"><picture><source srcset="/mark.webp"'), "cs-bar знак");
  assert.ok(root.includes('src="/mark.png" alt="Carbon Stealth VCC"'), "root знак");
  assert.ok(hub.includes('"logo":{"@type":"ImageObject","url":"https://portfolio.carbonstealth.eu/logo-square.png","width":1024,"height":1024}'), "Organization.logo");
  assert.ok(hub.includes('content="https://portfolio.carbonstealth.eu/og.png"'), "og:image");
});

test("хъбът носи бранд компонентите: boot, canvas hero, тикер, ghost заглавия, живи прегледи, лого", () => {
  const html = readFileSync(join(OUT, "bg/index.html"), "utf8");
  for (const needle of ['id="boot"', 'id="hero-canvas"', 'class="ticker"', 'class="ghost ghost-5"', 'data-preview="/bg/demo/', 'src="/logo.png"', "/assets/hero.js", "/assets/fonts/brand.css"]) assert.ok(html.includes(needle), needle);
  assert.equal((html.match(/data-preview=/g) || []).length, 10);
});

test("служебни файлове: sitemap с 39 URL и hreflang, robots сочи sitemap, llms.txt съдържа цените, security.txt", () => {
  const sm = readFileSync(join(OUT, "sitemap.xml"), "utf8");
  assert.equal((sm.match(/<loc>/g) || []).length, 39);
  assert.ok(sm.includes('hreflang="x-default"'));
  assert.ok(readFileSync(join(OUT, "robots.txt"), "utf8").includes("Sitemap: https://portfolio.carbonstealth.eu/sitemap.xml"));
  const llms = readFileSync(join(OUT, "llms.txt"), "utf8");
  assert.ok(llms.includes("reverse charge") && llms.includes("658 EUR excl. VAT") && llms.includes("790 EUR incl. 20% VAT"));
  assert.ok(readFileSync(join(OUT, ".well-known/security.txt"), "utf8").includes("Expires:"));
  assert.ok(readFileSync(join(OUT, "index.html"), "utf8").includes('hreflang="x-default" href="https://portfolio.carbonstealth.eu/bg/"'));
});

test("маркетинг слой: proof ред, оферта, линк във всяка услуга, плочки със снимки, без декорациите на „генериран“ сайт; хъбът — преглед на устройства и „включва“", () => {
  const html = readFileSync(join(OUT, "bg/demo/avtoservis/index.html"), "utf8");
  for (const needle of ['href="/assets/premium.css"', 'src="/assets/premium.js"', 'class="proof"', 'class="offer"', 'class="offer-tag"', 'class="card-link"', 'class="avatar"', 'class="fa"', 'class="lb-cap"']) assert.ok(html.includes(needle), needle);
  for (const banned of ['class="curtain"', 'class="grain"', 'class="scroll-cue"', 'class="sec-num"', 'class="word"', 'class="marquee"', 'class="foot-word"', 'class="num"', "fx/avtoservis.js"]) assert.ok(!html.includes(banned), `забранено: ${banned}`);
  if (existsSync(join(OUT, "img/avtoservis/credits.json"))) assert.ok(/data-cap="[^"]+"/.test(html) && html.includes('class="tint"'), "галерия с надписи и тониран hero");
  const tiles = readFileSync(join(OUT, "bg/demo/barzo-hranene/index.html"), "utf8");
  if (existsSync(join(OUT, "img/burger/g1-sm.webp"))) assert.ok(tiles.includes('style="background-image:url(/img/burger/g1-sm.webp)"'), "плочките носят реални снимки");
  assert.ok(readFileSync(join(OUT, "bg/demo/salon-za-krasota/index.html"), "utf8").includes("/assets/fx/salon.js"), "салонът има проба на цвят");
  for (const f of ["assets/premium.css", "assets/premium.js", "assets/fx/core.js", "assets/fx/salon.js", "assets/fx/mebeli.js", "assets/fx/schetovodstvo.js", "assets/fx/avtokashta.js"]) assert.ok(existsSync(join(OUT, f)), f);
  for (const d of DEMOS) for (const l of LANGS) assert.ok(d.t[l].offer?.title && d.t[l].hero.proof, `${d.id}/${l}: offer + proof`);
  const hub = readFileSync(join(OUT, "bg/index.html"), "utf8");
  assert.ok(hub.includes('id="devmodal"') && (hub.match(/class="dev-btn"/g) || []).length === 10, "device preview за всяко демо");
  assert.ok(hub.includes('class="hero-proof"') && (hub.match(/class="inc"/g) || []).length === 10, "proof ред + „включва“ на всяка карта");
});
