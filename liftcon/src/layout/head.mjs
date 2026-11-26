// <head>: мета, OG/Twitter, гео мета, canonical + hreflang, ключови думи, иконки, шрифтове, JSON-LD.

import { SITE, GEO } from "../config.mjs";
import { esc, abs, jsonLd } from "../lib/html.mjs";
import { R } from "../routes.mjs";

const DEFAULT_OG = { path: "/img/og/liftcon-og.jpg", w: 1200, h: 630, alt: "Logo LiftCon, consulenza tecnica ascensori, su un atrio di condominio con ascensore in acciaio inox" };

export function head(page, ctx) {
  const url = abs(SITE.url, page.path);
  const og = page.og ?? DEFAULT_OG;
  const geo = page.geo ?? GEO;
  const robots = page.noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
  const article = page.article
    ? `<meta property="article:published_time" content="${esc(page.article.published)}">
<meta property="article:modified_time" content="${esc(page.article.modified)}">
<meta property="article:section" content="Guide">`
    : "";
  return `<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
<meta name="keywords" content="${esc(page.keywords.join(", "))}">
<meta name="robots" content="${robots}">
${
    page.noindex
      ? ""
      : `<link rel="canonical" href="${esc(url)}">
<link rel="alternate" hreflang="it-IT" href="${esc(url)}">
<link rel="alternate" hreflang="x-default" href="${esc(url)}">
`
  }<meta name="author" content="LiftCon · Carbon Stealth VCC">
<meta name="theme-color" content="${SITE.themeColor}">
<meta name="format-detection" content="telephone=no">
<meta name="geo.region" content="${esc(geo.region ?? GEO.region)}">
<meta name="geo.placename" content="${esc(geo.place)}">
<meta name="geo.position" content="${geo.lat};${geo.lng}">
<meta name="ICBM" content="${geo.lat}, ${geo.lng}">
<meta property="og:type" content="${page.article ? "article" : "website"}">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:locale" content="${SITE.locale}">
<meta property="og:title" content="${esc(page.ogTitle ?? page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(abs(SITE.url, og.path))}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="${og.w}">
<meta property="og:image:height" content="${og.h}">
<meta property="og:image:alt" content="${esc(og.alt)}">
${article}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(page.ogTitle ?? page.title)}">
<meta name="twitter:description" content="${esc(page.description)}">
<meta name="twitter:image" content="${esc(abs(SITE.url, og.path))}">
<meta name="twitter:image:alt" content="${esc(og.alt)}">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/assets/brand/favicon-48.png" type="image/png" sizes="48x48">
<link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="alternate" type="application/rss+xml" title="Guide LiftCon" href="${R.feed}">
<link rel="preload" href="/assets/fonts/saira-cond.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/plex-sans.woff2" as="font" type="font/woff2" crossorigin>
${page.preload ?? ""}
<link rel="stylesheet" href="${ctx.css}">
<noscript><link rel="stylesheet" href="${ctx.nojs}"></noscript>
<script src="${ctx.js}" defer></script>
<script type="application/ld+json">${jsonLd({ "@context": "https://schema.org", "@graph": page.graph })}</script>
</head>`;
}
