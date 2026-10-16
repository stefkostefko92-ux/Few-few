// Сайтът (adblock/server): всяка страница се намира от търсачките, стига до сървъра и не крие нищо.
// Нова страница, забравена в deploy-а или в nginx/Caddy, е 404 на живо, а sitemap-ът я обявява —
// затова е гейт, не навик. FAQ разметката на Google трябва да е видим текст (без скрито съдържание).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, ok, done } from "./_harness.mjs";

const SRV = join(ROOT, "server");
const BASE = "https://adblock.carbonstealth.eu";
const LISTING = "https://chromewebstore.google.com/detail/chbjbiabkgocfbbfhednpbhfeipjcclk";
// the language pages (tools/site_lang.mjs): server/<lang>/index.html, served at /<lang>/
const LANG_DIRS = readdirSync(SRV, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(SRV, d.name, "index.html"))).map((d) => d.name).sort();
const isLang = (f) => /^[a-z-]+\/index\.html$/.test(f);
const pages = readdirSync(SRV).filter((f) => f.endsWith(".html")).sort().concat(LANG_DIRS.map((d) => `${d}/index.html`));
const pathOf = (f) => (f === "index.html" ? "/" : isLang(f) ? "/" + f.replace(/index\.html$/, "") : "/" + f.replace(/\.html$/, ""));
const read = (f) => readFileSync(join(SRV, f), "utf8");

const sitemap = read("sitemap.xml");
const llms = read("llms.txt");
const nginx = read("nginx.conf");
const caddy = read("Caddyfile");
const deploy = readFileSync(join(ROOT, "..", "deploy", "autodeploy.sh"), "utf8");
const adb = deploy.slice(deploy.indexOf("deploy_adblock() {"));
const deployList = ((adb.match(/for f in ([\s\S]*?); do/) || [])[1] || "").replace(/\\\n/g, " ").split(/\s+/).filter(Boolean);
const indexNow = (deploy.match(/"urlList":\[([^\]]+)\]/) || [])[1] || "";
const deployLangs = ((adb.match(/for l in ([^;]+); do/) || [])[1] || "").trim().split(/\s+/);
const nginxLangs = ((nginx.match(/location ~ \^\/\(([^)]+)\)\$ \{\s*return 301 \/\$1\/;/) || [])[1] || "").split("|");
const caddyLangs = ((caddy.match(/@langs path ([^\n]+)/) || [])[1] || "").trim().split(/\s+/);
const nginxPretty = ((nginx.match(/location ~ \^\/\(([^)]+)\)\$ \{\s*try_files \/\$1\.html =404;/) || [])[1] || "").split("|");
const caddyPretty = caddy.includes("rewrite @pretty {path}.html") ? ((caddy.match(/@pretty path ([^\n]+)/) || [])[1] || "").trim().split(/\s+/) : [];
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));

ok(`site: ${pages.length} pages (${pages.join(", ")})`, pages.length >= 5);

// Видимият текст: вградените тагове (a, b, code…) изчезват, блоковите стават интервал.
const visibleText = (h) => h.slice(h.indexOf("<body"))
  .replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "")
  .replace(/<\/?(a|b|strong|em|i|code|span|small|del|ins)\b[^>]*>/g, "").replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ");

