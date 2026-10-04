// DOM and formatting helpers shared by the app modules.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const fmt = (v, d = 0) =>
  Number(v).toLocaleString('bg-BG', { minimumFractionDigits: d, maximumFractionDigits: d });

// CSP forbids style attributes in markup; inline values are written as data-css and applied through the CSSOM.
function hydrateStyles(root) {
  for (const el of root.querySelectorAll('[data-css]')) {
    el.style.cssText = el.getAttribute('data-css');
    el.removeAttribute('data-css');
  }
}

export function setHtml(el, html) {
  el.innerHTML = html;
  hydrateStyles(el);
}

// Drawings carry their own <style> for standalone files; in the page the same rules come from editor.css.
export const inlineSvg = (svg) => String(svg).replace(/<style>[\s\S]*?<\/style>/, '');
export const mm = (v) => {
  const x = Math.round(v * 10) / 10;
  return fmt(x, Number.isInteger(x) ? 0 : 1);
};
export const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const money = (v, cur) =>
  Number.isFinite(v)
    ? `${fmt(v, 2)} ${cur === 'EUR' ? '€' : cur === 'BGN' ? 'лв.' : (cur ?? '')}`.trim()
    : '—';
export const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Copy to the clipboard; when the browser refuses, select the text in `fallback` so Ctrl+C works (without one,
// say that it failed). The button's own label is kept once, so a second click in the meantime cannot replace it.
export async function copyText(text, btn, fallback) {
  btn.dataset.label ??= btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Копирано';
  } catch {
    if (fallback) {
      const range = document.createRange();
      range.selectNodeContents(fallback);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    btn.textContent = fallback ? 'Маркирано — Ctrl+C' : 'Копирането не успя';
  }
  window.clearTimeout(Number(btn.dataset.timer));
  btn.dataset.timer = String(
    window.setTimeout(() => {
      btn.textContent = btn.dataset.label;
    }, 1800),
  );
}

// A link out to a shop or a manufacturer: https only (catalog data comes from third parties), otherwise plain text.
export const externalLink = (url, text) =>
  typeof url === 'string' && /^https:\/\//.test(url)
    ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>`
    : esc(text);

// Today's date where the user is (YYYY-MM-DD); toISOString() gives the UTC date, in Europe the day before for the
// first hours after midnight.
export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const stat = (k, v) =>
  `<div class="stat"><span class="k">${esc(k)}</span><span class="v">${v}</span></div>`;

// Swatch CSS for a decor: wood decors get a soft grain gradient from their two tones.
export function swatchStyle(d) {
  if (!d) return 'background:#ddd';
  if (d.category === 'wood' && d.hexDark) {
    return `background:repeating-linear-gradient(100deg, ${d.hex} 0 7px, ${d.hexDark} 7px 8px, ${d.hex} 8px 13px)`;
  }
  return `background:${d.hex}`;
}
