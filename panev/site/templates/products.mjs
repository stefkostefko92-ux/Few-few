// Продукти и ценоразпис, с JSON-LD ItemList. Секциите (01–06) са отделни функции: ползват ги и
// страниците по семейства (families.mjs). Всеки артикул е един Product с @id на страницата на
// семейството си — същият обект на листата и на семейството.

import { esc, ORIGIN, pagePath } from './layout.mjs';
import { render3d, addBtn, itemRow, sectionHead } from './parts.mjs';
import { versioned } from './asset.mjs';
import { COMPANY, CATALOG_VALID_UNTIL, doorSystems, guideConfigs, sgFixed, specials } from '../data/products.mjs';

// ── Семействата: кои секции събира всяка страница, страниците им в каталога, 3D изгледът ─────
export const FAMILIES = {
  famDoors:   { sections: ['doors'], pages: [13, 18], view: 'code=A-65-170-7&amp;mode=assembly' },
  famGuides:  { sections: ['su', 'sd', 'sc'], pages: [19, 55], view: 'code=SU-220-160&amp;mode=assembly' },
  famSg:      { sections: ['sg'], pages: [56, 59], view: 'code=SG-80-150' },
  famSpecial: { sections: ['special'], pages: [60, 62], view: 'code=BRACCIO-160-190' },
};
const SECTION_ID = { doors: 'sezione-01', su: 'sezione-02', sd: 'sezione-03', sc: 'sezione-04', sg: 'sezione-05', special: 'sezione-06' };
export const familyOf = (sec) => Object.keys(FAMILIES).find((k) => FAMILIES[k].sections.includes(sec));
const SIZES = '(max-width: 700px) 100vw, 380px';

function tableHead(p) {
  return `<thead><tr><th scope="col">${esc(p.th.code)}</th><th scope="col">${esc(p.th.desc)}</th><th scope="col" class="num">${esc(p.th.price)}</th><th scope="col" class="act"><span class="visually-hidden">${esc(p.addToOrder)}</span></th></tr></thead>`;
}

// Корицата на секция; на страницата с листата води и към страницата на семейството ѝ.
function cover(t, sec, link) {
  const html = sectionHead(t, t.products.sections[sec], SECTION_ID[sec]);
  if (!link) return html;
  const fam = familyOf(sec);
  const more = `<p class="sec-more"><a href="${pagePath(t, fam)}">${esc(t.families.shared.more)}: ${esc(t.families[fam].crumb)}</a></p>`;
  return html.replace(/<\/div>\s*<\/header>\s*$/, `${more}\n    </div>\n  </header>`);
}

function doorsBody(t) {
  const p = t.products;
  const cards = doorSystems.map((s) => {
    const rows = s.items.map((it) => itemRow(t, it, `${p.typeNames[it.type]} ${it.dims}`)).join('');
    // Какво показва рендерът: комплектът от името на файла (a-65-170-7_b-65-320 → A 65 170 7, B 65 320).
    const alt = t.families.shared.altDoor(s.serie, s.img.split('_').map((x) => x.toUpperCase().replaceAll('-', ' ')));
    return `
    <article class="sys-card" id="${s.id}">
      <div class="sys-media">${render3d(s.img, alt, { sizes: SIZES })}</div>
      <div class="sys-body">
        <h3>${esc(p.systemTitle(s.serie, s.variant))}</h3>
        <p class="sys-specs"><span>${esc(p.regol)} <strong>${esc(s.regol)}</strong></span><span>${esc(p.sp)} <strong>${esc(s.sp)}</strong></span></p>
        <table class="price-table">
          ${tableHead(p)}
          <tbody>${rows}</tbody>
        </table>
      </div>
    </article>`;
  }).join('');
  return `<section class="section">
  <div class="wrap">
    <div class="sys-list">${cards}</div>
    <p class="callout">${esc(p.sections.doors.pairing)}</p>
    <p class="note">${esc(p.dxsx)}</p>
  </div>
</section>`;
}

