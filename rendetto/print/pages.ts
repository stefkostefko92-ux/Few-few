import type { Locale, Translator } from '../src/i18n.js';
import type { PriceRow } from '../src/plans/pricing.js';
import { HOW_STEPS } from '../src/seo/structured-data.js';
import type { LandingAssets } from '../src/services/landing-assets.js';
import type { LineupGroup } from './lineup.js';

/** Всичко, от което се сглобява брошурата на един език. Текстът е от речниците, картините — от двигателя. */
export interface BrochureContext {
  locale: Locale;
  t: Translator;
  num: (value: number) => string;
  money: (cents: number) => string;
  url: { site: string; label: string; terms: string };
  assets: LandingAssets;
  lineup: { groups: LineupGroup[]; scale: number; count: number };
  prices: PriceRow[];
  trialDays: number;
  vatPercent: number;
  priceDate: string;
  render: string | null;
  qr: string;
  mark: string;
  email: string;
  company: string;
}

export const PAGES = 6;

export function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const ICON = {
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  drill: '<circle cx="12" cy="12" r="5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>',
  alert: '<path d="M12 3.5L2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17.2v.1"/>',
} as const;

export function icon(name: keyof typeof ICON): string {
  return `<svg class="b-i" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;
}

/** Каре в долния край — като на чертежите от програмата: кой лист от колко. */
export function titleBlock(c: BrochureContext, n: number): string {
  return `<footer class="b-tb"><span class="b-tb-brand">${c.mark}Rendetto</span><span>${esc(c.url.label)}</span><span>${esc(c.t('brochure.sheet', { n, total: PAGES }))}</span></footer>`;
}

/** Svg от чертеж на програмата с ширина в мм на хартията; класът `rdw` остава — стилът на чертежа е по него. */
function drawing(svg: string, widthMm: number): string {
  return svg.replace('class="rdw"', `class="rdw" style="width:${widthMm}mm;height:auto"`);
}

function viewBoxOf(svg: string): [number, number, number, number] {
  const box = /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(/\s+/).map(Number) ?? [0, 0, 420, 297];
  return [box[0] ?? 0, box[1] ?? 0, box[2] ?? 420, box[3] ?? 297];
}

export function cover(c: BrochureContext): string {
  const { t, assets } = c;
  const sheet = assets.sheet;
  const legend = [
    assets.tools.contour !== null
      ? `<span class="k-contour">${esc(t('landing.hero.keyContour', { d: c.num(assets.tools.contour) }))}</span>`
      : '',
    assets.tools.groove !== null
      ? `<span class="k-groove">${esc(t('landing.hero.keyGroove', { d: c.num(assets.tools.groove) }))}</span>`
      : '',
    assets.tools.drills.length
      ? `<span class="k-drill">${esc(t('landing.hero.keyDrill', { list: assets.tools.drills.map((d) => `Ø${c.num(d)}`).join(', ') }))}</span>`
      : '',
  ].join('');
  return `<section class="b-page b-cover">
  <header class="b-top"><span class="b-brand">${c.mark}Rendetto</span><a href="${esc(c.url.site)}">${esc(c.url.label)}</a></header>
  <h1><span>${esc(t('landing.hero.line1'))}</span> <span>${esc(t('landing.hero.line2'))}</span></h1>
  <p class="b-lead">${esc(t('landing.hero.lead'))}</p>
  <p class="b-for">${esc(t('brochure.cover.for'))}</p>
  <figure class="b-bed">${sheet.svg.replace(' aria-hidden="true" focusable="false"', '')}
    <figcaption>${esc(t('landing.hero.caption', { no: sheet.no, count: sheet.count, modules: assets.example.modules, width: c.num(assets.example.moduleWidth), parts: sheet.parts, holes: sheet.holes }))}<span class="b-keys">${legend}</span></figcaption>
  </figure>
  <p class="b-trial">${icon('clock')}<span>${esc(t('landing.hero.trial', { days: c.trialDays }))}</span></p>
  <p class="b-proof">${esc(t('brochure.cover.proof', { modules: assets.example.modules, width: c.num(assets.example.moduleWidth) }))}</p>
</section>`;
}

export function how(c: BrochureContext): string {
  const { t, assets } = c;
  const steps = HOW_STEPS.map(
    (n) =>
      `<li><span class="b-n">${n}</span><h3>${esc(t(`landing.how.s${n}.title`))}</h3><p>${esc(t(`landing.how.s${n}.text`))}</p></li>`,
  ).join('');
  const edges = (list: number[]) => (list.length ? list.map((v) => c.num(v)).join(' + ') : '—');
  const rows = assets.cutRows
    .map(
      (row) =>
        `<tr><td class="mono">${esc(row.id)}</td><td>${esc(t(`landing.cut.parts.${row.slot}`))}</td><td class="num">${c.num(row.L)} × ${c.num(row.W)} × ${c.num(row.T)}</td><td class="num">${c.num(row.cutL)} × ${c.num(row.cutW)}</td><td class="num">${edges(row.edgesL)}</td><td class="num">${edges(row.edgesW)}</td><td class="num">${row.holes || '—'}</td></tr>`,
    )
    .join('');
  const head = ['id', 'part', 'finished', 'cut', 'edgeL', 'edgeW', 'holes']
    .map((k, i) => `<th${i > 1 ? ' class="num"' : ''}>${esc(t(`landing.cut.${k}`))}</th>`)
    .join('');
  const render = c.render
    ? `<figure class="b-render"><img src="${c.render}" alt=""><figcaption>${esc(t('brochure.model.caption'))}</figcaption></figure>`
    : '';
  return `<section class="b-page">
  <h2>${esc(t('landing.how.title'))}</h2>
  <p class="b-lead">${esc(t('landing.how.lead'))}</p>
  <div class="b-how"><ol class="b-steps">${steps}</ol>${render}</div>
  <figure class="b-cut"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
    <figcaption>${esc(t('landing.cut.note', { shown: assets.cutRows.length, total: assets.example.parts }))}</figcaption></figure>
  <p class="b-rules">${esc(t('landing.kinds.rules'))}</p>
  ${titleBlock(c, 2)}
</section>`;
}

export function drilling(c: BrochureContext): string {
  const { t } = c;
  const door = c.assets.door;
  if (!door) return '';
  const cupMm = viewBoxOf(door.cup.svg)[2];
  const facts = [
    [
      'drill',
      t('landing.drilling.cup', {
        c: c.num(door.c),
        overlay: c.num(door.overlay),
        plate: c.num(door.plate),
      }),
    ],
    ['drill', t('landing.drilling.system32')],
    ['drill', t('landing.drilling.handles')],
    ['drill', t('landing.drilling.edges')],
    ['alert', t('landing.drilling.checks')],
  ] as const;
  return `<section class="b-page">
  <h2>${esc(t('landing.drilling.title'))}</h2>
  <p class="b-lead">${esc(t('landing.drilling.lead'))}</p>
  <figure class="b-sheet b-door">${drawing(door.elevation.svg, 172)}<figcaption>${esc(t('landing.drilling.caption', { h: c.num(door.height), w: c.num(door.width) }))}</figcaption></figure>
  <div class="b-drill">
    <figure class="b-sheet b-cup">${drawing(door.cup.svg, cupMm)}<figcaption>${esc(t('brochure.drilling.scale'))}</figcaption></figure>
    <ul class="b-facts">${facts.map(([i, text]) => `<li>${icon(i)}<span>${esc(text)}</span></li>`).join('')}</ul>
  </div>
  ${titleBlock(c, 3)}
</section>`;
}
