// blog.mjs — блогът: индекс, статия (Article JSON-LD с автор-организация, datePublished/dateModified видими,
// въпроси като H2 + Speakable), RSS 2.0 на всеки език. Съдържанието е в src/blog/index.mjs.
import { esc, join, head, jsonLd, ICON, ORG, PATHS, SITE, LANGS, BRAND_URL } from "../lib/html.mjs";
import { I18N } from "../i18n/index.mjs";
import { ARTICLES, AUTHOR } from "../blog/index.mjs";
import { siteNav, siteFooter, boot, contact, HUB_FONTS, BRAND_BG } from "./hub.mjs";

export const articlePath = (lang, a) => `${PATHS.blog[lang]}${a.slug[lang]}/`;
export const feedPath = (lang) => `${PATHS.blog[lang]}feed.xml`;
const dateFmt = (iso, lang) => new Date(iso + "T00:00:00Z").toLocaleDateString({ bg: "bg-BG", en: "en-GB", it: "it-IT" }[lang], { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const words = (t) => [t.lede, ...t.sections.flatMap((s) => [s.h, ...s.p])].join(" ").split(/\s+/).length;
const minutes = (t) => Math.max(2, Math.round(words(t) / 180));

function card(lang, a, ui) {
  const t = a.t[lang], b = ui.blog;
  return `<article class="cell post reveal" data-cursor><a class="post-cover" href="${articlePath(lang, a)}" aria-label="${esc(t.title)}"><img src="${a.cover}" alt="" width="960" height="600" loading="lazy" decoding="async"></a><div class="post-meta"><span class="cat"><time datetime="${a.date}">${dateFmt(a.date, lang)}</time> · ${minutes(t)} ${esc(b.minutes)}</span><h2><a href="${articlePath(lang, a)}">${esc(t.title)}</a></h2><p>${esc(t.desc)}</p><a class="open" href="${articlePath(lang, a)}">${esc(b.read)} →</a></div></article>`;
}

export function renderBlogIndex(lang) {
  const ui = I18N[lang], b = ui.blog, path = PATHS.blog[lang];
  const list = [...ARTICLES].sort((x, y) => (x.date < y.date ? 1 : -1));
  const schema = jsonLd({ "@context": "https://schema.org", "@graph": [
    { "@type": "Blog", "@id": SITE + path, url: SITE + path, name: b.title, description: b.desc, inLanguage: lang, publisher: { "@id": ORG["@id"] }, blogPost: list.map((a) => ({ "@type": "BlogPosting", headline: a.t[lang].title, url: SITE + articlePath(lang, a), datePublished: a.date, dateModified: a.updated })) },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Carbon Stealth Portfolio", item: SITE + PATHS.hub[lang] }, { "@type": "ListItem", position: 2, name: b.eyebrow, item: SITE + path }] },
  ] });
  return join([
    head({ lang, title: b.title, description: b.desc, keywords: b.keywords, path, paths: PATHS.blog, fonts: HUB_FONTS, css: ["/assets/site.css"], themeColor: BRAND_BG, extra: schema }),
    `<body class="hub">`, boot(ui), siteNav(lang, ui, PATHS.blog),
    `<main id="main"><section class="section" style="padding-top:140px"><div class="wrap"><div class="tag reveal">// ${esc(b.eyebrow)} · <a href="${feedPath(lang)}">${esc(b.rss)}</a></div><h1 class="h2 reveal">${b.h1}</h1><p class="lede reveal">${esc(b.lede)}</p><div class="grid1 posts">${list.map((a) => card(lang, a, ui)).join("")}</div></div></section>`,
    contact(lang, ui), `</main>`,
    siteFooter(lang, ui), `<script src="/assets/site.js" defer></script>`, `</body></html>`,
  ]);
}

export function renderArticle(lang, a) {
  const ui = I18N[lang], b = ui.blog, t = a.t[lang], path = articlePath(lang, a);
  const paths = Object.fromEntries(LANGS.map((l) => [l, articlePath(l, a)]));
  const others = ARTICLES.filter((x) => x.id !== a.id).slice(0, 3);
  const schema = jsonLd({ "@context": "https://schema.org", "@graph": [
    { "@type": "Article", "@id": SITE + path + "#article", headline: t.title, description: t.desc, image: SITE + a.cover, datePublished: a.date, dateModified: a.updated, inLanguage: lang, author: { "@type": "Organization", name: AUTHOR.name, url: AUTHOR.url }, publisher: { "@id": ORG["@id"] }, mainEntityOfPage: SITE + path, wordCount: words(t), keywords: a.keywords[lang].join(", "), citation: a.sources.map((s) => ({ "@type": "CreativeWork", name: s.name, url: s.url })), speakable: { "@type": "SpeakableSpecification", cssSelector: [".post-lede", ".post-body h2"] } },
    { "@type": "FAQPage", mainEntity: t.sections.filter((s) => s.h.endsWith("?")).map((s) => ({ "@type": "Question", name: s.h, acceptedAnswer: { "@type": "Answer", text: s.p[0] } })) },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Carbon Stealth Portfolio", item: SITE + PATHS.hub[lang] }, { "@type": "ListItem", position: 2, name: b.eyebrow, item: SITE + PATHS.blog[lang] }, { "@type": "ListItem", position: 3, name: t.title, item: SITE + path }] },
  ] });
  return join([
    head({ lang, title: t.metaTitle, description: t.metaDesc, keywords: a.keywords[lang], path, paths, fonts: HUB_FONTS, css: ["/assets/site.css"], themeColor: BRAND_BG, ogImage: a.cover, extra: schema }),
    `<body class="hub">`, boot(ui), siteNav(lang, ui, PATHS.blog),
    `<main id="main"><article class="section post-page" style="padding-top:140px"><div class="wrap" style="max-width:820px"><nav class="crumbs tag" aria-label="breadcrumb"><a href="${PATHS.hub[lang]}">Portfolio</a> / <a href="${PATHS.blog[lang]}">${esc(b.eyebrow)}</a></nav><h1 class="post-title">${esc(t.title)}</h1><p class="post-dates hud"><span>${esc(b.published)}: <time datetime="${a.date}">${dateFmt(a.date, lang)}</time></span><span>${esc(b.updated)}: <time datetime="${a.updated}">${dateFmt(a.updated, lang)}</time></span><span>${minutes(t)} ${esc(b.minutes)}</span></p><p class="post-lede">${esc(t.lede)}</p><img class="post-cover-img" src="${a.cover}" alt="" width="960" height="600" decoding="async"><div class="post-body">${t.sections.map((s) => `<h2>${esc(s.h)}</h2>${s.p.map((p) => `<p>${esc(p)}</p>`).join("")}`).join("")}</div><aside class="post-author"><div class="tag">// ${esc(b.author)}</div><strong>${esc(AUTHOR.name)}</strong><p>${esc(b.authorBio)}</p><a href="${BRAND_URL}" target="_blank" rel="noopener">carbonstealth.eu ↗</a></aside><section class="post-sources"><div class="tag">// ${esc(b.sources)}</div><ol class="sources">${a.sources.map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${esc(s.name)}</a></li>`).join("")}</ol></section><p class="post-cta"><a class="btn btn-solid" href="${PATHS.quote[lang]}" data-magnetic>${esc(ui.quote.eyebrow)} ${ICON.arrow}</a> <a class="btn" href="${PATHS.blog[lang]}">${esc(b.back)}</a></p></div></article><section class="section alt"><div class="wrap"><div class="tag">// ${esc(b.more)}</div><div class="grid1 posts">${others.map((x) => card(lang, x, ui)).join("")}</div></div></section></main>`,
    siteFooter(lang, ui), `<script src="/assets/site.js" defer></script>`, `</body></html>`,
  ]);
}

export function rss(lang) {
  const b = I18N[lang].blog, list = [...ARTICLES].sort((x, y) => (x.date < y.date ? 1 : -1));
  const x = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${x(b.eyebrow)} — Carbon Stealth Portfolio</title>
<link>${SITE}${PATHS.blog[lang]}</link>
<description>${x(b.desc)}</description>
<language>${lang}</language>
<atom:link href="${SITE}${feedPath(lang)}" rel="self" type="application/rss+xml"/>
${list.map((a) => `<item>
<title>${x(a.t[lang].title)}</title>
<link>${SITE}${articlePath(lang, a)}</link>
<guid isPermaLink="true">${SITE}${articlePath(lang, a)}</guid>
<pubDate>${new Date(a.date + "T08:00:00Z").toUTCString()}</pubDate>
<description>${x(a.t[lang].desc)}</description>
</item>`).join("\n")}
</channel>
</rss>
`;
}
