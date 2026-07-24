// Шестте страници на сайта. Всяка функция връща HTML за <main>.

import { esc, pagePath, ORIGIN } from './layout.mjs';
import {
  COMPANY, PATENT, CATALOG_PDF, CATALOG_EDITION, CATALOG_PAGES,
  doorSystems, guideConfigs, sgFixed, specials, allPricedItems,
} from '../data/products.mjs';

function img(name, alt, { w = 480, h = 360, lazy = true, cls = '' } = {}) {
  return `<picture${cls ? ` class="${cls}"` : ''}>
  <source srcset="/img/${name}.webp" type="image/webp">
  <img src="/img/${name}.png" alt="${esc(alt)}" width="${w}" height="${h}"${lazy ? ' loading="lazy" decoding="async"' : ''}>
</picture>`;
}

function addBtn(t, item, priceStr) {
  const data = `data-add data-code="${esc(item.code)}" data-price="${item.price ?? ''}" data-name="${esc(item.name || item.code)}"`;
  return `<button type="button" class="add-btn" ${data} aria-label="${esc(t.products.addToOrder)} — ${esc(item.code)}">${esc(t.products.addToOrder)}</button>`;
}

function priceCell(t, price) {
  return price == null
    ? `<em class="price-quote">${esc(t.products.sections.special.quote)}</em>`
    : `<strong class="price">${esc(t.fmtPrice(price))}</strong>`;
}

function itemRow(t, item, name) {
  return `<tr>
    <th scope="row" class="code">${esc(item.code)}</th>
    <td>${esc(name)}</td>
    <td class="num">${priceCell(t, item.price)}</td>
    <td class="act">${addBtn(t, { ...item, name })}</td>
  </tr>`;
}

function sectionHead(t, sec, id) {
  const chips = sec.chips.map((c) => `<span class="chip chip-light">${esc(c)}</span>`).join('');
  return `<header class="sec-cover" id="${id}">
    <div class="wrap">
      <p class="sec-num" aria-hidden="true">${sec.num}</p>
      <p class="kicker kicker-light">${esc(sec.kicker)}</p>
      <h2>${esc(sec.title)}</h2>
      <p class="sec-lead">${esc(sec.lead)}</p>
      <div class="chips">${chips}</div>
    </div>
  </header>`;
}

