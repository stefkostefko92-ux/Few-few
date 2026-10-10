// Бързи отговори (FR-20): списък с версии, създаване/редакция и публикуване по роли и език.

import { t } from '../i18n.js';
import { call } from './core.js';
import { lifecycle, statusBadge } from './kb-common.js';
import { LOCALES, localeLabel, quickForm } from './quick-form.js';
import {
  button,
  clear,
  confirmDialog,
  dataTable,
  dialog,
  emptyState,
  errText,
  failure,
  field,
  h,
  input,
  loading,
  sectionHead,
  select,
  toast,
} from './ui.js';
import { roleLabel } from './users-common.js';

const STATUSES = ['', 'DRAFT', 'PUBLISHED', 'DEPRECATED'];

function openQuick(q, reload) {
  const buttons = h('div', { class: 'btn-row' });
  const editable = q.status !== 'REVIEW' || true;
  if (editable)
    buttons.append(button(t('admin.quick.act.edit'), () => (d.close(), quickForm(q, reload))));
  if (q.status === 'DRAFT' || q.status === 'REVIEW') {
    buttons.append(
      button(t('admin.quick.act.publish'), () => void move(q, 'publish', d, reload), {
        kind: 'primary',
      }),
    );
  }
  if (q.status === 'PUBLISHED') {
    buttons.append(
      button(t('admin.quick.act.deprecate'), () => void move(q, 'deprecate', d, reload), {
        kind: 'danger',
      }),
    );
  }
  const d = dialog({
    title: `${q.shortcut} · ${localeLabel(q.locale)} · v${q.version}`,
    wide: true,
    cancel: false,
    closeLabel: t('common.close'),
    body: [
      h('p', { class: 'doc-title' }, q.title),
      lifecycle(q.status),
      h('pre', { class: 'quote' }, q.body),
      h('h3', { class: 'sub' }, t('admin.quick.roles')),
      h('ul', { class: 'plain inline-list' }, ...q.roleScope.map((r) => h('li', {}, roleLabel(r)))),
      buttons,
    ],
    actions: [],
  });
}

async function move(q, action, detail, reload) {
  const ok = await confirmDialog({
    title: t(`admin.quick.act.${action}`),
    message: t(`admin.quick.confirm.${action}`, {
      shortcut: q.shortcut,
      locale: localeLabel(q.locale),
    }),
    confirmLabel: t(`admin.quick.act.${action}`),
    danger: action === 'deprecate',
  });
  if (!ok) return;
  detail.close();
  try {
    await call('POST', `/quick-responses/${q.id}/${action}`);
    toast(t(`admin.quick.done.${action}`, { shortcut: q.shortcut }));
    reload();
  } catch (err) {
    toast(errText(err), 'err');
  }
}

export function mount(root) {
  const state = { status: '', locale: '', q: '', rows: [], serial: 0 };
  const results = h('div', { class: 'results', 'aria-live': 'polite' });
  const status = select(
    STATUSES.map((s) => ({
      value: s,
      label: s ? t(`admin.status.${s}`) : t('admin.docs.allStatuses'),
    })),
    '',
  );
  const locale = select(
    [
      { value: '', label: t('admin.quick.allLocales') },
      ...LOCALES.map((l) => ({ value: l, label: localeLabel(l) })),
    ],
    '',
  );
  const search = input({ type: 'search', placeholder: t('admin.quick.search'), maxlength: 80 });

  const columns = [
    {
      label: t('admin.quick.shortcut'),
      render: (q) =>
        h(
          'div',
          { class: 'cell-main' },
          h('strong', { class: 'mono' }, `/${q.shortcut}`),
          h('span', { class: 'muted small' }, `${localeLabel(q.locale)} · v${q.version}`),
        ),
    },
    { label: t('admin.quick.title'), render: (q) => q.title },
    { label: t('admin.quick.roles'), render: (q) => q.roleScope.map(roleLabel).join(', ') },
    { label: t('admin.docs.status'), render: (q) => statusBadge(q.status) },
    {
      label: t('admin.users.col.actions'),
      head: h('span', { class: 'sr-only' }, t('admin.users.col.actions')),
      cls: 'col-actions',
      render: (q) =>
        button(t('admin.open'), () => openQuick(q, () => void load()), {
          small: true,
          'aria-label': `${t('admin.open')}: ${q.shortcut} ${q.locale} v${q.version}`,
        }),
    },
  ];

  const draw = () => {
    const needle = state.q.toLowerCase();
    const rows = state.rows.filter(
      (r) =>
        (!state.status || r.status === state.status) &&
        (!state.locale || r.locale === state.locale) &&
        (!needle || `${r.shortcut} ${r.title}`.toLowerCase().includes(needle)),
    );
    clear(results).append(
      rows.length
        ? dataTable({ columns, rows, caption: t('admin.nav.quick') })
        : emptyState(t('admin.quick.empty'), t('admin.quick.empty.hint')),
    );
  };
  async function load() {
    const mine = ++state.serial;
    clear(results).append(loading());
    try {
      const res = await call('GET', '/quick-responses/all');
      if (mine !== state.serial) return;
      state.rows = res.quickResponses;
      draw();
    } catch (err) {
      if (mine === state.serial) clear(results).append(failure(err, () => void load()));
    }
  }
  status.addEventListener('change', () => ((state.status = status.value), draw()));
  locale.addEventListener('change', () => ((state.locale = locale.value), draw()));
  search.addEventListener('input', () => ((state.q = search.value.trim()), draw()));

  root.append(
    sectionHead(
      t('admin.nav.quick'),
      button(t('admin.quick.new'), () => quickForm(null, () => void load()), { kind: 'primary' }),
    ),
    h('p', { class: 'muted lead' }, t('admin.quick.lead')),
    h(
      'div',
      { class: 'toolbar' },
      field(t('admin.search'), search),
      field(t('admin.docs.status'), status),
      field(t('admin.quick.locale'), locale),
    ),
    results,
  );
  void load();
}