function cfgBody(t, key) {
  const p = t.products;
  const cards = guideConfigs[key].map((c) => {
    const rows = [
      itemRow(t, c.sup, `${p.typeNames.supporto} ${c.sup.dims} · ${c.sup.sp}`),
      itemRow(t, c.gui, `${p.typeNames.guida} ${c.gui.dims} · ${c.gui.sp}`),
    ].join('');
    return `
    <article class="sys-card sys-card-cfg">
      <div class="sys-media">${render3d(c.img, t.families.shared.altCfg(c.sup.code, c.gui.code), { sizes: SIZES })}</div>
      <div class="sys-body">
        <h3>${esc(c.sup.code)} · ${esc(c.gui.code)}</h3>
        <p class="sys-specs"><span>${esc(p.th.corsa)} <strong>${esc(c.corsa)}</strong></span><span>${esc(p.aletta)}</span></p>
        <table class="price-table">
          <caption class="visually-hidden">${esc(c.sup.code)} · ${esc(c.gui.code)}</caption>
          ${tableHead(p)}
          <tbody>${rows}</tbody>
        </table>
      </div>
    </article>`;
  }).join('');
  return `<section class="section"><div class="wrap"><div class="sys-list sys-list-2">${cards}</div><p class="note">${esc(p.dxsx)}</p></div></section>`;
}

