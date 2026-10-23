// Езиковите страници на сайта: server/<език>/index.html от tools/site-lang/<език>.json.
// Английската страница е server/index.html (ръчна, пълна); тези са кратки, преведени от
// tools/site-lang/en.json (източникът), с един и същ шаблон и стиловете на
// server/youtube-ad-blocker.html — смяна там = нов билд тук (tests/site.test.mjs пуска --check).
// Всички страници от групата сочат една към друга с hreflang, x-default е английската.
//
//   node tools/site_lang.mjs           записва server/<език>/index.html
//   node tools/site_lang.mjs --check   само проверява, че са свежи (изход 1 иначе)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRV = join(ROOT, "server");
const BASE = "https://adblock.carbonstealth.eu";
const STORE = "https://chromewebstore.google.com/detail/chbjbiabkgocfbbfhednpbhfeipjcclk";
// every link to the store carries the closed UTM vocabulary of docs/METRICS.md: site / home_<language>
const storeOf = (code) => `${STORE}?utm_source=site&amp;utm_medium=home_${code.replace(/-/g, "_")}`;
const DATE = "2026-10-16";

// path segment, hreflang, the language's own name (for the switcher)
export const LANGS = [
  { code: "bg", hreflang: "bg", name: "Български" },
  { code: "de", hreflang: "de", name: "Deutsch" },
  { code: "it", hreflang: "it", name: "Italiano" },
  { code: "es", hreflang: "es", name: "Español" },
  { code: "fr", hreflang: "fr", name: "Français" },
  { code: "pt-br", hreflang: "pt-BR", name: "Português (Brasil)" },
];
const ALL = [{ code: "", hreflang: "en", name: "English" }, ...LANGS];
const urlOf = (code) => BASE + (code ? `/${code}/` : "/");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// only <b> survives from the data; {store} becomes the store link
const rich = (s, d) => esc(s).replace(/&lt;(\/?)b&gt;/g, "<$1b>")
  .replace("{store}", `<a href="${d._store}" target="_blank" rel="noopener">${esc(d.storeName)}</a>`);
const plain = (s) => String(s).replace(/<\/?b>/g, "").replace("{store}", "Chrome Web Store");

function check(d, code) {
  const bad = [];
  if (d.title.length > 65) bad.push(`title ${d.title.length} > 65`);
  if (d.description.length < 70 || d.description.length > 160) bad.push(`description ${d.description.length}`);
  if (d.keywords.length < 5 || !d.keywords.includes("Carbon Stealth")) bad.push("keywords");
  if (d.features.length !== 8 || d.faq.length !== 6 || d.install.length !== 3 || d.moreLinks.length !== 3) bad.push("list sizes");
  const all = JSON.stringify(d);
  if (/<(?!\/?b>)/.test(all.replace(/\\u003c/g, "<"))) bad.push("markup other than <b>");
  if (!d.install[0].includes("{store}")) bad.push("install[0] without {store}");
  if (bad.length) throw new Error(`site-lang/${code}.json: ${bad.join("; ")}`);
}

// the image versions the landing page uses (tools/landing_assets.mjs writes them there)
const index = readFileSync(join(SRV, "index.html"), "utf8");
const ver = (f) => ((index.match(new RegExp(`/${f.replace(".", "\\.")}\\?v=([0-9a-f]+)`)) || [])[1] || "");
const style = (() => {
  const src = readFileSync(join(SRV, "youtube-ad-blocker.html"), "utf8");
  return src.slice(src.indexOf("<style>") + 7, src.indexOf("</style>")).trim();
})();
const EXTRA_CSS = `
  .hero .shield{justify-self:center;width:min(340px,80%);height:auto;filter:drop-shadow(0 30px 80px rgba(0,229,255,.22))}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;margin-top:22px}
  .card{border:1px solid var(--line2);border-radius:14px;background:var(--panel);padding:18px 18px 16px}
  .card h3{margin-top:0;font-size:16.5px}
  .card p{margin-top:6px;font-size:14.5px}
  .more{margin-top:18px;color:var(--muted)}
  .more a+a::before{content:"·";display:inline-block;margin:0 .5em;color:var(--muted2)}
  footer .langs{display:flex;flex-wrap:wrap;gap:8px 16px;width:100%}
  footer .langs a[aria-current="page"]{color:var(--cream);text-decoration:none}`;

