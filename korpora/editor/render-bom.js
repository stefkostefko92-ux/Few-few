// Разкрой tab: totals, the cut list, boards and edge band, hardware with prices and shop links.
import { $, esc, externalLink, fmt, mm, money, num, stat } from './dom.js';
import { STOCK } from '../engine/materials.js';
import { tx, txCount } from './text.js';

const edgeText = (arr) => (arr.length ? arr.map(num).join(' + ') : '—');

export function renderBom(state) {
  const { bom, nesting, spec } = state;
  const { rows, bands, boards, hardware, hardwareTotals, unpriced } = bom;
  const bandM = bands.reduce((a, b) => a + b.metres, 0);
  const pieces = hardware.reduce((a, h) => a + h.qty, 0);
  const totals =
    Object.entries(hardwareTotals)
      .map(([cur, v]) => money(v, cur))
      .join(' + ') || '—';
  $('#bom-summary').innerHTML = [
    stat(tx('bom.parts'), fmt(rows.length)),
    stat(tx('bom.sheets'), fmt(nesting.sheets.length)),
    stat(tx('bom.band'), `${fmt(bandM, 1)} m`),
    stat(tx('bom.hardware'), esc(tx('bom.pieces', { n: fmt(pieces) }))),
    stat(tx('bom.price'), totals),
  ].join('');
  $('#bom-parts tbody').innerHTML = rows
    .map(
      (r) => `<tr><td class="id">${r.id}</td><td>${esc(r.name)}</td>
<td class="num">${mm(r.L)} × ${mm(r.W)} × ${mm(r.T)}</td>
<td class="num${spec.bandCompensation ? ' hl' : ''}">${mm(r.cutL)} × ${mm(r.cutW)}</td>
<td>${esc(r.stockName)} · ${esc(r.decorName)}</td>
<td class="num">${edgeText(r.edgesL)}</td><td class="num">${edgeText(r.edgesW)}</td>
<td class="c">${r.grain ? `<span title="${esc(tx('bom.grain'))}">⟷</span>` : '—'}</td>
<td class="num">${r.holes || '—'}</td><td class="num">${r.edgeHoles || '—'}</td></tr>`,
    )
    .join('');
  $('#bom-materials').innerHTML =
    boards
      .map(
        (b) =>
          `<li><span>${esc(STOCK[b.stock].name)} ${b.thickness} mm · ${esc(b.decorName)}</span><span class="num">${fmt(b.area, 2)} m²</span></li>`,
      )
      .join('') +
    bands
      .map(
        (b) =>
          `<li><span>${esc(tx('bom.bandLine', { t: num(b.thickness), decor: b.decorName }))}</span><span class="num">${fmt(b.metres, 1)} m</span></li>`,
      )
      .join('') +
    `<li class="hint">${esc(tx('bom.bandHint'))}</li>`;
  $('#bom-hardware').innerHTML =
    hardware
      .map((h) => {
        const name = externalLink(h.url, h.name);
        const sub = [h.brand, h.sku, h.shop].filter(Boolean).join(' · ');
        return `<li><span>${name}${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="num">${h.qty} ${esc(h.unit)}${Number.isFinite(h.price) ? `<small>${money(h.price * h.qty, h.currency)}</small>` : ''}</span></li>`;
      })
      .join('') +
    (unpriced ? `<li class="hint">${esc(txCount(unpriced, 'bom.unpriced'))}</li>` : '');
  const edgeRows = rows.filter((r) => r.edgeHoles);
  $('#bom-edgeops').innerHTML = edgeRows.length
    ? `${edgeRows.map((r) => `<li><span>${r.id} ${esc(r.name)}</span><span class="num">${esc(tx('bom.pieces', { n: r.edgeHoles }))}</span></li>`).join('')}<li class="hint">${esc(tx('bom.edgeHint'))}</li>`
    : `<li class="hint">${esc(tx('bom.noEdgeOps'))}</li>`;
}
