#!/usr/bin/env node
// Генераторът на сайта LiftCon — нула зависимости (Node ≥22). Пише в public/ детерминистично:
// същото съдържание → същите байтове (датите идват от SITE.updated, не от часовника).
//
//   node liftcon/build.mjs            # билд в liftcon/public
//   LIFTCON_SITE_URL=https://liftcon.it node liftcon/build.mjs   # друг домейн
//   LIFTCON_OUT=/srv/site/releases/x LIFTCON_OVERRIDES=ov.json node build.mjs   # публикуване от /admin
//   node liftcon/build.mjs --dump-content defaults.json   # стойностите за формите в панела

import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SITE } from "./src/config.mjs";
import { SERVIZI, GRUPPI, BY_KEY } from "./src/content/servizi.mjs";
import { renderPage } from "./src/layout/page.mjs";
import { baseGraph, webPage, breadcrumbList } from "./src/lib/schema.mjs";
import { servizioPage } from "./src/pages/servizio.mjs";
import { GUIDE, guidaPage, guideHub } from "./src/pages/guida.mjs";
import { homePage } from "./src/pages/home.mjs";
import { amministratoriPage, proprietariPage } from "./src/pages/pubblico.mjs";
import { milanoPage, provinciaMilanoPage, lombardiaPage } from "./src/pages/zone.mjs";
import { serviziHub, metodoPage, chiSiamoPage } from "./src/pages/info.mjs";
import { contattiPage, grazieePage } from "./src/pages/contatti.mjs";
import { faqHub, glossarioPage } from "./src/pages/risorse.mjs";
import { privacyPage, cookiePage, noteLegaliPage, notFoundPage } from "./src/pages/legali.mjs";
import { applyOverrides, dumpContent } from "./src/overrides.mjs";
import { sitemapXml, sitemapTxt, robotsTxt, llmsTxt, llmsFullTxt, rssXml, manifest, securityTxt, INDEXNOW_KEY } from "./src/seo-files.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ROOT, "public");
// Папка за публикуване от панела: празна нова папка; статичните активи се копират от public/.
const OUT = process.env.LIFTCON_OUT ? process.env.LIFTCON_OUT : PUBLIC;
const STATICI = ["assets/fonts", "assets/brand", "assets/promo", "img", "favicon.ico"];

function write(rel, content) {
  const file = join(OUT, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** Маха всичко генерирано (HTML, хеширани активи, SEO файлове); пази шрифтове, бранд и рендери. */
function clean() {
  const keep = new Set(["assets/fonts", "assets/brand", "assets/promo", "img", "favicon.ico"]);
  (function walk(dir, rel) {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (keep.has(r)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        walk(p, r);
        if (!readdirSync(p).length) rmSync(p, { recursive: true });
      } else rmSync(p);
    }
  })(OUT, "");
}

function hashed(srcRel, outDir, ext, name = "site") {
  const abs = join(ROOT, srcRel);
  // Директория = конкатенация на файловете ѝ по име (01-…, 02-…); файл = самият той.
  const src = statSync(abs).isDirectory()
    ? Buffer.from(
        readdirSync(abs)
          .filter((f) => f.endsWith(`.${ext}`))
          .sort()
          .map((f) => readFileSync(join(abs, f), "utf8"))
          .join("\n"),
      )
    : readFileSync(abs);
  const h = createHash("sha256").update(src).digest("hex").slice(0, 10);
  const rel = `${outDir}/${name}.${h}.${ext}`;
  write(rel, src);
  return `/${rel}`;
}

function main() {
  const dumpAt = process.argv.indexOf("--dump-content");
  if (dumpAt > 0) {
    writeFileSync(process.argv[dumpAt + 1], `${JSON.stringify(dumpContent(), null, 2)}\n`);
    return;
  }
  if (process.env.LIFTCON_OVERRIDES) applyOverrides(JSON.parse(readFileSync(process.env.LIFTCON_OVERRIDES, "utf8")));
  if (OUT === PUBLIC) clean();
  else {
    mkdirSync(OUT, { recursive: true });
    for (const s of STATICI) cpSync(join(PUBLIC, s), join(OUT, s), { recursive: true });
  }
  const ctx = {
    css: hashed("src/assets/css", "assets/css", "css"),
    js: hashed("src/assets/site.js", "assets/js", "js"),
    nojs: hashed("src/assets/nojs.css", "assets/css", "css", "nojs"),
    servizi: SERVIZI,
    gruppi: GRUPPI,
    byKey: BY_KEY,
    guide: GUIDE,
    site: SITE.url,
    exists: (p) => existsSync(join(PUBLIC, p)) && statSync(join(PUBLIC, p)).isFile(),
  };

  const specs = [
    homePage(ctx),
    serviziHub(ctx),
    ...SERVIZI.map((s) => servizioPage(s, ctx)),
    amministratoriPage(ctx),
    proprietariPage(ctx),
    lombardiaPage(ctx),
    milanoPage(ctx),
    provinciaMilanoPage(ctx),
    guideHub(ctx),
    ...GUIDE.map((g) => guidaPage(g, ctx)),
    glossarioPage(ctx),
    faqHub(ctx),
    metodoPage(ctx),
    chiSiamoPage(ctx),
    contattiPage(ctx),
    grazieePage(ctx),
    privacyPage(ctx),
    cookiePage(ctx),
    noteLegaliPage(ctx),
    notFoundPage(ctx),
  ];

  const base = baseGraph(SERVIZI);
  const pages = specs.map((spec) => {
    const graph = [...base, webPage(spec)];
    if (spec.breadcrumbs?.length) graph.push(breadcrumbList(spec));
    graph.push(...(spec.schema ? spec.schema(spec) : []));
    return { ...spec, graph };
  });

  const seen = new Map();
  for (const p of pages) {
    if (seen.has(p.path)) throw new Error(`Дублиран път: ${p.path}`);
    seen.set(p.path, p);
    const rel = p.file ?? `${p.path.replace(/^\//, "")}index.html`;
    write(rel, renderPage(p, ctx));
  }

  const indexable = pages.filter((p) => !p.noindex && p.sitemap !== false);
  write("sitemap.xml", sitemapXml(indexable));
  write("sitemap.txt", sitemapTxt(indexable));
  write("robots.txt", robotsTxt());
  write("llms.txt", llmsTxt({ servizi: SERVIZI, guide: GUIDE }));
  write("llms-full.txt", llmsFullTxt(indexable));
  write("guide/feed.xml", rssXml(GUIDE));
  write("site.webmanifest", manifest());
  write(".well-known/security.txt", securityTxt());
  write("indexnow-key.txt", `${INDEXNOW_KEY}\n`);
  write(`${INDEXNOW_KEY}.txt`, `${INDEXNOW_KEY}\n`);

  process.stdout.write(`LiftCon: ${pages.length} страници, ${indexable.length} в sitemap → ${OUT}\n`);
}

main();