function page(L, d) {
  d = { ...d, _store: storeOf(L.code) };
  const url = urlOf(L.code);
  const alternates = ALL.map((a) => `<link rel="alternate" hreflang="${a.hreflang}" href="${urlOf(a.code)}" />`).join("\n")
    + `\n<link rel="alternate" hreflang="x-default" href="${BASE}/" />`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage", "@id": url + "#webpage", url, name: d.title, description: d.description, inLanguage: L.hreflang,
        isPartOf: { "@id": BASE + "/#site" }, about: { "@id": BASE + "/#app" }, publisher: { "@id": "https://carbonstealth.eu/#organization" },
        primaryImageOfPage: BASE + "/og.png", datePublished: DATE, dateModified: DATE,
      },
      {
        "@type": "FAQPage", "@id": url + "#faq", inLanguage: L.hreflang,
        mainEntity: d.faq.map(([q, a]) => ({ "@type": "Question", name: plain(q), acceptedAnswer: { "@type": "Answer", text: plain(a) } })),
      },
    ],
  };
  const cta = `<a class="btn primary" href="${d._store}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 4 13.2h6.1L9 22l10.5-11.6h-6.4z"/></svg>${esc(d.cta)}</a>`;
  const langLinks = ALL.map((a) => `<a href="${a.code ? `/${a.code}/` : "/"}" hreflang="${a.hreflang}" lang="${a.hreflang}"${a.code === L.code ? ' aria-current="page"' : ""}>${esc(a.name)}</a>`).join("\n        ");
  return `<!DOCTYPE html>
<html lang="${L.hreflang}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(d.title)}</title>
<meta name="description" content="${esc(d.description)}" />
<meta name="keywords" content="${esc(d.keywords.join(", "))}" />
<meta name="author" content="Carbon Stealth" />
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
<meta name="theme-color" content="#030303" />
<link rel="canonical" href="${url}" />
${alternates}
<link rel="icon" href="/favicon-48.png" sizes="48x48" type="image/png" />
<link rel="icon" href="/icon-512.png" sizes="512x512" type="image/png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Supreme AdBlock — Carbon Stealth" />
<meta property="og:title" content="${esc(d.title)}" />
<meta property="og:description" content="${esc(d.description)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${BASE}/og.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Supreme AdBlock — Carbon Stealth" />
<meta property="og:locale" content="${d.ogLocale}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(d.title)}" />
<meta name="twitter:description" content="${esc(d.description)}" />
<meta name="twitter:image" content="${BASE}/og.png" />
<meta name="twitter:image:alt" content="Supreme AdBlock — Carbon Stealth" />
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
<style>
  ${style}
${EXTRA_CSS}
</style>
</head>
<body>
  <a class="skip" href="#main">${esc(d.skip)}</a>
  <div class="field" aria-hidden="true"></div>

  <nav class="top" aria-label="Supreme AdBlock">
    <a class="brand" href="/${L.code}/">
      <img class="mark" src="/shield-96.webp?v=${ver("shield-96.webp")}" alt="" width="34" height="34" />
      <span><b>Supreme AdBlock</b><span class="tag">Carbon Stealth</span></span>
    </a>
    <span class="sp"></span>
    <div class="links">
      <a href="#features">${esc(d.navFeatures)}</a>
      <a href="#faq">${esc(d.navFaq)}</a>
      <a href="/privacy" hreflang="en">${esc(d.navPrivacy)}</a>
      <a href="/" hreflang="en" lang="en">English</a>
    </div>
  </nav>

  <main id="main">
    <header class="hero">
      <div class="wrap">
        <div>
          <h1>${esc(d.h1)}</h1>
          <p class="lead">${rich(d.lead, d)}</p>
          <p class="where">${rich(d.where, d)}</p>
          <div class="cta">
            ${cta}
            <a class="btn ghost" href="#features">${esc(d.ctaMore)}</a>
          </div>
          <a class="verified" href="${d._store}" target="_blank" rel="noopener">
            <svg class="seal" viewBox="0 0 24 24" aria-hidden="true"><polygon points="12.00,0.80 14.43,2.92 17.60,2.30 18.65,5.35 21.70,6.40 21.08,9.57 23.20,12.00 21.08,14.43 21.70,17.60 18.65,18.65 17.60,21.70 14.43,21.08 12.00,23.20 9.57,21.08 6.40,21.70 5.35,18.65 2.30,17.60 2.92,14.43 0.80,12.00 2.92,9.57 2.30,6.40 5.35,5.35 6.40,2.30 9.57,2.92"/><path d="M7.7 12.3l2.8 2.8 5.8-6"/></svg>
            <span class="vt"><b lang="en">Established Publisher</b> <small>${esc(d.verifiedSmall)}</small></span>
            <svg class="ext" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3 4 12"/></svg>
          </a>
        </div>
        <img class="shield" src="/shield-380.webp?v=${ver("shield-380.webp")}" alt="" width="380" height="380" />
      </div>
    </header>

    <section class="blk" id="features">
      <div class="wrap">
        <h2>${esc(d.featuresTitle)}</h2>
        <div class="grid">
${d.features.map(([t, x]) => `          <article class="card"><h3>${esc(t)}</h3><p>${rich(x, d)}</p></article>`).join("\n")}
        </div>
      </div>
    </section>

    <section class="blk" id="privacy">
      <div class="wrap prose">
        <h2>${esc(d.privacyTitle)}</h2>
        <p>${rich(d.privacyText, d)}</p>
        <p><a href="/privacy" hreflang="en">${esc(d.privacyLink)}</a></p>
      </div>
    </section>

    <section class="blk" id="install">
      <div class="wrap prose">
        <h2>${esc(d.installTitle)}</h2>
        <ol class="steps">
${d.install.map((s) => `          <li>${rich(s, d)}</li>`).join("\n")}
        </ol>
      </div>
    </section>

    <section class="blk" id="faq">
      <div class="wrap prose">
        <h2>${esc(d.faqTitle)}</h2>
${d.faq.map(([q, a]) => `        <h3>${esc(q)}</h3>\n        <p>${rich(a, d)}</p>`).join("\n")}
        <p class="more">${esc(d.moreEnglish)} <a href="/youtube-ad-blocker" hreflang="en">${esc(d.moreLinks[0])}</a><a href="/cookie-banner-blocker" hreflang="en">${esc(d.moreLinks[1])}</a><a href="/support" hreflang="en">${esc(d.moreLinks[2])}</a></p>
      </div>
    </section>

    <div class="final">
      <h2>${esc(d.finalTitle)}</h2>
      <p>${rich(d.finalText, d)}</p>
      <div class="cta">
        ${cta}
      </div>
    </div>
  </main>

  <footer>
    <div class="row">
      <div class="who">
        <img src="/shield-96.webp?v=${ver("shield-96.webp")}" alt="" width="26" height="26" />
        <div>
          <p><b style="color:var(--cream)">Supreme AdBlock</b> ${esc(d.footerMade)}</p>
          <p>${esc(d.footerAddr)}, <a href="mailto:info@carbonstealth.eu">info@carbonstealth.eu</a></p>
        </div>
      </div>
      <nav class="langs" aria-label="${esc(d.langs)}">
        ${langLinks}
      </nav>
    </div>
  </footer>
</body>
</html>
`;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const checkOnly = process.argv.includes("--check");
  let stale = 0;
  if (!ver("shield-96.webp") || !ver("shield-380.webp")) throw new Error("server/index.html: no ?v= for the shield images");
  for (const L of LANGS) {
    const d = JSON.parse(readFileSync(join(ROOT, "tools", "site-lang", L.code + ".json"), "utf8"));
    check(d, L.code);
    const html = page(L, d);
    const out = join(SRV, L.code, "index.html");
    const cur = existsSync(out) ? readFileSync(out, "utf8") : "";
    if (cur === html) continue;
    if (checkOnly) { console.error(`STALE: server/${L.code}/index.html — run: node tools/site_lang.mjs`); stale++; continue; }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html);
    console.log(`wrote server/${L.code}/index.html`);
  }
  if (stale) process.exit(1);
  console.log(checkOnly ? "site_lang: every language page is up to date" : "site_lang: done");
}
