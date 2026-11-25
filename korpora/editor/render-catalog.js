// Каталог tab: everything the catalog agents collected from Bulgarian shops and manufacturers, searchable, with CSV
// and JSON copies of the filtered view. Products without drilling data are listed but cannot be fitted.
import { $, esc, externalLink, fmt, money, swatchStyle, copyText, setHtml } from './dom.js';
import { toCsv } from '../engine/bom.js';
import { categoryName, handleTypeName } from './pickers.js';
import { tx } from './text.js';

const PAGE = 300;
const yes = (v) => (v === true ? tx('yes') : v === false ? tx('no') : '—');
const cols = (...names) => names.map((n) => tx(`col.${n}`));

const VIEWS = {
  handles: {
    label: () => tx('cat.handles'),
    cols: () =>
      cols(
        'name',
        'brand',
        'code',
        'kind',
        'holes',
        'spacing',
        'length',
        'finish',
        'price',
        'shop',
        'drillable',
      ),
    row: (h) => [
      h.name,
      h.brand ?? '',
      h.sku ?? '',
      handleTypeName(h.type) ?? '',
      h.holes ?? '',
      h.spacing ?? '',
      h.length ?? '',
      h.finish ?? '',
      Number.isFinite(h.price) ? `${h.price} ${h.currency}` : '',
      h.shop ?? '',
      yes(h.drillable),
    ],
    html: (h) =>
      `<td>${externalLink(h.url, h.name)}</td><td>${esc(h.brand ?? '—')}</td><td class="num">${esc(h.sku ?? '—')}</td><td>${esc(handleTypeName(h.type) ?? '—')}</td><td class="num">${h.holes ?? '—'}</td><td class="num">${h.spacing ? `${h.spacing} mm` : '—'}</td><td class="num">${h.length ? `${h.length} mm` : '—'}</td><td>${esc(h.finish ?? '—')}</td><td class="num">${money(h.price, h.currency)}</td><td>${esc(h.shop ?? '—')}</td><td class="c">${h.drillable ? '✓' : '—'}</td>`,
    text: (h) => `${h.name} ${h.brand ?? ''} ${h.sku ?? ''} ${h.finish ?? ''} ${h.shop ?? ''}`,
  },
  hinges: {
    label: () => tx('cat.hinges'),
    cols: () =>
      cols(
        'name',
        'brand',
        'mfrCode',
        'system',
        'angle',
        'overlay',
        'softClose',
        'price',
        'shop',
        'drillable',
      ),
    row: (h) => [
      h.name,
      h.brand ?? '',
      h.mfrSku ?? h.sku ?? '',
      h.systemName ?? '',
      h.angle ?? '',
      h.overlay ?? '',
      yes(h.softClose),
      Number.isFinite(h.price) ? `${h.price} ${h.currency}` : '',
      h.shop ?? '',
      yes(h.drillable),
    ],
    html: (h) =>
      `<td>${externalLink(h.url, h.name)}</td><td>${esc(h.brand ?? '—')}</td><td class="num">${esc(h.mfrSku ?? h.sku ?? '—')}</td><td>${esc(h.systemName ?? '—')}</td><td class="num">${h.angle ? `${h.angle}°` : '—'}</td><td>${esc(h.overlay ?? '—')}</td><td class="c">${yes(h.softClose)}</td><td class="num">${money(h.price, h.currency)}</td><td>${esc(h.shop ?? '—')}</td><td class="c">${h.drillable ? '✓' : '—'}</td>`,
    text: (h) =>
      `${h.name} ${h.brand ?? ''} ${h.mfrSku ?? ''} ${h.sku ?? ''} ${h.systemName ?? ''} ${h.shop ?? ''}`,
  },
  slides: {
    label: () => tx('cat.slides'),
    cols: () =>
      cols('name', 'brand', 'code', 'kind', 'lengths', 'load', 'price', 'shop', 'drillable'),
    row: (s) => [
      s.name,
      s.brand ?? '',
      s.sku ?? '',
      s.kind ?? '',
      (s.lengths ?? []).join(' / '),
      s.loadKg ?? '',
      Number.isFinite(s.price) ? `${s.price} ${s.currency}` : '',
      s.shop ?? '',
      yes(s.drillable),
    ],
    html: (s) =>
      `<td>${externalLink(s.url, s.name)}</td><td>${esc(s.brand ?? '—')}</td><td class="num">${esc(s.sku ?? '—')}</td><td>${esc(s.kind ?? '—')}</td><td class="num">${esc((s.lengths ?? []).join(' / ') || '—')}</td><td class="num">${s.loadKg ? `${s.loadKg} kg` : '—'}</td><td class="num">${money(s.price, s.currency)}</td><td>${esc(s.shop ?? '—')}</td><td class="c">${s.drillable ? '✓' : '—'}</td>`,
    text: (s) => `${s.name} ${s.brand ?? ''} ${s.sku ?? ''} ${s.kind ?? ''} ${s.shop ?? ''}`,
  },
  bed: {
    label: () => tx('cat.bed'),
    cols: () => cols('name', 'brand', 'code', 'kind', 'price', 'shop'),
    row: (b) => [
      b.name,
      b.brand ?? '',
      b.sku ?? '',
      b.kind ?? '',
      Number.isFinite(b.price) ? `${b.price} ${b.currency}` : '',
      b.shop ?? '',
    ],
    html: (b) =>
      `<td>${externalLink(b.url, b.name)}</td><td>${esc(b.brand ?? '—')}</td><td class="num">${esc(b.sku ?? '—')}</td><td>${esc(b.kind ?? '—')}</td><td class="num">${money(b.price, b.currency)}</td><td>${esc(b.shop ?? '—')}</td>`,
    text: (b) => `${b.name} ${b.brand ?? ''} ${b.sku ?? ''} ${b.kind ?? ''} ${b.shop ?? ''}`,
  },
  decors: {
    label: () => tx('cat.decors'),
    cols: () => cols('manufacturer', 'code', 'name', 'kind', 'gloss', 'hex', 'availableBg'),
    row: (d) => [
      d.manufacturer,
      d.code,
      d.name,
      categoryName(d.category),
      d.finish ?? '',
      d.hex,
      yes(d.availableBg),
    ],
    html: (d) =>
      `<td><i class="sw" data-css="${esc(swatchStyle(d))}"></i> ${esc(d.manufacturer)}</td><td class="num">${externalLink(d.url, d.code)}</td><td>${esc(d.name)}</td><td>${esc(categoryName(d.category))}</td><td>${esc(d.finish ?? '—')}</td><td class="num">${esc(d.hex)}</td><td class="c">${yes(d.availableBg)}</td>`,
    text: (d) => `${d.manufacturer} ${d.code} ${d.name} ${d.nameEn ?? ''}`,
  },
  ral: {
    label: () => 'RAL',
    cols: () => cols('code', 'nameEn', 'nameDe', 'hex'),
    row: (r) => [r.code, r.name, r.nameDe ?? '', r.hex],
    html: (r) =>
      `<td><i class="sw" data-css="${esc(`background:${r.hex}`)}"></i> <span class="num">${esc(r.code)}</span></td><td>${esc(r.name)}</td><td>${esc(r.nameDe ?? '—')}</td><td class="num">${esc(r.hex)}</td>`,
    text: (r) => `${r.code} ${r.name} ${r.nameDe ?? ''}`,
  },
};

