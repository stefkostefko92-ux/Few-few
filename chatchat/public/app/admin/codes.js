// Кодове за грешка (FR-04): списък със статус, версии и източник; преглед, публикуване, свързване.

import { t } from '../i18n.js';
import { call, fwRange, query } from './core.js';
import { openCode } from './codes-detail.js';
import { newCode } from './codes-form.js';
import { statusBadge } from './kb-common.js';
import {
  badge,
  button,
  clear,
  dataTable,
  emptyState,
  failure,
  field,
  h,
  input,
  loading,
  sectionHead,
  select,
} from './ui.js';

const STATUSES = ['', 'DRAFT', 'REVIEW', 'PUBLISHED', 'DEPRECATED'];
const SEVERITY_KIND = { INFO: 'info', WARNING: 'warn', FAULT: 'stop', CRITICAL: 'stop' };

export function mount(root, params) {
  const state = { status: params.get('status') ?? '', q: '', rows: [], serial: 0, timer: null };
  const results = h('div', { class: 'results', 'aria-live': 'polite' });
  const status = select(
    STATUSES.map((s) => ({
      value: s,
      label: s ? t(`admin.status.${s}`) : t('admin.docs.allStatuses'),
    })),
    state.status,
  );
  const search = input({ type: 'search', placeholder: t('admin.codes.search'), maxlength: 80 });

  const columns = [
    {
      label: t('admin.codes.code'),
      render: (e) =>
        h(
          'div',
          { class: 'cell-main' },
          h('strong', { class: 'mono' }, e.code),
          h('span', { class: 'muted small' }, `v${e.version}`),
        ),
    },
    { label: t('admin.devices.model'), render: (e) => e.productModel },
    { label: t('admin.codes.title'), render: (e) => e.title },
    {
      label: t('admin.codes.severity'),
      render: (e) =>
        h(
          'div',
          { class: 'cell-main' },
          badge(SEVERITY_KIND[e.severity], t(`admin.severity.${e.severity}`)),
          e.safetyRelevant ? badge('warn', t('admin.docs.safetyBadge')) : null,
        ),
    },
    {
      label: t('admin.codes.scope'),
      render: (e) => `${e.hwRevision ? `HW ${e.hwRevision} · ` : ''}${fwRange(e.fwMin, e.fwMax)}`,
    },
    { label: t('admin.docs.status'), render: (e) => statusBadge(e.status) },
    {
      label: t('admin.codes.source'),
      render: (e) =>
        e.sourceDocument
          ? h(
              'div',
              { class: 'cell-main' },
              h(
                'span',
                { class: 'mono' },
                `${e.sourceDocument.code} · ${e.sourceDocument.revision}`,
              ),
              e.sourceDocument.status !== 'PUBLISHED'
                ? badge('warn', t(`admin.status.${e.sourceDocument.status}`))
                : null,
            )
          : '—',
    },
    {
      label: t('admin.users.col.actions'),
      head: h('span', { class: 'sr-only' }, t('admin.users.col.actions')),
      cls: 'col-actions',
      render: (e) =>
        button(t('admin.open'), () => void openCode(e, () => void load()), {
          small: true,
          'aria-label': `${t('admin.open')}: ${e.code} v${e.version}`,
        }),
    },
  ];

  const draw = () => {
    clear(results).append(
      state.rows.length
        ? dataTable({ columns, rows: state.rows, caption: t('admin.nav.codes') })
        : emptyState(t('admin.codes.empty'), t('admin.codes.empty.hint')),
    );
  };
  async function load() {
    const mine = ++state.serial;
    clear(results).append(loading());
    try {
      const res = await call('GET', `/admin/errors${query({ status: state.status, q: state.q })}`);
      if (mine !== state.serial) return;
      state.rows = res.errors;
      draw();
    } catch (err) {
      if (mine === state.serial) clear(results).append(failure(err, () => void load()));
    }
  }
  status.addEventListener('change', () => {
    state.status = status.value;
    void load();
  });
  search.addEventListener('input', () => {
    clearTimeout(state.timer);
    state.q = search.value.trim();
    state.timer = setTimeout(() => void load(), 300);
  });

  root.append(
    sectionHead(
      t('admin.nav.codes'),
      button(t('admin.codes.new'), () => void newCode(() => void load()), { kind: 'primary' }),
    ),
    h('p', { class: 'muted lead' }, t('admin.codes.lead')),
    h(
      'div',
      { class: 'toolbar' },
      field(t('admin.search'), search),
      field(t('admin.docs.status'), status),
    ),
    results,
  );
  void load();
  return () => clearTimeout(state.timer);
}
