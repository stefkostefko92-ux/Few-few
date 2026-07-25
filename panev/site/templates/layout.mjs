// Общ layout: <head> с hreflang/canonical/JSON-LD, хедър, футър, order-drawer.
// Всички url-и са абсолютни пътища; ORIGIN се ползва само за canonical/og.

import { COMPANY, PATENT, CATALOG_PDF } from '../data/products.mjs';

export const ORIGIN = 'https://panevascensori.it';

// Безопасно вграждане на JSON в <script>: JSON.stringify не екранира '<'
// и разделителите на редове — суров '</script>' или U+2028/2029 в низ би
// счупил документа. Екранираме на изходната граница (JSON.parse ги приема).
export function jsonEmbed(obj) {
  return JSON.stringify(obj)
    .replaceAll('<', '\\u003c')
    .replaceAll(' ', '\\u2028')
    .replaceAll(' ', '\\u2029');
}

export function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Ключ на страница → чист URL за даден език (сървърът пренаписва
// /prodotti → prodotti.html; индексите остават директории).
export function pagePath(t, pageKey) {
  const slug = t.slugs[pageKey];
  const p = `${t.base}/${slug}`;
  if (p.endsWith('/index.html')) return p.slice(0, -'index.html'.length);
  return p.replace(/\.html$/, '');
}

function hreflangLinks(locales, pageKey) {
  const links = locales.map((t) =>
    `  <link rel="alternate" hreflang="${t.htmlLang}" href="${ORIGIN}${pagePath(t, pageKey)}">`
  );
  const it = locales.find((t) => t.lang === 'it');
  links.push(`  <link rel="alternate" hreflang="x-default" href="${ORIGIN}${pagePath(it, pageKey)}">`);
  return links.join('\n');
}

function organizationLd(t) {
  return {
    '@type': 'Organization',
    '@id': `${ORIGIN}/#organization`,
    name: COMPANY.name,
    url: `${ORIGIN}/`,
    logo: `${ORIGIN}/img/panev-logo.png`,
    email: COMPANY.email,
    telephone: COMPANY.phone,
    vatID: COMPANY.vat,
    taxID: COMPANY.vat.replace(/^IT/, ''),
    identifier: { '@type': 'PropertyValue', propertyID: 'REA', value: COMPANY.rea },
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Via Madonna del Salvatore 6',
      postalCode: '20010',
      addressLocality: 'Vittuone',
      addressRegion: 'MI',
      addressCountry: 'IT',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'sales',
      email: COMPANY.email,
      telephone: COMPANY.phone,
      availableLanguage: ['it', 'en', 'bg'],
    },
    knowsAbout: [
      'staffe per ascensori', 'staffe porte di piano', 'guide del contrappeso',
      'lift brackets', 'landing door brackets', 'counterweight guide rails',
      'планки за асансьори', 'планки за етажни врати', 'водачи на противотежестта',
      'brevetto Modello di Utilità UIBM 202023000002112',
    ],
  };
}

export function jsonLd(t, pageKey, extra = []) {
  const breadcrumb = pageKey === 'home' ? [] : [{
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t.nav.home, item: `${ORIGIN}${pagePath(t, 'home')}` },
      { '@type': 'ListItem', position: 2, name: t.meta[pageKey].title.split(/[—|]/)[0].trim(), item: `${ORIGIN}${pagePath(t, pageKey)}` },
    ],
  }];
  const graph = [
    organizationLd(t),
    ...breadcrumb,
    {
      '@type': 'WebSite',
      '@id': `${ORIGIN}/#website`,
      url: `${ORIGIN}/`,
      name: COMPANY.name,
      inLanguage: t.htmlLang,
      publisher: { '@id': `${ORIGIN}/#organization` },
    },
    {
      '@type': 'WebPage',
      url: `${ORIGIN}${pagePath(t, pageKey)}`,
      name: t.meta[pageKey].title,
      description: t.meta[pageKey].description,
      inLanguage: t.htmlLang,
      isPartOf: { '@id': `${ORIGIN}/#website` },
    },
    ...extra,
  ];
  return `<script type="application/ld+json">${jsonEmbed({ '@context': 'https://schema.org', '@graph': graph })}</script>`;
}