// ── Начална страница ─────────────────────────────────────────
export function homePage(t, locales) {
  const h = t.hero;
  const chips = h.chips.map((c) => `<span class="chip chip-light">${esc(c)}</span>`).join('');
  const stats = t.stats.map((s) =>
    `<div class="stat"><strong>${esc(s.value)}</strong><span>${esc(s.label)}</span></div>`
  ).join('');

  const apps = t.applications.items.map((a, i) => `
    <article class="app-card">
      ${img(a.img, a.title, { w: 440, h: 300 })}
      <div class="app-body">
        <p class="app-num">0${i + 1}</p>
        <h3>${esc(a.title)}</h3>
        <p>${esc(a.body)}</p>
      </div>
    </article>`).join('');

  const famPrices = [
    Math.min(...doorSystems.flatMap((s) => s.items.map((i) => i.price))),
    Math.min(...[...guideConfigs.su, ...guideConfigs.sd].flatMap((c) => [c.sup.price, c.gui.price])),
    Math.min(...guideConfigs.sc.flatMap((c) => [c.sup.price, c.gui.price])),
    Math.min(...Object.values(sgFixed.prices)),
  ];
  const fams = t.featured.families.map((f, i) => `
    <a class="fam-card" href="${pagePath(t, 'products')}#sezione-0${[1, 2, 4, 5][i]}">
      ${img(f.img, f.title, { w: 440, h: 300 })}
      <div class="fam-body">
        <h3>${esc(f.title)}</h3>
        <p>${esc(f.body)}</p>
        <p class="fam-price">${esc(t.featured.fromPrice)} <strong>${esc(t.fmtPrice(famPrices[i]))}</strong> <small>${esc(t.featured.vatNote)}</small></p>
      </div>
    </a>`).join('');

  const patentRows = t.patent.rows.map(([k, v]) =>
    `<div class="spec-row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');

  const steps = t.order.steps.map((s, i) => `
    <li class="step">
      <p class="step-num" aria-hidden="true">${i + 1}</p>
      <h3>${esc(s.title)}</h3>
      <p>${i === 1 ? esc(s.body).replace('info@panevascensori.it', `<a href="mailto:${COMPANY.email}">${COMPANY.email}</a>`) : esc(s.body)}</p>
    </li>`).join('');

  const mailHref = `mailto:${COMPANY.email}?subject=${encodeURIComponent(t.order.mailSubject)}&body=${encodeURIComponent(t.order.mailBody)}`;

  return `
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <p class="kicker kicker-light">${esc(h.kicker)}</p>
      <h1>${esc(h.title)}</h1>
      <p class="hero-lead">${esc(h.lead)}</p>
      <div class="chips">${chips}</div>
      <div class="hero-cta">
        <a class="btn btn-white" href="${pagePath(t, 'products')}">${esc(h.ctaProducts)}</a>
        <a class="btn btn-outline" href="${CATALOG_PDF}" download>${esc(h.ctaCatalog)}</a>
      </div>
      <div class="patent-badge">
        <p><strong>${esc(h.patentLabel)} ${esc(h.numAbbr || 'N.')} ${PATENT.number}</strong></p>
        <p>${esc(h.patentOffice)}</p>
      </div>
    </div>
    <div class="hero-visual">
      ${img('staffe-4viste', h.title, { w: 560, h: 560, lazy: false })}
    </div>
  </div>
  <div class="wrap stats-band">${stats}</div>
</section>

<section class="section">
  <div class="wrap section-grid">
    <div>
      <p class="kicker">${esc(t.problem.kicker)}</p>
      <h2>${esc(t.problem.title)}</h2>
      <p>${esc(t.problem.body1)}</p>
      <p>${esc(t.problem.body2)}</p>
      <p class="tools-label">${esc(t.problem.toolsLabel)}</p>
      <div class="chips">${t.problem.tools.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>
    </div>
    <aside class="highlight-card">
      <h3>${esc(t.problem.highlight)}</h3>
      <p>${esc(t.problem.highlightBody)}</p>
      ${img('sistema-overview', t.problem.highlight, { w: 440, h: 330 })}
    </aside>
  </div>
</section>

<section class="section section-tint">
  <div class="wrap">
    <p class="kicker">${esc(t.applications.kicker)}</p>
    <h2>${esc(t.applications.title)}</h2>
    <div class="app-grid">${apps}</div>
    <p class="callout">${esc(t.applications.ambi)}</p>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <p class="kicker">${esc(t.featured.kicker)}</p>
    <h2>${esc(t.featured.title)}</h2>
    <div class="fam-grid">${fams}</div>
    <p class="center"><a class="btn btn-primary" href="${pagePath(t, 'products')}">${esc(t.featured.seeAll)}</a></p>
  </div>
</section>

<section class="section section-navy">
  <div class="wrap section-grid">
    <div>
      <p class="kicker kicker-light">${esc(t.patent.kicker)}</p>
      <h2>${esc(t.patent.title)}</h2>
      <p>${esc(t.patent.body)}</p>
      <p class="conformity">${esc(t.patent.conformity)}</p>
    </div>
    <dl class="spec-card">${patentRows}</dl>
  </div>
</section>

<section class="section" id="ordina">
  <div class="wrap">
    <p class="kicker">${esc(t.order.kicker)}</p>
    <h2>${esc(t.order.title)}</h2>
    <p class="lead">${esc(t.order.lead)}</p>
    <ol class="steps">${steps}</ol>
    <p class="callout">${esc(t.order.freeShipping)} ${esc(t.order.b2b)}</p>
    <p class="center"><a class="btn btn-primary" href="${mailHref}">${esc(t.nav.orderCta)}</a></p>
  </div>
</section>`;
}

// ── Продукти и ценоразпис ────────────────────────────────────
export function productsPage(t, locales) {
  const p = t.products;

  const chooseRows = p.chooseRows.map((r) =>
    `<tr>${r.map((c, i) => i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td>${esc(c)}</td>`).join('')}</tr>`).join('');

  // 01 — етажни врати
  const doorCards = doorSystems.map((s) => {
    const rows = s.items.map((it) =>
      itemRow(t, it, `${p.typeNames[it.type]} ${it.dims}`)).join('');
    return `
    <article class="sys-card" id="${s.id}">
      <div class="sys-media">${img(s.img, p.systemTitle(s.serie, s.variant), { w: 380, h: 380 })}</div>
      <div class="sys-body">
        <h3>${esc(p.systemTitle(s.serie, s.variant))}</h3>
        <p class="sys-specs"><span>${esc(p.regol)} <strong>${esc(s.regol)}</strong></span><span>${esc(p.sp)} <strong>${esc(s.sp)}</strong></span></p>
        <table class="price-table">
          <thead><tr><th scope="col">${esc(p.th.code)}</th><th scope="col">${esc(p.th.desc)}</th><th scope="col" class="num">${esc(p.th.price)}</th><th scope="col" class="act"><span class="visually-hidden">${esc(p.addToOrder)}</span></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </article>`;
  }).join('');

  // 02–04 — конфигурации опора+планка
  const cfgCards = (list) => list.map((c) => {
    const rows = [
      itemRow(t, c.sup, `${p.typeNames.supporto} ${c.sup.dims} · ${c.sup.sp}`),
      itemRow(t, c.gui, `${p.typeNames.guida} ${c.gui.dims} · ${c.gui.sp}`),
    ].join('');
    return `
    <article class="sys-card sys-card-cfg">
      <div class="sys-media">${img(c.img, `${c.sup.code} + ${c.gui.code}`, { w: 380, h: 300 })}</div>
      <div class="sys-body">
        <h3>${esc(c.sup.code)} · ${esc(c.gui.code)}</h3>
        <p class="sys-specs"><span>${esc(p.th.corsa)} <strong>${esc(c.corsa)}</strong></span><span>${esc(p.aletta)}</span></p>
        <table class="price-table">
          <tbody>${rows}</tbody>
        </table>
      </div>
    </article>`;
  }).join('');

  // 05 — SG матрица
  const sgHead = sgFixed.widths.map((w) => `<th scope="col" class="num">${w} mm</th>`).join('');
  const sgRows = sgFixed.lengths.map((l) => {
    const cells = sgFixed.widths.map((w) => {
      const price = sgFixed.prices[`${w}-${l}`];
      const code = `SG ${w} ${l}`;
      return `<td class="num sg-cell">
        <strong class="code">${code}</strong>
        <span class="price">${esc(t.fmtPrice(price))}</span>
        ${addBtn(t, { code, price, name: `${p.typeNames.guida} ${w} × ${l} mm` })}
      </td>`;
    }).join('');
    return `<tr><th scope="row">${l} mm</th>${cells}</tr>`;
  }).join('');

  // 06 — специални
  const specialRows = specials.map((it) =>
    itemRow(t, it, `${p.typeNames[it.type]} · ${it.dims}`)).join('');

  const s = p.sections;
  return `
<section class="page-head">
  <div class="wrap">
    <p class="kicker kicker-light">${esc(p.kicker)}</p>
    <h1>${esc(p.title)}</h1>
    <p class="sec-lead">${esc(p.lead)}</p>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <h2>${esc(p.chooseTitle)}</h2>
    <p>${esc(p.chooseLead)}</p>
    <div class="table-scroll">
      <table class="choose-table">
        <thead><tr>${p.chooseHead.map((hc) => `<th scope="col">${esc(hc)}</th>`).join('')}</tr></thead>
        <tbody>${chooseRows}</tbody>
      </table>
    </div>
  </div>
</section>

${sectionHead(t, s.doors, 'sezione-01')}
<section class="section">
  <div class="wrap">
    <div class="sys-list">${doorCards}</div>
    <p class="callout">${esc(s.doors.pairing)}</p>
    <p class="note">${esc(p.dxsx)}</p>
  </div>
</section>

${sectionHead(t, s.su, 'sezione-02')}
<section class="section"><div class="wrap"><div class="sys-list sys-list-2">${cfgCards(guideConfigs.su)}</div><p class="note">${esc(p.dxsx)}</p></div></section>

${sectionHead(t, s.sd, 'sezione-03')}
<section class="section"><div class="wrap"><div class="sys-list sys-list-2">${cfgCards(guideConfigs.sd)}</div><p class="note">${esc(p.dxsx)}</p></div></section>

${sectionHead(t, s.sc, 'sezione-04')}
<section class="section"><div class="wrap"><div class="sys-list sys-list-2">${cfgCards(guideConfigs.sc)}</div><p class="note">${esc(p.dxsx)}</p></div></section>

${sectionHead(t, s.sg, 'sezione-05')}
<section class="section">
  <div class="wrap">
    <div class="table-scroll">
      <table class="sg-table">
        <caption class="visually-hidden">${esc(s.sg.title)}</caption>
        <thead><tr><th scope="col">${esc(s.sg.tableCorner)}</th>${sgHead}</tr></thead>
        <tbody>${sgRows}</tbody>
      </table>
    </div>
  </div>
</section>

${sectionHead(t, s.special, 'sezione-06')}
<section class="section">
  <div class="wrap">
    <div class="table-scroll">
      <table class="price-table price-table-flat">
        <thead><tr><th scope="col">${esc(p.th.code)}</th><th scope="col">${esc(p.th.desc)}</th><th scope="col" class="num">${esc(p.th.price)}</th><th scope="col" class="act"><span class="visually-hidden">${esc(p.addToOrder)}</span></th></tr></thead>
        <tbody>${specialRows}</tbody>
      </table>
    </div>
    <p class="note">${esc(p.priceNote)}</p>
  </div>
</section>

<section class="section section-tint">
  <div class="wrap center">
    <h2>${esc(t.order.title)}</h2>
    <p class="lead">${esc(t.order.lead)}</p>
    <a class="btn btn-primary" href="mailto:${COMPANY.email}?subject=${encodeURIComponent(t.order.mailSubject)}&body=${encodeURIComponent(t.order.mailBody)}">${esc(t.nav.orderCta)}</a>
  </div>
</section>`;
}

// JSON-LD с продуктовия списък — само за страницата с листата.
export function productsLd(t) {
  const items = allPricedItems();
  return [{
    '@type': 'ItemList',
    name: t.meta.products.title,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: it.code,
        sku: it.code.replaceAll(' ', '-'),
        brand: { '@type': 'Brand', name: 'Panev Ascensori' },
        offers: {
          '@type': 'Offer',
          price: it.price.toFixed(2),
          priceCurrency: 'EUR',
          availability: 'https://schema.org/InStock',
          priceValidUntil: '2026-12-31',
          seller: { '@id': `${ORIGIN}/#organization` },
        },
      },
    })),
  }];
}