for (const f of pages) {
  const h = read(f);
  const url = BASE + pathOf(f);
  const head = h.slice(0, h.indexOf("</head>"));
  ok(`${f}: canonical and og:url are ${url}`, head.includes(`<link rel="canonical" href="${url}" />`) && head.includes(`<meta property="og:url" content="${url}" />`));
  const title = (head.match(/<title>([^<]+)<\/title>/) || [])[1] || "";
  ok(`${f}: <title> fits a result line (${title.length} chars)`, title.length >= 10 && title.length <= 65);
  const desc = (head.match(/<meta name="description" content="([^"]+)"/) || [])[1] || "";
  ok(`${f}: meta description 70–160 chars (${desc.length})`, desc.length >= 70 && desc.length <= 160);
  const kw = ((head.match(/<meta name="keywords" content="([^"]+)"/) || [])[1] || "").split(",").map((s) => s.trim()).filter(Boolean);
  ok(`${f}: ≥5 keywords, one of them „Carbon Stealth“ (${kw.length})`, kw.length >= 5 && kw.includes("Carbon Stealth"));
  ok(`${f}: exactly one <h1>`, (h.match(/<h1[\s>]/g) || []).length === 1);
  ok(`${f}: listed in sitemap.xml`, sitemap.includes(`<loc>${url}</loc>`));
  ok(`${f}: copied to the server by deploy/autodeploy.sh`, isLang(f) ? deployLangs.includes(f.split("/")[0]) : deployList.includes(f));
  ok(`${f}: in the IndexNow ping after a deploy`, indexNow.includes(f === "index.html" ? `"$base/"` : `"$base${pathOf(f)}"`));
  if (isLang(f)) {
    const l = f.split("/")[0];
    ok(`${f}: /${l} goes to the canonical /${l}/ in nginx.conf and Caddyfile (the folder's index.html serves it)`, nginxLangs.includes(l) && caddyLangs.includes("/" + l));
    ok(`${f}: listed in llms.txt`, llms.includes(url));
  } else if (f !== "index.html") {
    ok(`${f}: ${pathOf(f)} is served by both nginx.conf and Caddyfile`, nginxPretty.includes(pathOf(f).slice(1)) && caddyPretty.includes(pathOf(f)));
    ok(`${f}: listed in llms.txt`, llms.includes(url));
  }

  // Политиката обещава: сайтът не зарежда нищо от трети страни (шрифтове, скриптове, картинки).
  const ext = [...h.matchAll(/<(script|link|img|iframe|source|video|audio|embed)\b[^>]*\b(?:src|href)="(?:https?:)?\/\/[^"]+"[^>]*>/g)]
    .filter((m) => !/rel="(canonical|alternate)"/.test(m[0])).map((m) => m[0].slice(0, 70)); // address hints, never fetched
  ok(`${f}: loads nothing from another origin (${ext.join(" | ") || "none"})`, ext.length === 0);

  // JSON-LD се парсва; всеки FAQ въпрос и отговор е видим на страницата (Google: без скрит текст).
  const ld = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => { try { return JSON.parse(m[1]); } catch { return null; } });
  ok(`${f}: JSON-LD parses`, ld.length >= 1 && ld.every(Boolean));
  const nodes = ld.filter(Boolean).flatMap((d) => d["@graph"] || [d]);
  const visible = visibleText(h);
  const faq = nodes.filter((n) => n["@type"] === "FAQPage").flatMap((n) => n.mainEntity || []);
  const hidden = faq.filter((q) => !visible.includes(q.name) || !visible.includes(q.acceptedAnswer.text)).map((q) => q.name);
  ok(`${f}: every FAQPage question and answer is visible text (${hidden.join(" | ") || `${faq.length} checked`})`, hidden.length === 0);
  const crumbs = nodes.filter((n) => n["@type"] === "BreadcrumbList");
  if (f !== "index.html" && !isLang(f)) ok(`${f}: BreadcrumbList ends at this page`, crumbs.length === 1 && crumbs[0].itemListElement.at(-1).item === url);

  // Знакът Established Publisher винаги води към листинга (проверимо твърдение).
  const pills = [...h.matchAll(/<a class="verified" href="([^"]+)"/g)];
  ok(`${f}: Established Publisher marks link to the store listing`, pills.every((m) => m[1] === LISTING));

  // Вътрешните линкове водят до съществуваща страница/файл и до съществуващ id.
  const broken = [];
  for (const [, href] of h.matchAll(/href="((?:\/|#)[^"]*)"/g)) {
    const [pathPart, anchor] = href.split("#");
    const target = pathPart === "" ? f : pathPart === "/" ? "index.html" : pages.includes(pathPart.slice(1) + ".html") ? pathPart.slice(1) + ".html" : null;
    if (target === null) { if (!existsSync(join(SRV, pathPart.split("?")[0]))) broken.push(href); continue; }
    if (anchor && !read(target).includes(`id="${anchor}"`)) broken.push(href);
  }
  ok(`${f}: internal links resolve (${broken.join(", ") || "all"})`, broken.length === 0);
}

// Езиковите страници: свежи спрямо tools/site-lang/*.json, всяка от групата (английската + езиците)
// сочи всички останали и себе си с hreflang, плюс x-default към английската; <html lang> е нейният.
const gen = spawnSync(process.execPath, [join(ROOT, "tools", "site_lang.mjs"), "--check"], { encoding: "utf8" });
ok(`language pages are fresh (node tools/site_lang.mjs --check): ${(gen.stdout + gen.stderr).trim()}`, gen.status === 0);
ok(`language pages: ${LANG_DIRS.join(", ")}`, LANG_DIRS.join() === "bg,de,es,fr,it,pt-br");
const cluster = ["index.html", ...LANG_DIRS.map((d) => `${d}/index.html`)];
const altsOf = (f) => [...read(f).slice(0, read(f).indexOf("</head>")).matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)" \/>/g)].map((m) => `${m[1]}=${m[2]}`).sort();
const expected = cluster.map((f) => `${f === "index.html" ? "en" : (read(f).match(/<html lang="([^"]+)"/) || [])[1]}=${BASE}${pathOf(f)}`).concat(`x-default=${BASE}/`).sort();
for (const f of cluster) {
  ok(`${f}: hreflang lists the whole group and x-default (${altsOf(f).length})`, JSON.stringify(altsOf(f)) === JSON.stringify(expected));
  const lang = (read(f).match(/<html lang="([^"]+)"/) || [])[1];
  ok(`${f}: <html lang="${lang}"> matches its own hreflang`, expected.includes(`${lang}=${BASE}${pathOf(f)}`));
  ok(`${f}: the footer links every language`, cluster.every((g) => read(f).includes(`href="${pathOf(g)}" hreflang=`)));
}

// Страницата за поддръжка казва текущата версия — като llms.txt и началната страница.
ok(`support.html: shows the current version ${manifest.version}`, read("support.html").includes(`<dd>${manifest.version}, released`));
ok(`llms.txt: names the current version ${manifest.version}`, llms.includes(`Current version: ${manifest.version}`));

done();
