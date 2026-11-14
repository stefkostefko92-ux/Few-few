// Nesting tab and the sheet SVG shared with the CNC simulation.
import { $, esc, fmt, mm, pct, stat } from './dom.js';
import { STOCK, decor, decorName, hasGrain } from '../engine/materials.js';

// Readable ink on a decor colour (relative luminance).
function inkFor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.33 ? '#1d221b' : '#f4f2ec';
}

export function sheetSvg(sh, opts = {}) {
  const pad = 46;
  const flip = (y, h = 0) => sh.h - y - h; // sheet Y up → SVG Y down
  const d = decor(sh.decor);
  const fill = sh.stock === 'hdf3' ? '#e9e4da' : d.hex;
  const ink = inkFor(fill);
  let s = `<svg viewBox="${-pad} ${-pad} ${sh.w + 2 * pad} ${sh.h + 2 * pad}" class="sheet" role="img" aria-label="Лист ${sh.index}: ${sh.placements.length} детайла">`;
  s += `<rect class="stock" x="0" y="0" width="${sh.w}" height="${sh.h}"/>`;
  if (hasGrain(sh.decor) && sh.stock !== 'hdf3')
    for (let y = 60; y < sh.h; y += 90)
      s += `<line class="grainline" x1="20" y1="${y}" x2="${sh.w - 20}" y2="${y}"/>`;
  if (sh.remnant && !opts.paths) {
    const r = sh.remnant;
    s += `<rect class="remnant" x="${r.x}" y="${flip(r.y, r.h)}" width="${r.w}" height="${r.h}"/>`;
    if (r.w > 900 && r.h > 260)
      s += `<text class="rlabel" x="${r.x + r.w / 2}" y="${flip(r.y, r.h) + r.h / 2 + 30}" text-anchor="middle">Остатък ${r.w} × ${r.h}</text>`;
  }
  for (const p of sh.placements) {
    const y = flip(p.y, p.h);
    s += `<g class="pl"><rect x="${p.x}" y="${y}" width="${p.w}" height="${p.h}" fill="${fill}"/>`;
    if (!opts.paths) {
      const minSide = Math.min(p.w, p.h);
      const big = minSide > 300;
      const fs = Math.min(130, Math.max(44, minSide * 0.45));
      s += `<text x="${p.x + p.w / 2}" y="${y + p.h / 2 + (big ? -14 : fs * 0.35)}" text-anchor="middle" font-size="${fs}" class="plid" fill="${ink}">${p.partId}</text>`;
      if (big)
        s += `<text x="${p.x + p.w / 2}" y="${y + p.h / 2 + 84}" text-anchor="middle" font-size="64" class="pldim" fill="${ink}">${mm(p.L)} × ${mm(p.W)}${p.rot ? ' ↻' : ''}</text>`;
    }
    s += '</g>';
  }
  if (opts.paths) s += opts.paths;
  return `${s}<text class="slabel" x="0" y="${sh.h + 36}">${sh.w} × ${sh.h} mm</text></svg>`;
}

export const sheetTitle = (sh) =>
  `${STOCK[sh.stock].name} ${STOCK[sh.stock].thickness} mm\u00a0· ${sh.stock === 'hdf3' ? 'бял' : decorName(sh.decor)}`;

// one sheet on full screen (fullscreen.js binds the click); the label is the page's own (editor.fullscreen)
const fsButton = (label) =>
  `<button type="button" class="btn btn-small fs-btn" data-fs-sheet><svg class="i" aria-hidden="true" focusable="false"><use href="#i-expand"/></svg><span>${esc(label)}</span></button>`;

export function renderNesting(state, fullscreenLabel) {
  const button = fsButton(fullscreenLabel);
  const { sheets, errors, spacing } = state.nesting;
  const total = sheets.reduce((a, s) => a + s.w * s.h, 0);
  const used = sheets.reduce((a, s) => a + s.yield * s.w * s.h, 0);
  $('#nest-summary').innerHTML = [
    stat('Листове', fmt(sheets.length)),
    stat('Оползотворяване', pct(total ? (used / total) * 100 : 0, 1)),
    stat('Отстояние', `${spacing} mm`),
    stat('Кант компенсиран', state.spec.bandCompensation ? 'да' : 'не'),
  ].join('');
  $('#nest-errors').innerHTML = errors.map((e) => `<p class="err">${esc(e)}</p>`).join('');
  $('#nest-sheets').innerHTML = sheets
    .map(
      (sh) =>
        `<figure class="sheetcard"><figcaption><span class="ttl"><strong>Лист ${sh.index}</strong><span class="meta">${esc(sheetTitle(sh))}</span></span><span class="side"><span class="num">${sh.placements.length} дет.\u00a0· ${pct(sh.yield * 100, 1)}</span>${button}</span></figcaption>${sheetSvg(sh)}</figure>`,
    )
    .join('');
}