const ui = { view: 'handles', q: '', shown: PAGE };

export function renderCatalog(catalog) {
  const counts = Object.fromEntries(Object.keys(VIEWS).map((k) => [k, catalog[k]?.length ?? 0]));
  $('#cat-views').innerHTML = Object.entries(VIEWS)
    .map(
      ([k, v]) =>
        `<button type="button" class="chip" data-view="${k}" aria-pressed="${k === ui.view}">${esc(v.label())} <small>${fmt(counts[k])}</small></button>`,
    )
    .join('');
  const v = VIEWS[ui.view];
  const items = (catalog[ui.view] ?? []).filter(
    (x) => !ui.q || v.text(x).toLowerCase().includes(ui.q),
  );
  const src = catalog.meta?.[ui.view];
  $('#cat-meta').innerHTML = src
    ? `${tx('of', { a: fmt(items.length), b: fmt(counts[ui.view]) })} · ${esc(src.summary)}`
    : tx('of', { a: fmt(items.length), b: fmt(counts[ui.view]) });
  $('#cat-table thead').innerHTML = `<tr>${v
    .cols()
    .map((c) => `<th>${esc(c)}</th>`)
    .join('')}</tr>`;
  setHtml(
    $('#cat-table tbody'),
    items
      .slice(0, ui.shown)
      .map((x) => `<tr>${v.html(x)}</tr>`)
      .join(''),
  );
  $('#cat-more').hidden = items.length <= ui.shown;
  $('#cat-more').textContent = tx('more', { n: fmt(Math.min(PAGE, items.length - ui.shown)) });
  ui.items = items;
}

export function bindCatalog(catalog) {
  $('#cat-views').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-view]');
    if (!b) return;
    ui.view = b.dataset.view;
    ui.shown = PAGE;
    renderCatalog(catalog);
  });
  $('#cat-q').addEventListener('input', (ev) => {
    ui.q = ev.target.value.trim().toLowerCase();
    ui.shown = PAGE;
    renderCatalog(catalog);
  });
  $('#cat-more').addEventListener('click', () => {
    ui.shown += PAGE;
    renderCatalog(catalog);
  });
  $('#cat-csv').addEventListener('click', (ev) =>
    copyText(toCsv([VIEWS[ui.view].cols(), ...ui.items.map(VIEWS[ui.view].row)]), ev.currentTarget),
  );
  $('#cat-json').addEventListener('click', (ev) =>
    copyText(JSON.stringify(ui.items, null, 1), ev.currentTarget),
  );
}
