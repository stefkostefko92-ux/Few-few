// Общите парчета HTML на страниците: снимка, бутон за поръчка, цена, ред от ценоразписа, корица на секция.

import { esc } from './layout.mjs';

export function img(name, alt, { w = 480, h = 360, lazy = true, cls = '' } = {}) {
  return `<picture${cls ? ` class="${cls}"` : ''}>
  <source srcset="/img/${name}.webp" type="image/webp">
  <img src="/img/${name}.png" alt="${esc(alt)}" width="${w}" height="${h}"${lazy ? ' loading="lazy" decoding="async"' : ''}>
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