export function head(t, locales, pageKey, { ldExtra = [], ogImage = '/img/og-home.jpg' } = {}) {
  const m = t.meta[pageKey];
  const canonical = `${ORIGIN}${pagePath(t, pageKey)}`;
  return `<!DOCTYPE html>
<html lang="${t.htmlLang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(m.title)}</title>
  <meta name="description" content="${esc(m.description)}">
  <meta name="keywords" content="${esc(m.keywords.join(', '))}">
  <meta name="author" content="${esc(COMPANY.name)}">
  <meta name="theme-color" content="#162862">
  <link rel="canonical" href="${canonical}">
${hreflangLinks(locales, pageKey)}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${esc(COMPANY.name)}">
  <meta property="og:locale" content="${t.ogLocale}">
  <meta property="og:title" content="${esc(m.title)}">
  <meta property="og:description" content="${esc(m.description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${ORIGIN}${ogImage}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(m.title)}">
  <meta name="twitter:description" content="${esc(m.description)}">
  <meta name="twitter:image" content="${ORIGIN}${ogImage}">
  <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
  <link rel="icon" type="image/png" sizes="192x192" href="/img/icon-192.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/img/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="preload" href="/fonts/Inter-var-${t.lang === 'bg' ? 'cyrillic' : 'latin'}.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/css/site.css">
  ${jsonLd(t, pageKey, ldExtra)}
</head>`;
}

export function header(t, locales, pageKey, activeKey) {
  const nav = [
    ['home', t.nav.home],
    ['products', t.nav.products],
    ['catalog', t.nav.catalog],
    ['contacts', t.nav.contacts],
  ].map(([key, label]) =>
    `<a href="${pagePath(t, key)}"${key === activeKey ? ' aria-current="page"' : ''}>${esc(label)}</a>`
  ).join('\n        ');

  const langs = locales.map((lt) =>
    lt.lang === t.lang
      ? `<span aria-current="true">${lt.lang.toUpperCase()}</span>`
      : `<a href="${pagePath(lt, pageKey)}" hreflang="${lt.htmlLang}" lang="${lt.htmlLang}" title="${esc(lt.langNames[lt.lang])}">${lt.lang.toUpperCase()}</a>`
  ).join('');

  return `<body>
<a class="skip-link" href="#main">${esc(t.nav.skip)}</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="${pagePath(t, 'home')}" aria-label="${esc(COMPANY.name)}">
      <img src="/img/panev-logo.png" srcset="/img/panev-logo.webp" alt="${esc(COMPANY.name)}" width="170" height="44">
    </a>
    <nav class="site-nav" id="site-nav" aria-label="${esc(t.nav.menuLabel)}">
        ${nav}
    </nav>
    <div class="header-tools">
      <nav class="lang-switch" aria-label="${esc(t.nav.langLabel)}">${langs}</nav>
      <button class="order-toggle" type="button" data-order-toggle aria-controls="order-drawer" aria-expanded="false">
        ${esc(t.orderList.open)}<span class="order-count" data-order-count hidden>0</span>
      </button>
      <button class="nav-toggle" type="button" data-nav-toggle aria-controls="site-nav" aria-expanded="false" aria-label="${esc(t.nav.openMenu)}">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
</header>
<main id="main">`;
}

export function orderDrawer(t) {
  const ol = t.orderList;
  return `
<div class="order-backdrop" data-order-backdrop hidden></div>
<aside class="order-drawer" id="order-drawer" role="dialog" aria-modal="true" aria-label="${esc(ol.title)}" hidden>
  <div class="order-head">
    <h2>${esc(ol.title)}</h2>
    <button type="button" class="order-close" data-order-close aria-label="${esc(ol.close)}">&times;</button>
  </div>
  <p class="order-empty" data-order-empty>${esc(ol.empty)}</p>
  <ul class="order-items" data-order-items></ul>
  <div class="order-foot" data-order-foot hidden>
    <p class="order-total"><span>${esc(ol.total)}</span><strong data-order-total></strong></p>
    <p class="order-note">${esc(ol.note)}</p>
    <a class="btn btn-primary" data-order-send href="mailto:${COMPANY.email}">${esc(ol.send)}</a>
    <a class="btn btn-ghost" data-order-form href="${pagePath(t, 'contacts')}#modulo">${esc(ol.sendForm)}</a>
    <button class="order-clear" type="button" data-order-clear>${esc(ol.clear)}</button>
  </div>
</aside>`;
}

