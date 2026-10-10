// Лентата на визуализатора: страници, мащаб, към маркировките. Всички цели са ≥ 44 px (CSS .vw-tool).

import { h } from '../dom.js';
import { t } from '../i18n.js';

function tool(label, text, onclick, extra = '') {
  return h(
    'button',
    {
      class: `btn btn-secondary vw-tool ${extra}`.trim(),
      type: 'button',
      'aria-label': label,
      title: label,
      onclick,
    },
    text,
  );
}

/** actions: { prev, next, zoomIn, zoomOut, fit, mark } → { el, setPage, setZoom, setMarks, setBusy } */
export function buildToolbar(actions) {
  const status = h('span', { class: 'vw-status', role: 'status', 'aria-live': 'polite' });
  const zoom = h(
    'button',
    {
      class: 'btn btn-secondary vw-tool vw-zoom',
      type: 'button',
      'aria-label': t('viewer.fit'),
      title: t('viewer.fit'),
      onclick: actions.fit,
    },
    '100%',
  );
  const prev = tool(t('viewer.prev'), '‹', actions.prev);
  const next = tool(t('viewer.next'), '›', actions.next);
  const mark = tool(t('viewer.nextMark'), '◎', actions.mark, 'vw-mark-btn');
  mark.hidden = true;
  const busy = h('span', { class: 'vw-busy muted small', hidden: true }, t('viewer.rendering'));
  const el = h(
    'div',
    { class: 'vw-toolbar', role: 'toolbar', 'aria-label': t('viewer.toolbar') },
    h('div', { class: 'vw-group' }, prev, status, next),
    h(
      'div',
      { class: 'vw-group' },
      tool(t('viewer.zoomOut'), '−', actions.zoomOut),
      zoom,
      tool(t('viewer.zoomIn'), '+', actions.zoomIn),
    ),
    h('div', { class: 'vw-group' }, mark, busy),
  );
  return {
    el,
    setPage(n, total) {
      status.textContent = t('viewer.pageOf', { n, total });
      prev.disabled = n <= 1;
      next.disabled = n >= total;
    },
    setZoom(scale) {
      zoom.textContent = `${Math.round(scale * 100)}%`;
    },
    setMarks(has) {
      mark.hidden = !has;
    },
    setBusy(on) {
      busy.hidden = !on;
    },
  };
}