function sgBody(t) {
  const p = t.products;
  const headCells = sgFixed.widths.map((w) => `<th scope="col" class="num">${w} mm</th>`).join('');
  const rows = sgFixed.lengths.map((l) => {
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
  return `<section class="section">
  <div class="wrap">
    <div class="table-scroll">
      <table class="sg-table">
        <caption class="visually-hidden">${esc(p.sections.sg.title)}</caption>
        <thead><tr><th scope="col">${esc(p.sections.sg.tableCorner)}</th>${headCells}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>
</section>`;
}

function specialBody(t) {
  const p = t.products;
  // dims може да е локализируем ключ вместо суров низ
  const rows = specials.map((it) =>
    itemRow(t, it, `${p.typeNames[it.type]} · ${it.dimsKey === 'onDrawing' ? p.dimsOnDrawing : it.dims}`)).join('');
  return `<section class="section">
  <div class="wrap">
    <div class="table-scroll">
      <table class="price-table price-table-flat">
        ${tableHead(p)}
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="note">${esc(p.priceNote)}</p>
  </div>
</section>`;
}

// Секциите в реда на каталога; link: корицата води към страницата на семейството (на листата).
export function sectionsHtml(t, keys, { link = false } = {}) {
  const body = { doors: doorsBody, su: (x) => cfgBody(x, 'su'), sd: (x) => cfgBody(x, 'sd'), sc: (x) => cfgBody(x, 'sc'), sg: sgBody, special: specialBody };
  return keys.map((k) => `${cover(t, k, link)}\n${body[k](t)}`).join('\n\n');
}

export function orderCta(t) {
  return `<section class="section section-tint">
  <div class="wrap center">
    <h2>${esc(t.order.title)}</h2>
    <p class="lead">${esc(t.order.lead)}</p>
    <a class="btn btn-primary" href="mailto:${COMPANY.email}?subject=${encodeURIComponent(t.order.mailSubject)}&body=${encodeURIComponent(t.order.mailBody)}">${esc(t.nav.orderCta)}</a>
  </div>
</section>`;
}

// ── Продукти и ценоразпис ────────────────────────────────────
export function productsPage(t) {
  const p = t.products;
  const chooseRows = p.chooseRows.map((r) =>
    `<tr>${r.map((c, i) => i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  const famLinks = Object.keys(FAMILIES).map((k) => `<li><a href="${pagePath(t, k)}">${esc(t.families[k].crumb)}</a></li>`).join('');
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
    <nav class="fam-links" aria-label="${esc(t.families.shared.familiesLabel)}"><ul>${famLinks}</ul></nav>
  </div>
</section>

${sectionsHtml(t, ['doors', 'su', 'sd', 'sc', 'sg', 'special'], { link: true })}

${orderCta(t)}`;
}

// ── JSON-LD: продуктите ──────────────────────────────────────
const slug = (code) => code.toLowerCase().replaceAll(' ', '-');
const image = (name) => `${ORIGIN}${versioned(`img/3d/${name}-960.jpg`)}`;

// Всички артикули в реда на каталога, всеки веднъж: { code, price, name, desc, img, sec }.
function catalogueItems(t) {
  const p = t.products;
  const out = new Map();
  const add = (it) => { if (!out.has(it.code)) out.set(it.code, it); };
  for (const s of doorSystems) {
    for (const it of s.items) add({ code: it.code, price: it.price, name: `${p.typeNames[it.type]} ${it.code}`, desc: `${p.typeNames[it.type]} ${it.dims} · ${p.sp} ${s.sp}`, img: s.img, sec: 'doors' });
  }
  for (const key of ['su', 'sd', 'sc']) {
    for (const c of guideConfigs[key]) {
      add({ code: c.sup.code, price: c.sup.price, name: `${p.typeNames.supporto} ${c.sup.code}`, desc: `${p.typeNames.supporto} ${c.sup.dims} · ${c.sup.sp} · ${p.th.corsa} ${c.corsa}`, img: c.img, sec: key });
    }
  }
  for (const w of sgFixed.widths) {
    for (const l of sgFixed.lengths) {
      const code = `SG ${w} ${l}`;
      add({ code, price: sgFixed.prices[`${w}-${l}`], name: `${p.typeNames.guida} ${code}`, desc: `${p.typeNames.guida} ${w} × ${l} mm · 4 mm`, img: 'sg-80-190', sec: 'sg' });
    }
  }
  for (const it of specials) {
    add({ code: it.code, price: it.price, name: `${p.typeNames[it.type]} ${it.code}`, desc: `${p.typeNames[it.type]} · ${it.dimsKey === 'onDrawing' ? p.dimsOnDrawing : it.dims}`, img: null, sec: 'special' });
  }
  return [...out.values()];
}

function productLd(t, it) {
  const fam = familyOf(it.sec);
  const url = `${ORIGIN}${pagePath(t, fam)}`;
  const product = {
    '@type': 'Product',
    '@id': `${url}#${slug(it.code)}`,
    name: it.name,
    sku: it.code,
    mpn: it.code,
    description: `${it.desc} — ${t.families[fam].crumb}`,
    category: t.families[fam].crumb,
    url,
    brand: { '@type': 'Brand', name: 'Panev Ascensori' },
    manufacturer: { '@id': `${ORIGIN}/#organization` },
    countryOfOrigin: 'IT',
  };
  if (it.img) product.image = image(it.img);
  if (it.price != null) {
    product.offers = {
      '@type': 'Offer',
      url,
      price: it.price.toFixed(2),
      priceCurrency: 'EUR',
      priceSpecification: { '@type': 'UnitPriceSpecification', price: it.price.toFixed(2), priceCurrency: 'EUR', valueAddedTaxIncluded: false },
      priceValidUntil: CATALOG_VALID_UNTIL,
      eligibleCustomerType: 'http://purl.org/goodrelations/v1#Business',
      businessFunction: 'http://purl.org/goodrelations/v1#Sell',
      seller: { '@id': `${ORIGIN}/#organization` },
    };
  }
  return product;
}

export function itemListLd(t, name, secs) {
  const items = catalogueItems(t).filter((it) => secs.includes(it.sec));
  return {
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, item: productLd(t, it) })),
  };
}

// JSON-LD на листата: всичките 48 артикула.
export function productsLd(t) {
  return [itemListLd(t, t.meta.products.title, ['doors', 'su', 'sd', 'sc', 'sg', 'special'])];
}
