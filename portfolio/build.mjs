#!/usr/bin/env node
// build.mjs — генерира статичния сайт в dist/ (нула зависимости). Всяка страница минава през
// един и същ head() → SEO/hreflang/keywords не могат да се забравят на отделна страница.
import { mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LANGS, PATHS, demoPath, SITE } from "./src/lib/html.mjs";
import { DEMOS } from "./src/demos/index.mjs";
import { renderDemo } from "./src/templates/demo.mjs";
import { renderHub } from "./src/templates/hub.mjs";
import { renderPricing } from "./src/templates/pricing.mjs";
import { renderProjects } from "./src/templates/projects.mjs";
import { renderLegal, renderRoot, renderNotFound, robots, llms, sitemap, securityTxt } from "./src/templates/misc.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "dist");

export function build({ out = OUT, quiet = false } = {}) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const pages = [];
  const put = (path, html) => {
    const file = path.endsWith("/") ? join(out, path, "index.html") : join(out, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, html);
    pages.push(path);
  };
  const today = new Date().toISOString().slice(0, 10);
  const urls = [];
  for (const lang of LANGS) {
    put(PATHS.hub[lang], renderHub(lang));
    put(PATHS.pricing[lang], renderPricing(lang));
    put(PATHS.legal[lang], renderLegal(lang));
    put(PATHS.projects[lang], renderProjects(lang));
    urls.push({ loc: PATHS.hub[lang], alt: PATHS.hub, priority: "1.0", changefreq: "weekly" });
    urls.push({ loc: PATHS.pricing[lang], alt: PATHS.pricing, priority: "0.9", changefreq: "monthly" });
    urls.push({ loc: PATHS.legal[lang], alt: PATHS.legal, priority: "0.2", changefreq: "yearly" });
    urls.push({ loc: PATHS.projects[lang], alt: PATHS.projects, priority: "0.9", changefreq: "monthly" });
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
