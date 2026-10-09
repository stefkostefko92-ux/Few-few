// Простите графики на KPI: SVG без библиотеки, без inline стил (строг CSP — размерите са
// атрибути на SVG, цветовете — класове в kpi.css). Всяка графика има текстова алтернатива:
// разбивките СА таблица (лентата е украса, aria-hidden), серията има таблица под <details>.

import { t } from '../i18n.js';
import { dataTable, h } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
export const SUPPRESSED = '<5';

function s(tag, attrs = {}, ...children) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) node.setAttribute(k, String(v));
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

/** Числото за рисуване: скритата клетка („<5“) няма стойност. */
const num = (cell) => (typeof cell === 'number' ? cell : 0);

/** Клетка като текст: „<5“ с обяснение за екранния четец и подсказка. */
export function cellNode(cell, fmtNumber) {
  if (cell === SUPPRESSED) {
    return h(
      'span',
      { class: 'kpi-sup', title: t('admin.kpi.suppressed.title', { k: 5 }) },
      SUPPRESSED,
      h('span', { class: 'sr-only' }, ` (${t('admin.kpi.suppressed.title', { k: 5 })})`),
    );
  }
  return fmtNumber(cell);
}

/** Хоризонтална лента 0…100 % (украса до числото в таблицата). */
function bar(value, max, suppressed) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return s(
    'svg',
    {
      class: 'kpi-hbar',
      viewBox: '0 0 100 10',
      preserveAspectRatio: 'none',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    s('rect', { class: 'kpi-track', x: 0, y: 0, width: 100, height: 10 }),
    suppressed
      ? s('rect', { class: 'kpi-fill-sup', x: 0.5, y: 0.5, width: 6, height: 9 })
      : s('rect', { class: 'kpi-fill', x: 0, y: 0, width: w.toFixed(2), height: 10 }),
  );
}

/**
 * Разбивка като таблица с лента: [{label, cell}] + общото (за дяла). Скритите клетки нямат дял.
 */
export function barTable({ caption, items, total, fmtNumber, fmtPct, wide = false }) {
  const max = Math.max(0, ...items.map((i) => num(i.cell)));
  const known = typeof total === 'number' && total > 0;
  const columns = [
    { label: t('admin.kpi.col.label'), render: (i) => i.label },
    { label: t('admin.kpi.col.count'), cls: 'num', render: (i) => cellNode(i.cell, fmtNumber) },
    {
      label: t('admin.kpi.col.share'),
      cls: 'num',
      render: (i) => (known && typeof i.cell === 'number' ? fmtPct(i.cell / total) : '—'),
    },
    {
      label: t('admin.kpi.col.bar'),
      cls: 'kpi-bar-cell',
      render: (i) => bar(num(i.cell), max, i.cell === SUPPRESSED),
    },
  ];
  return h(
    'section',
    { class: wide ? 'kpi-figure kpi-figure-wide' : 'kpi-figure' },
    h('h3', { class: 'kpi-figcap' }, caption),
    dataTable({ columns, rows: items, caption }),
  );
}

/**
 * Серия по кофи (ден/седмица): стълб „създадени“ + вътрешен „от тях решени“. Скритите кофи са
 * пунктирани (горна граница 4). Оста и датите са HTML под графиката (текстът не се разтяга).
 */
export function seriesChart({ caption, series, fmtDate, fmtNumber }) {
  const W = 600;
  const H = 180;
  const n = Math.max(1, series.length);
  const slot = W / n;
  const gap = Math.min(4, slot * 0.25);
  const top = Math.max(
    5,
    ...series.map((b) => num(b.created)),
    ...series.map((b) => (b.created === SUPPRESSED ? 4 : 0)),
  );
  const y = (v) => H - (v / top) * (H - 6);
  const titleId = `kpi-series-${Math.random().toString(36).slice(2, 8)}`;
  const svg = s(
    'svg',
    {
      class: 'kpi-series',
      viewBox: `0 0 ${W} ${H}`,
      preserveAspectRatio: 'none',
      role: 'img',
      'aria-labelledby': titleId,
    },
    s('title', { id: titleId }, document.createTextNode(caption)),
    s('line', { class: 'kpi-axis', x1: 0, y1: H - 0.5, x2: W, y2: H - 0.5 }),
  );
  series.forEach((b, i) => {
    const x = i * slot + gap / 2;
    const w = Math.max(1, slot - gap);
    if (b.created === SUPPRESSED) {
      svg.append(s('rect', { class: 'kpi-col-sup', x, y: y(4), width: w, height: H - y(4) }));
    } else if (b.created > 0) {
      svg.append(
        s('rect', { class: 'kpi-col', x, y: y(b.created), width: w, height: H - y(b.created) }),
      );
      if (typeof b.resolved === 'number' && b.resolved > 0) {
        const iw = Math.max(1, w * 0.5);
        svg.append(
          s('rect', {
            class: 'kpi-col-2',
            x: x + (w - iw) / 2,
            y: y(b.resolved),
            width: iw,
            height: H - y(b.resolved),
          }),
        );
      }
    }
  });
  const first = series[0];
  const last = series.at(-1);
  const table = dataTable({
    caption,
    rows: series,
    columns: [
      { label: t('admin.kpi.series.bucket'), render: (b) => fmtDate(b.bucket) },
      {
        label: t('admin.kpi.series.created'),
        cls: 'num',
        render: (b) => cellNode(b.created, fmtNumber),
      },
      {
        label: t('admin.kpi.series.resolved'),
        cls: 'num',
        render: (b) => cellNode(b.resolved, fmtNumber),
      },
      {
        label: t('admin.kpi.series.escalated'),
        cls: 'num',
        render: (b) => cellNode(b.escalated, fmtNumber),
      },
    ],
  });
  return h(
    'section',
    { class: 'kpi-figure kpi-figure-wide' },
    h('h3', { class: 'kpi-figcap' }, caption),
    h(
      'div',
      { class: 'kpi-series-wrap' },
      h('span', { class: 'kpi-ymax muted small', 'aria-hidden': 'true' }, fmtNumber(top)),
      svg,
    ),
    h(
      'div',
      { class: 'kpi-xaxis muted small', 'aria-hidden': 'true' },
      h('span', {}, first ? fmtDate(first.bucket) : ''),
      h('span', {}, last ? fmtDate(last.bucket) : ''),
    ),
    h(
      'ul',
      { class: 'kpi-legend small' },
      h(
        'li',
        {},
        h('span', { class: 'kpi-key kpi-key-1', 'aria-hidden': 'true' }),
        t('admin.kpi.series.created'),
      ),
      h(
        'li',
        {},
        h('span', { class: 'kpi-key kpi-key-2', 'aria-hidden': 'true' }),
        t('admin.kpi.series.resolved'),
      ),
      h(
        'li',
        {},
        h('span', { class: 'kpi-key kpi-key-sup', 'aria-hidden': 'true' }),
        t('admin.kpi.suppressed.title', { k: 5 }),
      ),
    ),
    h('details', { class: 'kpi-table-alt' }, h('summary', {}, t('admin.kpi.showTable')), table),
  );
}
