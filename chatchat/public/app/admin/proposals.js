// Опашката с предложенията за знанието (FR-10, §11.3) — само за отговорника за знанието
// (kb:manage). Броячите по статус са и филтри (бутони с aria-pressed, не само цвят); източникът
// е отделен филтър. Действията (преглед, приемане с връзка, отхвърляне с причина) — proposals-actions.js.

import { t } from '../i18n.js';
import { call, fmtDateTime, query } from './core.js';
import { openProposal, proposalSummary, sourceBadge, statusBadge } from './proposals-actions.js';
import {
  button,
  clear,
  dataTable,
  emptyState,
  failure,
  field,
  h,
  loading,
  sectionHead,
  select,
} from './ui.js';

export const STATUSES = ['NEW', 'IN_REVIEW', 'ACCEPTED', 'REJECTED'];
const SOURCES = ['', 'FEEDBACK', 'SOLVED_CASE', 'CONFLICT'];

export function mount(root, params) {
  const state = {
    status: STATUSES.includes(params.get('status')) ? params.get('status') : 'NEW',
    source: SOURCES.includes(params.get('source')) ? params.get('source') : '',
    data: null,
    serial: 0,
  };
  const results = h('div', { class: 'results', 'aria-live': 'polite' });
  const chips = h('div', {
    class: 'chips kbq-counts',
    role: 'group',
    'aria-label': t('kbq.counts'),
  });
  const source = select(
    SOURCES.map((s) => ({ value: s, label: s ? t(`kbq.source.${s}`) : t('kbq.source.all') })),
    state.source,
  );

  const columns = [
    {
      label: t('kbq.col.source'),
      render: (p) =>
        h(
          'div',
          { class: 'cell-main' },
          sourceBadge(p.source),
          h('span', {}, statusBadge(p.status)),
        ),
    },
    { label: t('kbq.col.summary'), render: (p) => proposalSummary(p) },
    {
      label: t('kbq.col.case'),
      render: (p) => (p.case ? h('span', { class: 'mono' }, p.case.number) : '—'),
    },
    {
      label: t('kbq.col.seen'),
      render: (p) =>
        h(
          'div',
          { class: 'cell-main' },
          h('span', {}, fmtDateTime(p.lastSeenAt)),
          p.occurrences > 1
            ? h('span', { class: 'muted small' }, t('kbq.occurrences', { n: p.occurrences }))
            : null,
        ),
    },
    {
      label: t('admin.users.col.actions'),
      head: h('span', { class: 'sr-only' }, t('admin.users.col.actions')),
      cls: 'col-actions',
      render: (p) =>
        button(t('admin.open'), () => openProposal(p, () => void load()), {
          small: true,
          'aria-label': `${t('admin.open')}: ${t(`kbq.source.${p.source}`)} ${fmtDateTime(p.createdAt)}`,
        }),
    },
  ];

  const drawCounts = () => {
    const counts = state.data?.counts ?? {};
    chips.replaceChildren(
      ...STATUSES.map((s) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chip',
            'aria-pressed': String(state.status === s),
            onclick: () => {
              state.status = s;
              void load();
            },
          },
          `${t(`kbq.status.${s}`)} (${counts[s] ?? 0})`,
        ),
      ),
    );
  };

  const draw = () => {
    drawCounts();
    const rows = state.data?.proposals ?? [];
    clear(results).append(
      rows.length
        ? dataTable({ columns, rows, caption: t('kbq.nav') })
        : emptyState(t('kbq.empty'), t('kbq.empty.hint')),
    );
  };

  async function load() {
    const mine = ++state.serial;
    drawCounts();
    clear(results).append(loading());
    history.replaceState(
      null,
      '',
      `#proposals?${new URLSearchParams({ status: state.status, ...(state.source ? { source: state.source } : {}), keep: '1' })}`,
    );
    try {
      const res = await call(
        'GET',
        `/admin/proposals${query({ status: state.status, source: state.source })}`,
      );
      if (mine !== state.serial) return;
      state.data = res;
      draw();
    } catch (err) {
      if (mine === state.serial) clear(results).append(failure(err, () => void load()));
    }
  }
  source.addEventListener('change', () => {
    state.source = source.value;
    void load();
  });

  root.append(
    sectionHead(t('kbq.nav')),
    h('p', { class: 'muted lead' }, t('kbq.lead')),
    chips,
    h('div', { class: 'toolbar' }, field(t('kbq.filter.source'), source)),
    results,
  );
  void load();
}