// ── Каталог ──────────────────────────────────────────────────
export function catalogPage(t, locales) {
  const c = t.catalogPage;
  const previews = [1, 5, 8, 10, 14, 20, 40, 63, 65].map((n) => {
    const nn = String(n).padStart(2, '0');
    return `<li><img src="/img/catalogo/pagina-${nn}.webp" alt="${esc(c.previewTitle)} — ${nn}" width="248" height="175" loading="lazy" decoding="async"></li>`;
  }).join('');
  const toc = c.toc.map((x) => `<li>${esc(x)}</li>`).join('');

  return `
<section class="page-head">
  <div class="wrap">
    <p class="kicker kicker-light">${esc(c.kicker)}</p>
    <h1>${esc(c.title)}</h1>
    <p class="sec-lead">${esc(c.lead)}</p>
    <div class="chips">
      <span class="chip chip-light">${esc(c.edition)}</span>
      <span class="chip chip-light">${esc(c.pages)}</span>
      <span class="chip chip-light">${esc(c.sizeNote)}</span>
    </div>
    <div class="hero-cta">
      <a class="btn btn-white" href="${CATALOG_PDF}" download>${esc(c.download)}</a>
      <a class="btn btn-outline" href="${CATALOG_PDF}" target="_blank" rel="noopener">${esc(c.view)}</a>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap catalog-grid">
    <div class="catalog-viewer">
      <object data="${CATALOG_PDF}#view=FitH" type="application/pdf" width="100%" height="640" aria-label="${esc(c.title)}">
        <p class="callout">${esc(c.fallback)}</p>
      </object>
    </div>
    <aside class="catalog-toc">
      <h2>${esc(c.tocTitle)}</h2>
      <ol>${toc}</ol>
      <p class="note">${esc(c.interactiveNote)}</p>
      <a class="btn btn-primary" href="${CATALOG_PDF}" download>${esc(c.download)}</a>
    </aside>
  </div>
</section>

<section class="section section-tint">
  <div class="wrap">
    <p class="kicker">${esc(c.previewKicker)}</p>
    <h2>${esc(c.previewTitle)}</h2>
    <ul class="preview-strip">${previews}</ul>
  </div>
</section>`;
}

