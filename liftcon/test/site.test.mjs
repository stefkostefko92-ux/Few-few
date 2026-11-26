// Гейтът на генерирания сайт (public/): SEO/AEO инварианти, връзки, схеми, правилата на репото
// (без SVG, ≥5 ключови думи с „Carbon Stealth“, кредит във футъра) и ограниченията от т. 8 на каталога.
//   node --test liftcon/test/*.test.mjs   (след node liftcon/build.mjs)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE } from "../src/config.mjs";

const PUB = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

function walk(dir, ext, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

const pages = walk(PUB, ".html").map((file) => {
  const rel = relative(PUB, file).replaceAll("\\", "/");
  const path = rel === "index.html" ? "/" : rel.endsWith("/index.html") ? `/${rel.slice(0, -"index.html".length)}` : `/${rel}`;
  return { file, path, html: readFileSync(file, "utf8") };
});
const meta = (html, name, attr = "name") => html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`))?.[1];
const noindex = (p) => /<meta name="robots" content="noindex/.test(p.html);
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');

test("има всички очаквани страници", () => {
  assert.ok(pages.length >= 33, `само ${pages.length} страници`);
  for (const p of ["/", "/servizi/", "/contatti/", "/guide/", "/consulenza-ascensori-milano/", "/privacy/", "/404.html"]) {
    assert.ok(pages.some((x) => x.path === p), `липсва ${p}`);
  }
});

test("всяка страница: lang, един H1, заглавие ≤60, описание ≤160, canonical, hreflang", () => {
  for (const p of pages) {
    assert.match(p.html, /<html lang="it">/, p.path);
    assert.equal((p.html.match(/<h1[\s>]/g) ?? []).length, 1, `${p.path}: брой H1`);
    const title = decode(p.html.match(/<title>([^<]+)<\/title>/)?.[1] ?? "");
    assert.ok(title.length > 10 && title.length <= 60, `${p.path}: заглавие ${title.length} знака — „${title}“`);
    const desc = decode(meta(p.html, "description") ?? "");
    assert.ok(desc.length >= 70 && desc.length <= 160, `${p.path}: описание ${desc.length} знака`);
    if (p.path === "/404.html") continue;
    assert.ok(p.html.includes(`<link rel="canonical" href="${SITE.url}${p.path}">`), `${p.path}: canonical`);
    assert.ok(p.html.includes(`hreflang="it-IT"`) && p.html.includes(`hreflang="x-default"`), `${p.path}: hreflang`);
  }
});

test("заглавията и описанията са уникални", () => {
  const titles = new Map();
  const descs = new Map();
  for (const p of pages) {
    const t = p.html.match(/<title>([^<]+)<\/title>/)[1];
    const d = meta(p.html, "description");
    assert.ok(!titles.has(t), `дублирано заглавие: ${p.path} и ${titles.get(t)}`);
    assert.ok(!descs.has(d), `дублирано описание: ${p.path} и ${descs.get(d)}`);
    titles.set(t, p.path);
    descs.set(d, p.path);
  }
});

test("ключови думи: ≥5 и една е „Carbon Stealth“", () => {
  for (const p of pages) {
    const kw = (meta(p.html, "keywords") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    assert.ok(kw.length >= 5, `${p.path}: ${kw.length} ключови думи`);
    assert.ok(kw.includes("Carbon Stealth"), `${p.path}: без „Carbon Stealth“`);
  }
});

test("OG и Twitter карта на всяка страница", () => {
  for (const p of pages) {
    for (const k of ["og:title", "og:description", "og:url", "og:image", "og:image:alt", "og:locale"]) assert.ok(meta(p.html, k, "property"), `${p.path}: ${k}`);
    assert.equal(meta(p.html, "twitter:card"), "summary_large_image", p.path);
    const og = meta(p.html, "og:image", "property").replace(SITE.url, "");
    assert.ok(existsSync(join(PUB, og)), `${p.path}: og:image ${og} не съществува`);
  }
});

test("JSON-LD: валиден, с организация, сайт, страница и (вътре) трохи", () => {
  for (const p of pages) {
    const raw = p.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(raw, `${p.path}: няма JSON-LD`);
    const data = JSON.parse(raw);
    const types = data["@graph"].map((n) => n["@type"]).flat();
    for (const t of ["Organization", "ProfessionalService", "WebSite"]) assert.ok(types.includes(t), `${p.path}: липсва ${t}`);
    if (p.path !== "/" && p.path !== "/404.html") assert.ok(types.includes("BreadcrumbList"), `${p.path}: без BreadcrumbList`);
  }
  const home = pages.find((p) => p.path === "/").html;
  assert.match(home, /"@type":"FAQPage"/);
  const guida = pages.find((p) => p.path === "/guide/verifica-periodica-ascensore/").html;
  assert.match(guida, /"@type":"Article"/);
  assert.match(guida, /"datePublished":"\d{4}-\d{2}-\d{2}"/);
});

test("вътрешните връзки и ресурси водят до съществуващи файлове", () => {
  const broken = [];
  for (const p of pages) {
    for (const m of p.html.matchAll(/\b(?:href|src|srcset|imagesrcset)="([^"]+)"/g)) {
      for (const part of m[1].split(",")) {
        const url = part.trim().split(/\s+/)[0];
        if (!url.startsWith("/") || url.startsWith("//")) continue;
        const clean = decode(url).split(/[?#]/)[0];
        const f = join(PUB, clean);
        const ok = existsSync(f) && (statSync(f).isFile() || existsSync(join(f, "index.html")));
        if (!ok) broken.push(`${p.path} → ${url}`);
      }
    }
  }
  assert.deepEqual(broken, []);
});

test("без SVG, без inline стилове, без външни скриптове, изображения с alt/width/height", () => {
  for (const p of pages) {
    assert.doesNotMatch(p.html, /<svg[\s>]/i, `${p.path}: SVG`);
    assert.doesNotMatch(p.html, /\.svg["'?#\s]/i, `${p.path}: препратка към .svg`);
    assert.doesNotMatch(p.html, /\sstyle="/i, `${p.path}: inline style (CSP)`);
    assert.doesNotMatch(p.html, /<script(?![^>]*application\/ld\+json)[^>]*src="(https?:)?\/\//i, `${p.path}: външен скрипт`);
    for (const img of p.html.match(/<img\b[^>]*>/g) ?? []) {
      assert.match(img, /\salt="/, `${p.path}: img без alt`);
      assert.match(img, /\swidth="\d+"/, `${p.path}: img без width`);
      assert.match(img, /\sheight="\d+"/, `${p.path}: img без height`);
    }
  }
});

test("футър: кредит към carbonstealth.eu (нов таб, noopener) и данни на фирмата", () => {
  for (const p of pages) {
    assert.ok(
      p.html.includes('<a class="credit" href="https://carbonstealth.eu" target="_blank" rel="noopener">Created and Designed by Carbon Stealth VCC</a>'),
      `${p.path}: кредит`,
    );
    assert.match(p.html, /Partita IVA BG208725180/, `${p.path}: P. IVA`);
  }
});

test("sitemap.xml и sitemap.txt съдържат точно индексируемите страници", () => {
  const xml = readFileSync(join(PUB, "sitemap.xml"), "utf8");
  const txt = readFileSync(join(PUB, "sitemap.txt"), "utf8").trim().split("\n");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const expected = pages.filter((p) => !noindex(p)).map((p) => `${SITE.url}${p.path}`).sort();
  assert.deepEqual([...locs].sort(), expected);
  assert.deepEqual([...txt].sort(), expected);
  assert.match(xml, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  assert.match(readFileSync(join(PUB, "robots.txt"), "utf8"), new RegExp(`Sitemap: ${SITE.url}/sitemap.xml`));
});

test("llms.txt: формат и връзки към съществуващи страници", () => {
  const llms = readFileSync(join(PUB, "llms.txt"), "utf8");
  assert.match(llms, /^# LiftCon\n\n> /);
  for (const m of llms.matchAll(/\]\((https?:\/\/[^)]+)\)/g)) {
    const path = m[1].replace(SITE.url, "");
    const f = join(PUB, path.endsWith("/") ? `${path}index.html` : path);
    assert.ok(existsSync(f), `llms.txt → ${m[1]}`);
  }
  assert.ok(existsSync(join(PUB, "llms-full.txt")));
  assert.match(readFileSync(join(PUB, "guide/feed.xml"), "utf8"), /<rss version="2.0"/);
});

test("т. 8 на каталога: никакви обещания за проверки, сертификати или гаранции", () => {
  const banned = [/\bgarantiamo\b/i, /(?<!non )\bcertifichiamo\b/i, /\bcertificazione LiftCon\b/i, /\bleader\b/i, /\bn\.\s?1\b/i, /\bgratuit[oaie]\b/i, /lorem ipsum/i, /\bTODO\b/];
  for (const p of pages) {
    const text = p.html.replace(/<script[\s\S]*?<\/script>/g, "");
    for (const re of banned) assert.doesNotMatch(text, re, `${p.path}: ${re}`);
  }
});

test("нормативни капани: срокът за messa in esercizio е 60 дни, модификациите са lett. cc)", () => {
  for (const p of pages) {
    assert.doesNotMatch(p.html, /entro 10 giorni/i, `${p.path}: стар срок от 10 дни`);
    assert.doesNotMatch(p.html, /lett(?:era|\.)\s*i\)(?!»)/i, `${p.path}: старата буква i) без обяснение`);
    assert.doesNotMatch(p.html, /DM 23 luglio 2009/i, `${p.path}: отмененият DM 23/07/2009 като задължение`);
  }
});
