// widgets.mjs — „живите" карти в hero-то на демотата (резервация, график, продукти, показатели,
// консултация). Чист HTML/CSS върху темата — нула снимки, нула външни заявки.
import { esc, ICON } from "../lib/html.mjs";

const kinds = {
  /** Форма-карта: редове етикет → стойност + бутон. */
  booking: (w) => `<div class="widget w-booking"><h2 class="w-title">${esc(w.title)}</h2>${w.rows.map(([k, v]) => `<div class="w-row"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join("")}<span class="btn btn-primary w-cta">${esc(w.cta)} ${ICON.arrow}</span></div>`,
  /** Седмичен график: ден · час · занятие. */
  schedule: (w) => `<div class="widget w-schedule"><h2 class="w-title">${esc(w.title)}</h2><table><tbody>${w.rows.map(([d, h, n]) => `<tr><td>${esc(d)}</td><td>${esc(h)}</td><td><strong>${esc(n)}</strong></td></tr>`).join("")}</tbody></table>${w.cta ? `<span class="btn btn-primary w-cta">${esc(w.cta)} ${ICON.arrow}</span>` : ""}</div>`,
  /** Плочки: продукти / обяви / меню — име · подзаглавие · цена, с цветен „етикет“ вместо снимка. */
  tiles: (w) => `<div class="widget w-tiles"><h2 class="w-title">${esc(w.title)}</h2><div class="tiles">${w.rows.map(([n, s, p], i) => `<div class="tile tile-${i % 3}"><span class="tile-art" aria-hidden="true"></span><strong>${esc(n)}</strong><span>${esc(s)}</span><em>${esc(p)}</em></div>`).join("")}</div></div>`,
  /** Показатели: число + етикет (за счетоводство и др.). */
  stats: (w) => `<div class="widget w-stats"><h2 class="w-title">${esc(w.title)}</h2><div class="kpis">${w.rows.map(([n, l, d]) => `<div class="kpi${d ? " kpi-" + d : ""}"><strong>${esc(n)}</strong><span>${esc(l)}</span></div>`).join("")}</div>${w.cta ? `<span class="btn btn-primary w-cta">${esc(w.cta)} ${ICON.arrow}</span>` : ""}</div>`,
  /** Чеклист (консултация): точки с отметки + бутон. */
  consult: (w) => `<div class="widget w-consult"><h2 class="w-title">${esc(w.title)}</h2><ul>${w.rows.map((r) => `<li>${ICON.check}<span>${esc(r)}</span></li>`).join("")}</ul><span class="btn btn-primary w-cta">${esc(w.cta)} ${ICON.arrow}</span></div>`,
};

export function widget(w) {
  const fn = kinds[w.kind];
  if (!fn) throw new Error(`непознат widget kind: ${w.kind}`);
  return fn(w);
}
export const WIDGET_KINDS = Object.keys(kinds);