export function catalogLd(t) {
  return [{
    '@type': 'DigitalDocument',
    name: t.meta.catalog.title,
    url: `${ORIGIN}${CATALOG_PDF}`,
    encodingFormat: 'application/pdf',
    inLanguage: 'it',
    datePublished: '2026-01-01',
    publisher: { '@id': `${ORIGIN}/#organization` },
  }];
}

// ── Контакти ─────────────────────────────────────────────────
export function contactsPage(t, locales) {
  const c = t.contactsPage;
  const f = c.fields;
  const mailHref = `mailto:${COMPANY.email}?subject=${encodeURIComponent(t.order.mailSubject)}&body=${encodeURIComponent(t.order.mailBody)}`;
  const ship = c.shipping.map((x) => `<li>${esc(x)}</li>`).join('');

  return `
<section class="page-head">
  <div class="wrap">
    <p class="kicker kicker-light">${esc(c.kicker)}</p>
    <h1>${esc(c.title)}</h1>
    <p class="sec-lead">${esc(c.lead)}</p>
  </div>
</section>

<section class="section">
  <div class="wrap contact-grid">
    <div>
      <div class="highlight-card contact-order">
        <h2>${esc(c.orderEmailTitle)}</h2>
        <p>${esc(c.orderEmailBody)}</p>
        <p class="contact-mail">${esc(c.writeUs)} <a href="mailto:${COMPANY.email}">${COMPANY.email}</a></p>
        <a class="btn btn-primary" href="${mailHref}">${esc(t.nav.orderCta)}</a>
      </div>

      <h2 class="mt">${esc(c.dataTitle)}</h2>
      <dl class="spec-card spec-card-plain">
        <div class="spec-row"><dt>${esc(c.rows.phone)}</dt><dd><a href="tel:${COMPANY.phoneHref}">${esc(COMPANY.phone)}</a></dd></div>
        <div class="spec-row"><dt>${esc(c.rows.email)}</dt><dd><a href="mailto:${COMPANY.email}">${esc(COMPANY.email)}</a></dd></div>
        <div class="spec-row"><dt>${esc(c.rows.web)}</dt><dd>${esc(COMPANY.site)}</dd></div>
        <div class="spec-row"><dt>${esc(c.rows.legal)}</dt><dd>${esc(COMPANY.legalSeat)}</dd></div>
        <div class="spec-row"><dt>${esc(c.rows.operative)}</dt><dd>${esc(COMPANY.operativeSeat)}</dd></div>
        <div class="spec-row"><dt>${esc(c.rows.vat)}</dt><dd>${esc(COMPANY.vat)}</dd></div>
      </dl>

      <h2 class="mt">${esc(c.shippingTitle)}</h2>
      <ul class="checklist">${ship}</ul>
    </div>

    <div id="modulo">
      <h2>${esc(c.formTitle)}</h2>
      <p>${esc(c.formLead)}</p>
      <form class="contact-form" data-contact-form novalidate>
        <label>${esc(f.name)}<input type="text" name="nome" autocomplete="name" required maxlength="150"></label>
        <label>${esc(f.company)}<input type="text" name="azienda" autocomplete="organization" maxlength="150"></label>
        <div class="form-row">
          <label>${esc(f.email)}<input type="email" name="email" autocomplete="email" required maxlength="200"></label>
          <label>${esc(f.tel)}<input type="tel" name="tel" autocomplete="tel" maxlength="30"></label>
        </div>
        <label>${esc(f.message)}<textarea name="messaggio" rows="7" required maxlength="3000"></textarea></label>
        <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="hp">
        <label class="check"><input type="checkbox" name="privacy" required> <span>${esc(f.privacy)} <a href="${pagePath(t, 'privacy')}">${esc(t.meta.privacy.title.split('—')[0].trim())}</a></span></label>
        <button class="btn btn-primary" type="submit" data-submit-label="${esc(f.submit)}" data-sending-label="${esc(f.sending)}">${esc(f.submit)}</button>
        <p class="form-status" data-form-status role="status" aria-live="polite"
           data-ok="${esc(f.ok)}" data-err="${esc(f.err)}"></p>
      </form>
    </div>
  </div>
</section>`;
}

export function contactsLd(t) {
  return [{
    '@type': 'ContactPage',
    url: `${ORIGIN}${pagePath(t, 'contacts')}`,
    name: t.meta.contacts.title,
    inLanguage: t.htmlLang,
  }];
}

// ── Правни страници ──────────────────────────────────────────
function legalBody(title, updated, intro, sections) {
  const secs = sections.map((s) => `<h2>${esc(s.h)}</h2><p>${esc(s.p)}</p>`).join('');
  return `
<section class="page-head page-head-slim">
  <div class="wrap"><h1>${esc(title)}</h1><p class="sec-lead">${esc(updated)}</p></div>
</section>
<section class="section">
  <div class="wrap legal-body">
    ${intro ? `<p class="lead">${esc(intro)}</p>` : ''}
    ${secs}
  </div>
</section>`;
}

export function privacyPage(t) {
  const p = t.privacyPage;
  return legalBody(p.title, p.updated, p.intro, p.sections);
}

export function termsPage(t) {
  const p = t.termsPage;
  return legalBody(p.title, p.updated, '', p.sections);
}
