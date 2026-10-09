// Документи (§7, §4.1): списък по статус, качване и жизнен цикъл Чернова → Преглед → Публикуван → Отписан.

import { t } from '../i18n.js';
import { call, fmtDate, query } from './core.js';
import { openDocument } from './documents-detail.js';
import { uploadDocument } from './documents-upload.js';
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

export function mount(root, params) {
  const state = { status: params.get('status') ?? '', q: '', docs: [], serial: 0 };
  const results = h('div', { class: 'results', 'aria-live': 'polite' });
  const status = select(
    STATUSES.map((s) => ({
      value: s,
      label: s ? t(`admin.status.${s}`) : t('admin.docs.allStatuses'),
    })),
    state.status,
  );
  const search = input({ type: 'search', placeholder: t('admin.docs.search'), maxlength: 80 });

  const columns = [
    {
      label: t('admin.docs.code'),
      render: (d) =>
        h(
          'div',
          { class: 'cell-main' },
          h('strong', { class: 'mono' }, d.code),
          h('span', { class: 'muted small' }, `${t('admin.docs.revision')} ${d.revision}`),
        ),
    },
    { label: t('admin.docs.title'), render: (d) => d.title },
    { label: t('admin.docs.type'), render: (d) => t(`admin.docType.${d.type}`) },
    {
      label: t('admin.docs.safety'),
      render: (d) => (d.safetyRelevant ? badge('warn', t('admin.docs.safetyBadge')) : '—'),
    },
    { label: t('admin.docs.status'), render: (d) => statusBadge(d.status) },
    { label: t('admin.docs.publishedAt'), render: (d) => fmtDate(d.publishedAt) || '—' },
    {
      label: t('admin.users.col.actions'),
      head: h('span', { class: 'sr-only' }, t('admin.users.col.actions')),
      cls: 'col-actions',
      render: (d) =>
        button(t('admin.open'), () => openDocument(d, () => void load()), {
          small: true,
          'aria-label': `${t('admin.open')}: ${d.code} ${d.revision}`,
        }),
    },
  ];

  const draw = () => {
    const q = state.q.toLowerCase();
    const rows = state.docs.filter((d) => !q || `${d.code} ${d.title}`.toLowerCase().includes(q));
    clear(results).append(
      rows.length
        ? dataTable({ columns, rows, caption: t('admin.nav.documents') })
        : emptyState(t('admin.docs.empty'), t('admin.docs.empty.hint')),
    );
  };
  async function load() {
    const mine = ++state.serial;
    clear(results).append(loading());
    try {
      const res = await call('GET', `/admin/documents${query({ status: state.status })}`);
      if (mine !== state.serial) return;
      state.docs = res.documents;
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
    state.q = search.value.trim();
    draw();
  });

  root.append(
    sectionHead(
      t('admin.nav.documents'),
      button(t('admin.docs.upload'), () => void uploadDocument(() => void load()), {
        kind: 'primary',
      }),
    ),
    h('p', { class: 'muted lead' }, t('admin.docs.lead')),
    h(
      'div',
      { class: 'toolbar' },
      field(t('admin.search'), search),
      field(t('admin.docs.status'), status),
    ),
    results,
  );
  void load();
}
