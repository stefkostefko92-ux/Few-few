// Директория на потребителите (FR-22/23/25, AC-16). Търсенето и филтрите са на сървъра;
// страницата държи само състоянието и рисува резултата (таблица, на мобилен — карти).

import { t } from '../i18n.js';
import { call, fmtDate, fmtDateTime, me, query } from './core.js';
import {
  badge,
  button,
  clear,
  dataTable,
  emptyState,
  failure,
  h,
  loading,
  sectionHead,
} from './ui.js';
import { bulkDialog } from './users-bulk.js';
import { roleLabel, permissionsFor } from './users-common.js';
import { createUser } from './users-create.js';
import { openUser } from './users-actions.js';
import { emptyFilter, filterBar, filterQuery } from './users-filters.js';

const PAGE = 50;

export function mount(root) {
  const state = {
    filter: emptyFilter(),
    users: [],
    next: null,
    selected: new Set(),
    serial: 0,
    timer: null,
  };
  const results = h('div', { class: 'results', 'aria-live': 'polite' });
  const bulkBar = h('div', { class: 'bulkbar', hidden: true });
  const more = h('div', { class: 'more' });

  const ctx = {
    reload: () => void load(),
    clearSelection: () => {
      state.selected.clear();
    },
  };

  const drawBulk = () => {
    bulkBar.hidden = state.selected.size === 0;
    bulkBar.replaceChildren(
      h('span', { class: 'bulk-n' }, t('admin.users.selected', { count: state.selected.size })),
      button(t('admin.users.bulk'), () => bulkDialog([...state.selected], ctx), {
        kind: 'primary',
        small: true,
      }),
      button(
        t('admin.users.deselect'),
        () => {
          state.selected.clear();
          draw();
        },
        { small: true },
      ),
    );
  };

  const statusBadge = (u) => {
    if (u.erased) return badge('idle', t('admin.users.erased'));
    if (!u.active) return badge('stop', t('admin.inactive'));
    if (u.expiresAt && new Date(u.expiresAt) <= new Date())
      return badge('warn', t('admin.users.expired'));
    return badge('ok', t('admin.active'));
  };

  const columns = [
    {
      label: t('admin.users.select'),
      cls: 'col-select',
      head: h('span', { class: 'sr-only' }, t('admin.users.select')),
      render: (u) => {
        const perm = permissionsFor(u);
        const box = h('input', {
          type: 'checkbox',
          'aria-label': t('admin.users.selectOne', { name: u.name }),
          disabled: !perm.select || undefined,
          checked: state.selected.has(u.id) || undefined,
          onchange: (e) => {
            if (e.target.checked) state.selected.add(u.id);
            else state.selected.delete(u.id);
            drawBulk();
          },
        });
        return box;
      },
    },
    {
      label: t('admin.users.col.account'),
      render: (u) =>
        h(
          'div',
          { class: 'cell-main' },
          h('strong', {}, u.name),
          h('span', { class: 'muted mono small' }, u.email),
          h(
            'span',
            { class: 'muted small' },
            `${t('admin.users.col.lastLogin')}: ${fmtDateTime(u.lastLoginAt) || '—'}`,
          ),
        ),
    },
    {
      label: t('admin.users.col.role'),
      render: (u) =>
        h(
          'div',
          { class: 'cell-main' },
          roleLabel(u.role),
          h('span', { class: 'muted small' }, t(`admin.kind.${u.kind}`)),
        ),
    },
    { label: t('admin.users.col.company'), render: (u) => u.company?.name ?? '—' },
    {
      label: t('admin.users.col.mfa'),
      render: (u) =>
        badge(u.mfaEnabled ? 'ok' : 'idle', u.mfaEnabled ? t('admin.on') : t('admin.off')),
    },
    { label: t('admin.users.col.status'), render: statusBadge },
    { label: t('admin.users.col.expires'), render: (u) => fmtDate(u.expiresAt) || '—' },
    {
      label: t('admin.users.col.actions'),
      head: h('span', { class: 'sr-only' }, t('admin.users.col.actions')),
      cls: 'col-actions',
      render: (u) =>
        button(
          u.id === me.user.id ? t('admin.users.you') : t('admin.users.open'),
          () => openUser(u, ctx),
          { small: true, 'aria-label': `${t('admin.users.open')}: ${u.name}` },
        ),
    },
  ];

  function draw() {
    clear(results);
    if (state.users.length === 0) {
      results.append(emptyState(t('admin.users.empty'), t('admin.users.empty.hint')));
    } else {
      const table = dataTable({ columns, rows: state.users, caption: t('admin.nav.users') });
      results.append(table);
    }
    clear(more);
    if (state.next) {
      more.append(button(t('admin.loadMore'), () => void load(true)));
    }
    results.append(more);
    drawBulk();
  }

  async function load(append = false) {
    const mine = ++state.serial;
    if (!append) {
      state.selected.clear();
      clear(results).append(loading());
    }
    try {
      const q = {
        ...filterQuery(state.filter),
        limit: PAGE,
        ...(append ? { cursor: state.next } : {}),
      };
      const res = await call('GET', `/admin/users${query(q)}`);
      if (mine !== state.serial) return;
      state.users = append ? [...state.users, ...res.users] : res.users;
      state.next = res.next;
      draw();
    } catch (err) {
      if (mine === state.serial) clear(results).append(failure(err, () => void load()));
    }
  }

  const bar = filterBar(state, ({ debounce } = {}) => {
    clearTimeout(state.timer);
    state.selected.clear();
    state.timer = setTimeout(() => void load(), debounce ? 300 : 0);
  });

  root.append(
    sectionHead(
      t('admin.nav.users'),
      button(t('admin.users.new'), () => void createUser(ctx), { kind: 'primary' }),
    ),
    h('p', { class: 'muted lead' }, t('admin.users.lead')),
    bar,
    bulkBar,
    results,
  );
  void load();
  return () => clearTimeout(state.timer);
}
