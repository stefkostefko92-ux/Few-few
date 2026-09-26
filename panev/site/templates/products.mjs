// Продукти и ценоразпис, с JSON-LD ItemList.

import { esc, ORIGIN } from './layout.mjs';
import { img, addBtn, itemRow, sectionHead } from './parts.mjs';
import { COMPANY, doorSystems, guideConfigs, sgFixed, specials, allPricedItems } from '../data/products.mjs';

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
          <caption class="visually-hidden">${esc(c.sup.code)} · ${esc(c.gui.code)}</caption>
          <thead><tr><th scope="col">${esc(p.th.code)}</th><th scope="col">${esc(p.th.desc)}</th><th scope="col" class="num">${esc(p.th.price)}</th><th scope="col" class="act"><span class="visually-hidden">${esc(p.addToOrder)}</span></th></tr></thead>
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

  // 06 — специални (dims може да е локализируем ключ вместо суров низ)
  const specialRows = specials.map((it) =>
    itemRow(t, it, `${p.typeNames[it.type]} · ${it.dimsKey === 'onDrawing' ? p.dimsOnDrawing : it.dims}`)).join('');

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
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: it.price.toFixed(2),
            priceCurrency: 'EUR',
            valueAddedTaxIncluded: false,
          },
          businessFunction: 'http://purl.org/goodrelations/v1#Sell',
          availability: 'https://schema.org/InStock',
          priceValidUntil: '2026-12-31',
          seller: { '@id': `${ORIGIN}/#organization` },
        },
      },
    })),
  }];
}
