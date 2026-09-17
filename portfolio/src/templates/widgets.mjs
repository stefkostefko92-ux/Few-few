// widgets.mjs — „живите" карти в hero-то на демотата. Не са картинки, а работещи UI парчета:
// booking = реална форма (услуга → цена, дата, час, име → потвърждение); schedule = избираем график;
// tiles = избираеми продукти/обяви/меню с брояч и сума; stats = показатели; consult = чеклист.
// Чист HTML върху темата — интерактивността е в demo.js, без backend (демо потвърждение).
import { esc, ICON } from "../lib/html.mjs";

const kinds = {
  booking: (w, c, t) => {
    const opts = t.services.map((s) => `<option value="${esc(s.t)}" data-price="${esc(s.p || "")}">${esc(s.t)}${s.p ? ` — ${esc(s.p)}` : ""}</option>`).join("");
    return `<form class="widget w-booking" data-widget="booking" novalidate><h2 class="w-title">${esc(w.title)}</h2><label class="w-field"><span>${esc(c.widget.service)}</span><select name="service" required><option value="">${esc(c.widget.pick)}…</option>${opts}</select></label><div class="w-2"><label class="w-field"><span>${esc(c.widget.date)}</span><input type="date" name="date" required></label><label class="w-field"><span>${esc(c.widget.time)}</span><select name="time">${["09:00", "10:30", "12:00", "14:00", "15:30", "17:00"].map((h) => `<option>${h}</option>`).join("")}</select></label></div><label class="w-field"><span>${esc(c.widget.name)}</span><input type="text" name="name" autocomplete="name" required></label><div class="w-row"><span>${esc(w.rows[w.rows.length - 1][0])}</span><strong data-price-out>${esc(w.rows[w.rows.length - 1][1])}</strong></div><button class="btn btn-primary w-cta" type="submit">${esc(w.cta)} ${ICON.arrow}</button><output class="w-done" aria-live="polite" data-msg="${esc(c.widget.done)}"></output></form>`;
  },
  schedule: (w, c) => `<div class="widget w-schedule" data-widget="schedule"><h2 class="w-title">${esc(w.title)}</h2><table><tbody>${w.rows.map(([d, h, n]) => `<tr tabindex="0" role="button" aria-pressed="false"><td>${esc(d)}</td><td>${esc(h)}</td><td><strong>${esc(n)}</strong></td></tr>`).join("")}</tbody></table>${w.cta ? `<button class="btn btn-primary w-cta" type="button"><span data-cta>${esc(w.cta)}</span> ${ICON.arrow}</button><output class="w-done" aria-live="polite" data-msg="${esc(c.widget.done)}"></output>` : ""}</div>`,
  tiles: (w, c) => `<div class="widget w-tiles" data-widget="tiles"><h2 class="w-title">${esc(w.title)}</h2><div class="tiles">${w.rows.map(([n, s, p], i) => `<button type="button" class="tile tile-${i % 3}" aria-pressed="false" data-price="${esc(p)}"><span class="tile-art" aria-hidden="true"></span><strong>${esc(n)}</strong><span>${esc(s)}</span><em>${esc(p)}</em></button>`).join("")}</div><div class="w-cart" hidden><span><b data-count>0</b> ${esc(c.widget.items)}</span><strong data-total></strong><button type="button" class="w-clear">${esc(c.widget.clear)}</button></div></div>`,
  stats: (w) => `<div class="widget w-stats" data-widget="stats"><h2 class="w-title">${esc(w.title)}</h2><div class="kpis">${w.rows.map(([n, l, d]) => `<div class="kpi${d ? " kpi-" + d : ""}"><strong data-countup>${esc(n)}</strong><span>${esc(l)}</span></div>`).join("")}</div>${w.cta ? `<a class="btn btn-primary w-cta" href="#contact">${esc(w.cta)} ${ICON.arrow}</a>` : ""}</div>`,
  consult: (w) => `<div class="widget w-consult" data-widget="consult"><h2 class="w-title">${esc(w.title)}</h2><ul>${w.rows.map((r) => `<li>${ICON.check}<span>${esc(r)}</span></li>`).join("")}</ul><a class="btn btn-primary w-cta" href="#contact">${esc(w.cta)} ${ICON.arrow}</a></div>`,
};

/** @param w widget данни · c = общите UI низове (common) · t = съдържанието на демото за езика */
export function widget(w, c, t) {
  const fn = kinds[w.kind];
  if (!fn) throw new Error(`непознат widget kind: ${w.kind}`);
  return fn(w, c, t);
}
export const WIDGET_KINDS = Object.keys(kinds);