export function footer(t, locales, pageKey) {
  const f = t.footer;
  const year = 2026;
  const prodHref = pagePath(t, 'products');
  const prodLinks = [
    [f.productLinks[0], `${prodHref}#sezione-01`],
    [f.productLinks[1], `${prodHref}#sezione-02`],
    [f.productLinks[2], `${prodHref}#sezione-05`],
    [f.productLinks[3], `${prodHref}#sezione-06`],
  ].map(([label, href]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('');

  return `</main>
${orderDrawer(t)}
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div class="footer-brand">
      <img src="/img/panev-logo-darkmode.png" alt="${esc(COMPANY.name)}" width="170" height="44" loading="lazy">
      <p>${esc(f.tagline)}</p>
      <p class="footer-patent">${esc(f.patentLine)}</p>
      <p class="footer-flag"><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>${esc(f.madeInItaly)}</p>
    </div>
    <div>
      <h2>${esc(f.productsTitle)}</h2>
      <ul>${prodLinks}
        <li><a href="${pagePath(t, 'catalog')}">${esc(t.nav.catalog)}</a></li>
      </ul>
    </div>
    <div>
      <h2>${esc(f.companyTitle)}</h2>
      <ul>
        <li>${esc(COMPANY.name)}</li>
        <li>${esc(COMPANY.legalSeat)}</li>
        <li>${esc(t.contactsPage.rows.operative)}: ${esc(COMPANY.operativeSeat)}</li>
        <li>${esc(t.contactsPage.rows.vat)} ${esc(COMPANY.vat)}</li>
        <li>REA ${esc(COMPANY.rea)} — ${esc(COMPANY.registry)}</li>
        <li><a href="tel:${COMPANY.phoneHref}">${esc(COMPANY.phone)}</a></li>
        <li><a href="mailto:${COMPANY.email}">${esc(COMPANY.email)}</a></li>
      </ul>
    </div>
    <div>
      <h2>${esc(f.legalTitle)}</h2>
      <ul>
        <li><a href="${pagePath(t, 'privacy')}">${esc(t.meta.privacy.title.split('—')[0].trim())}</a></li>
        <li><a href="${pagePath(t, 'terms')}">${esc(t.termsPage.title)}</a></li>
        <li><a href="${CATALOG_PDF}" download>${esc(t.nav.catalog)}</a></li>
      </ul>
    </div>
  </div>
  <div class="wrap footer-bottom">
    <p>&copy; ${year} ${esc(COMPANY.name)} — ${esc(f.rights)}</p>
    <p>${esc(f.credits)} <a href="https://carbonstealth.eu" rel="external">Carbon Stealth VCC</a></p>
  </div>
</footer>
<script src="/js/site.js" defer></script>
<script type="application/json" id="i18n-order">${jsonEmbed({
    mailto: COMPANY.email,
    subject: t.orderList.mailSubject,
    intro: t.orderList.mailIntro,
    outro: t.orderList.mailOutro,
    qty: t.orderList.qty,
    hand: t.orderList.hand,
    added: t.products.added,
    onRequest: t.products.sections.special.quote,
    fmt: t.lang === 'en' ? 'en' : 'eu',
  })}</script>
</body>
</html>`;
}

export function page(t, locales, pageKey, activeKey, bodyHtml, headOpts) {
  return head(t, locales, pageKey, headOpts)
    + header(t, locales, pageKey, activeKey)
    + bodyHtml
    + footer(t, locales, pageKey);
}
