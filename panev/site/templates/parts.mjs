// Общите парчета HTML на страниците: 3D рендер, бутон за поръчка, цена, ред от ценоразписа, корица на секция.

import { esc } from './layout.mjs';

// 3D рендер от img/3d/ (прави ги `cd 3d && npm run site`): WebP в 480 и 960 px (large: и 1600 px),
// JPEG за стари браузъри. sizes е колко широко се показва мястото — браузърът взема по-малкия файл,
// където стига. Рендерите са 4:3 (h = 720 при ширина 960); изрязаните варианти подават своята h.
export function render3d(name, alt, { sizes, lazy = true, priority = false, large = false, h = 720 } = {}) {
  const src = (w, ext) => `/img/3d/${name}-${w}.${ext}`;
  const widths = large ? [480, 960, 1600] : [480, 960];
  return `<picture class="render">
  <source type="image/webp" srcset="${widths.map((w) => `${src(w, 'webp')} ${w}w`).join(', ')}" sizes="${sizes}">
  <img src="${src(960, 'jpg')}" alt="${esc(alt)}" width="960" height="${h}"${lazy ? ' loading="lazy" decoding="async"' : ''}${priority ? ' fetchpriority="high"' : ''}>
</picture>`;
}

export function addBtn(t, item, priceStr) {
  const data = `data-add data-code="${esc(item.code)}" data-price="${item.price ?? ''}" data-name="${esc(item.name || item.code)}"`;
  return `<button type="button" class="add-btn" ${data} aria-label="${esc(t.products.addToOrder)} — ${esc(item.code)}">${esc(t.products.addToOrder)}</button>`;
}

export function priceCell(t, price) {
  return price == null
    ? `<em class="price-quote">${esc(t.products.sections.special.quote)}</em>`
    : `<strong class="price">${esc(t.fmtPrice(price))}</strong>`;
}

export function itemRow(t, item, name) {
  return `<tr>
    <th scope="row" class="code">${esc(item.code)}</th>
    <td>${esc(name)}</td>
    <td class="num">${priceCell(t, item.price)}</td>
    <td class="act">${addBtn(t, { ...item, name })}</td>
  </tr>`;
}

export function sectionHead(t, sec, id) {
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
