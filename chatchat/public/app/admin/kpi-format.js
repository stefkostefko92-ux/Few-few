// Форматиране и плочките на KPI. Стойностите идват k-анонимни от сървъра: „<5“ остава „<5“,
// дял без стойност (null) е „—“ — UI не допълва и не изчислява нищо от скритите клетки.

import { getLang, t } from '../i18n.js';
import { cellNode, SUPPRESSED } from './kpi-charts.js';
import { h } from './ui.js';

export function formatters() {
  const lang = getLang();
  const n0 = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 });
  const n1 = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const pct = new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 1 });
  const date = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const dateLong = new Intl.DateTimeFormat(lang, { dateStyle: 'medium' });
  return {
    number: (v) => n0.format(v),
    pct: (v) => pct.format(v),
    date: (iso) => date.format(new Date(iso)),
    dateLong: (iso) => dateLong.format(new Date(iso)),
    /** Секунди → мин / ч / дни (един знак след запетаята). */
    duration: (sec) => {
      if (sec === null || sec === undefined) return '—';
      if (sec < 3600) return t('admin.kpi.minutes', { n: n0.format(Math.round(sec / 60)) });
      if (sec < 48 * 3600) return t('admin.kpi.hours', { n: n1.format(sec / 3600) });
      return t('admin.kpi.days', { n: n1.format(sec / 86400) });
    },
  };
}

/** „7 от 20“ с „<5“ където е скрито. */
export function ofTotal(rate, f) {
  return h(
    'span',
    {},
    cellNode(rate.num, f.number),
    ` ${t('admin.kpi.of')} `,
    cellNode(rate.den, f.number),
  );
}

/** Голямото число на плочка за дял: процент, „<5“ (скрит числител/знаменател) или „—“. */
export function rateValue(rate, f) {
  if (rate.value !== null) return f.pct(rate.value);
  if (rate.num === SUPPRESSED || rate.den === SUPPRESSED) return cellNode(SUPPRESSED, f.number);
  return '—';
}

/**
 * Плочка: етикет, голямо число, подред и „Как се смята“ (<details>). `tone` — „stop“ за
 * показатели по безопасност (цветът е само подсилване, текстът носи смисъла).
 */
export function tile({ id, label, value, sub, def, tone }) {
  return h(
    'article',
    { class: `kpi-tile${tone ? ` kpi-tile-${tone}` : ''}`, 'aria-labelledby': `kpi-t-${id}` },
    h('h3', { class: 'kpi-label', id: `kpi-t-${id}` }, label),
    h('p', { class: 'kpi-value' }, value),
    sub ? h('p', { class: 'kpi-sub muted small' }, sub) : null,
    def
      ? h(
          'details',
          { class: 'kpi-def small' },
          h('summary', {}, t('admin.kpi.howCalc')),
          h('p', {}, def),
        )
      : null,
  );
}

export const tiles = (...children) => h('div', { class: 'kpi-tiles' }, ...children);

export const sectionTitle = (text) => h('h2', { class: 'kpi-h2' }, text);
