import { COMPANY } from '../src/company.js';
import { lifetimeRuleParams } from '../src/plans/pricing.js';
import type { FaqId } from '../src/seo/structured-data.js';
import type { FurnitureRange } from '../src/services/furniture.js';
import { esc, icon, PAGES, titleBlock, type BrochureContext } from './pages.js';

/** Въпросите от витрината, които влизат и в брошурата. */
const BROCHURE_FAQ: readonly FaqId[] = ['install', 'languages', 'data'];

export function machine(c: BrochureContext): string {
  const { t, assets } = c;
  const formats = ['dxf', 'iso', 'grbl', 'csv', 'zip', 'drawings']
    .map((k) => {
      const layers =
        k === 'dxf'
          ? `<span class="b-layers">${assets.dxfLayers.map((l) => `<code>${esc(l)}</code>`).join('')}</span>`
          : '';
      return `<div><dt>${esc(t(`landing.machine.${k}.title`))}</dt><dd>${esc(t(`landing.machine.${k}.text`))}${layers}</dd></div>`;
    })
    .join('');
  return `<section class="b-page">
  <h2>${esc(t('landing.machine.title'))}</h2>
  <p class="b-lead">${esc(t('landing.machine.lead'))}</p>
  <div class="b-machine">
    <figure class="b-gcode"><pre>${esc(assets.gcode.join('\n'))}</pre><figcaption>${esc(t('landing.gcode.note', { no: assets.sheet.no, count: assets.sheet.count }))}</figcaption></figure>
    <dl class="b-formats">${formats}</dl>
  </div>
  <p class="b-caution">${icon('alert')}<span>${esc(t('landing.machine.caution'))}</span></p>
  ${titleBlock(c, 4)}
</section>`;
}

function rangeText(c: BrochureContext, range: FurnitureRange | null): string {
  if (!range) return '';
  if (range.kind === 'modules')
    return c.t('landing.kinds.modules', {
      min: range.min,
      max: range.max,
      wmin: c.num(range.widthMin),
      wmax: c.num(range.widthMax),
    });
  if (range.kind === 'mattress')
    return c.t('landing.kinds.mattress', { min: c.num(range.min), max: c.num(range.max) });
  return c.t('landing.kinds.width', { min: c.num(range.min), max: c.num(range.max) });
}

/** Всички видове в един мащаб: ширината и височината на всеки чертеж са в мм на хартията. */
export function kinds(c: BrochureContext): string {
  const { t, lineup } = c;
  const k = 1 / lineup.scale;
  const rows = lineup.groups
    .map((group) => {
      const items = group.items
        .map(
          (item) =>
            `<li><svg class="b-elev" viewBox="${item.x0} 0 ${item.width} ${group.rowHeight}" style="width:${(item.width * k).toFixed(2)}mm;height:${(group.rowHeight * k).toFixed(2)}mm" aria-hidden="true">${item.inner}</svg><b>${esc(t(`furniture.${item.kind.id}`))}</b><span class="mono">${c.num(item.width)} × ${c.num(item.height)}</span><small>${esc(rangeText(c, item.kind.range))}</small></li>`,
        )
        .join('');
      return `<section class="b-group"><h3>${esc(t(`furniture.group.${group.group}`))}</h3><ul class="b-row">${items}</ul></section>`;
    })
    .join('');
  return `<section class="b-page">
  <h2>${esc(t('landing.kinds.title'))}</h2>
  <p class="b-lead">${esc(t('landing.kinds.lead'))}</p>
  <div class="b-lineup">${rows}</div>
  <p class="b-note">${esc(t('brochure.kinds.scale', { n: lineup.count, scale: lineup.scale }))}</p>
  ${titleBlock(c, 5)}
</section>`;
}

export function prices(c: BrochureContext): string {
  const { t } = c;
  const cards = c.prices
    .map((row) => {
      const lifetime = row.id === 'lifetime';
      const period = lifetime
        ? t('landing.price.lifetime')
        : t('landing.price.months', { n: row.months ?? 0 });
      const per = lifetime
        ? t('landing.price.once')
        : t('landing.price.perMonth', { amount: c.money(row.perMonthWithVatCents ?? 0) });
      const off = row.discountPercent
        ? `<span class="b-off">${esc(t('landing.price.off', { pct: row.discountPercent }))}</span>`
        : '';
      return `<li class="b-price${lifetime ? ' b-lifetime' : ''}"><span class="b-period">${esc(period)}</span><span class="b-total">${esc(c.money(row.totalWithVatCents))}</span><span>${esc(per)}</span><span class="b-vat">${esc(t('landing.price.withoutVat', { amount: c.money(row.totalCents) }))}</span>${off}</li>`;
    })
    .join('');
  const notes = [
    t('landing.prices.vat', { vat: c.vatPercent }),
    t('brochure.prices.lifetime', lifetimeRuleParams(c.locale)),
    t('landing.prices.manual'),
    t('landing.prices.expired'),
  ]
    .map((n) => `<li>${esc(n)}</li>`)
    .join('');
  const terms = `<a href="${esc(c.url.terms)}">${esc(c.url.terms.replace(/^https:\/\//, ''))}</a>`;
  return `<section class="b-page b-last">
  <h2>${esc(t('landing.prices.title'))}</h2>
  <p class="b-trial-big">${esc(t('landing.prices.trial', { days: c.trialDays }))}</p>
  <ul class="b-prices">${cards}</ul>
  <ul class="b-notes">${notes}<li>${esc(t('brochure.prices.asOf', { date: c.priceDate, terms: '§' })).replace('§', terms)}</li></ul>
  <dl class="b-faq">${BROCHURE_FAQ.map(
    (id) =>
      `<div><dt>${esc(t(`landing.faq.${id}.q`))}</dt><dd>${esc(t(`landing.faq.${id}.a`))}</dd></div>`,
  ).join('')}</dl>
  <div class="b-close">
    <div>
      <h3>${esc(t('landing.closing.title'))}</h3>
      <p>${esc(t('landing.closing.text', { days: c.trialDays }))}</p>
      <p class="b-scan">${esc(t('brochure.contact.scan', { url: '§' })).replace('§', `<a href="${esc(c.url.site)}">${esc(c.url.label)}</a>`)}</p>
      <p>${esc(t('brochure.contact.questions', { email: '§' })).replace('§', `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`)}</p>
    </div>
    <a class="b-qr" href="${esc(c.url.site)}">${c.qr}</a>
  </div>
  <footer class="b-company"><p>${esc(c.company)}</p><p>Created and Designed by <a href="${COMPANY.url}" target="_blank" rel="noopener">Carbon Stealth VCC</a></p><span>${esc(t('brochure.sheet', { n: PAGES, total: PAGES }))}</span></footer>
</section>`;
}
