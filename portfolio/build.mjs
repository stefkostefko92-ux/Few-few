#!/usr/bin/env node
// build.mjs — генерира статичния сайт в dist/ (нула зависимости). Всяка страница минава през
// един и същ head() → SEO/hreflang/keywords не могат да се забравят на отделна страница.
import { mkdirSync, writeFileSync, rmSync, cpSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LANGS, PATHS, demoPath, SITE } from "./src/lib/html.mjs";
import { DEMOS } from "./src/demos/index.mjs";
import { renderDemo } from "./src/templates/demo.mjs";
import { renderHub } from "./src/templates/hub.mjs";
import { renderPricing } from "./src/templates/pricing.mjs";
import { renderProjects } from "./src/templates/projects.mjs";
import { renderAdmin } from "./src/templates/admin.mjs";
import { renderQuote } from "./src/templates/quote.mjs";
import { renderHosting } from "./src/templates/hosting.mjs";
import { renderBlogIndex, renderArticle, rss, articlePath, feedPath } from "./src/templates/blog.mjs";
import { renderLocalIndex, renderLocal, localPath } from "./src/templates/local.mjs";
import { ARTICLES } from "./src/blog/index.mjs";
import { CITIES } from "./src/local/cities.mjs";
import { renderLegal, renderRoot, renderNotFound, robots, llms, sitemap, securityTxt } from "./src/templates/misc.mjs";
import { renderA11y } from "./src/templates/a11y.mjs";
import { renderBrochure } from "./src/templates/brochure.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "dist");

// Версия по съдържание на всеки /assets/*.css|js в HTML-а (?v=<8 знака sha1>): nginx кешира css/js 7 дни и
// без това след деплой браузърът сглобява НОВ HTML със СТАР css/js (админ демото се разпадна точно така).
const ASSETS_SRC = join(ROOT, "src", "assets");
const hashes = new Map();
const assetVersion = (p) => {
  if (!hashes.has(p)) { const f = join(ASSETS_SRC, p.replace(/^\/assets\//, "")); hashes.set(p, existsSync(f) ? createHash("sha1").update(readFileSync(f)).digest("hex").slice(0, 8) : null); }
  return hashes.get(p);
};
export const versionAssets = (html) => html.replace(/((?:href|src)=")(\/assets\/[^"?#]+\.(?:css|js))(")/g, (m, a, p, b) => { const v = assetVersion(p); return v ? `${a}${p}?v=${v}${b}` : m; });

export function build({ out = OUT, quiet = false } = {}) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const pages = [];
  const put = (path, html) => {
    const file = path.endsWith("/") ? join(out, path, "index.html") : join(out, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, file.endsWith(".html") ? versionAssets(html) : html);
    pages.push(path);
  };
  const today = new Date().toISOString().slice(0, 10);
  const urls = [];
  for (const lang of LANGS) {
    put(PATHS.hub[lang], renderHub(lang));
    put(PATHS.pricing[lang], renderPricing(lang));
    put(PATHS.legal[lang], renderLegal(lang));
    put(PATHS.a11y[lang], renderA11y(lang));
    put(PATHS.brochure[lang], renderBrochure(lang)); // noindex — печатен асет (PDF: tools/brochure.mjs)
    put(PATHS.projects[lang], renderProjects(lang));
    put(PATHS.admin[lang], renderAdmin(lang));
    put(PATHS.quote[lang], renderQuote(lang));
    put(PATHS.hosting[lang], renderHosting(lang));
    put(PATHS.blog[lang], renderBlogIndex(lang));
    put(feedPath(lang), rss(lang));
    urls.push({ loc: PATHS.blog[lang], alt: PATHS.blog, priority: "0.7", changefreq: "weekly" });
    for (const a of ARTICLES) { put(articlePath(lang, a), renderArticle(lang, a)); urls.push({ loc: articlePath(lang, a), alt: Object.fromEntries(LANGS.map((l) => [l, articlePath(l, a)])), priority: "0.6", changefreq: "monthly", lastmod: a.updated }); }
    put(PATHS.local[lang], renderLocalIndex(lang));
    urls.push({ loc: PATHS.local[lang], alt: PATHS.local, priority: "0.6", changefreq: "yearly" });
    for (const c of CITIES) { put(localPath(lang, c), renderLocal(lang, c)); urls.push({ loc: localPath(lang, c), alt: Object.fromEntries(LANGS.map((l) => [l, localPath(l, c)])), priority: "0.6", changefreq: "yearly" }); }
    urls.push({ loc: PATHS.hub[lang], alt: PATHS.hub, priority: "1.0", changefreq: "weekly" });
    urls.push({ loc: PATHS.pricing[lang], alt: PATHS.pricing, priority: "0.9", changefreq: "monthly" });
    urls.push({ loc: PATHS.legal[lang], alt: PATHS.legal, priority: "0.2", changefreq: "yearly" });
    urls.push({ loc: PATHS.a11y[lang], alt: PATHS.a11y, priority: "0.2", changefreq: "yearly" });
    urls.push({ loc: PATHS.projects[lang], alt: PATHS.projects, priority: "0.9", changefreq: "monthly" });
    urls.push({ loc: PATHS.admin[lang], alt: PATHS.admin, priority: "0.7", changefreq: "yearly" });
    urls.push({ loc: PATHS.quote[lang], alt: PATHS.quote, priority: "0.8", changefreq: "monthly" });
    urls.push({ loc: PATHS.hosting[lang], alt: PATHS.hosting, priority: "0.7", changefreq: "yearly" });
    for (const demo of DEMOS) {
      put(demoPath(lang, demo), renderDemo(lang, demo));
      urls.push({ loc: demoPath(lang, demo), alt: Object.fromEntries(LANGS.map((l) => [l, demoPath(l, demo)])), priority: "0.8", changefreq: "monthly" });
    }
  }
  put("/index.html", renderRoot());
  put("/404.html", renderNotFound());
  put("/robots.txt", robots());
  put("/llms.txt", llms());
  put("/sitemap.xml", sitemap(urls, today));
  put("/.well-known/security.txt", securityTxt());
  cpSync(join(ROOT, "src/assets"), join(out, "assets"), { recursive: true });
  // public/ отива 1:1 в корена на сайта (favicon, og, apple-touch-icon, logo, шрифтове, снимки, IndexNow ключ).
  cpSync(join(ROOT, "public"), out, { recursive: true });
  if (!quiet) console.log(`✓ ${pages.length} файла → ${out} (${LANGS.length} езика · ${DEMOS.length} демота · ${urls.length} URL в sitemap за ${SITE})`);
  return { pages, urls };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) build();
