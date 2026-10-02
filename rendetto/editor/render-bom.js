// Разкрой tab: totals, the cut list, boards and edge band, hardware with prices and shop links.
import { $, esc, fmt, mm, money, stat } from './dom.js';
import { STOCK } from '../engine/materials.js';

const edgeText = (arr) =>
  arr.length ? arr.map((t) => String(t).replace('.', ',')).join(' + ') : '—';
const safeUrl = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);

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
    stat('Детайли', fmt(rows.length)),
    stat('Листове', fmt(nesting.sheets.length)),
    stat('Кант', `${fmt(bandM, 1)} m`),
    stat('Обков', `${fmt(pieces)} бр.`),
    stat('Обков, цена', totals),
  ].join('');
  $('#bom-parts tbody').innerHTML = rows
    .map(
      (r) => `<tr><td class="id">${r.id}</td><td>${esc(r.name)}</td>
<td class="num">${mm(r.L)} × ${mm(r.W)} × ${mm(r.T)}</td>
<td class="num${spec.bandCompensation ? ' hl' : ''}">${mm(r.cutL)} × ${mm(r.cutW)}</td>
<td>${esc(r.stockName)} · ${esc(r.decorName)}</td>
<td class="num">${edgeText(r.edgesL)}</td><td class="num">${edgeText(r.edgesW)}</td>
<td class="c">${r.grain ? '<span title="Шарката е по дължината">⟷</span>' : '—'}</td>
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
          `<li><span>Кант ${String(b.thickness).replace('.', ',')} mm · ${esc(b.decorName)}</span><span class="num">${fmt(b.metres, 1)} m</span></li>`,
      )
      .join('') +
    '<li class="hint">Кантът е по точни дължини, без надбавка за подрязване.</li>';
  $('#bom-hardware').innerHTML =
    hardware
      .map((h) => {
        const url = safeUrl(h.url);
        const name = url
          ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(h.name)}</a>`
          : esc(h.name);
        const sub = [h.brand, h.sku, h.shop].filter(Boolean).join(' · ');
        return `<li><span>${name}${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="num">${h.qty} ${esc(h.unit)}${Number.isFinite(h.price) ? `<small>${money(h.price * h.qty, h.currency)}</small>` : ''}</span></li>`;
      })
      .join('') +
    (unpriced
      ? `<li class="hint">${unpriced} позиции без цена — крепежи и обща фурнитура.</li>`
      : '');
  const edgeRows = rows.filter((r) => r.edgeHoles);
  $('#bom-edgeops').innerHTML = edgeRows.length
    ? `${edgeRows.map((r) => `<li><span>${r.id} ${esc(r.name)}</span><span class="num">${r.edgeHoles} бр.</span></li>`).join('')}<li class="hint">Хоризонталните отвори в челата не се правят на 3-осна машина: пробивна машина или шаблон.</li>`
    : '<li class="hint">Няма операции извън CNC.</li>';
}
