// Одит (GET /audit): верига от събития на клиента. Какво се вижда решава сървърът — администраторът
// на клиента не получава входове/изходи/MFA събития (чл. 4 Statuto dei Lavoratori); UI показва
// каквото дойде и го казва ясно, за да не изглежда, че липсва нещо.

import { has, t } from '../i18n.js';
import { call, fmtDateTime, me, query } from './core.js';
import {
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

/** Префикси на действията за филтъра; `auth.` се предлага само там, където сървърът го дава. */
const GROUPS = [
  'kb.',
  'user.',
  'catalog.',
  'quick_response.',
  'case.',
  'ticket.',
  'attachment.',
  'conversation.',
  'message.',
  'ai.',
  'auth.',
  'retention.',
];
const OBJECT_TYPES = ['user', 'document', 'error', 'device', 'product', 'quick_response'];

const actionLabel = (a) => (has(`admin.audit.action.${a}`) ? t(`admin.audit.action.${a}`) : a);

/** Началото на деня (локално) като ISO; `plusDays` за изключващата горна граница. */
function dayIso(value, plusDays = 0) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d + plusDays).toISOString();
}

export function mount(root) {
  const platform = me.user.role === 'PLATFORM_ADMIN';
  const state = { events: [], next: null, serial: 0 };
  const results = h('div', { class: 'results', 'aria-live': 'polite' });

  const group = select(
    [
      { value: '', label: t('admin.audit.allActions') },
      ...GROUPS.filter((g) => platform || g !== 'auth.').map((g) => ({
        value: g,
        label: t(`admin.audit.group.${g}`),
      })),
    ],
    '',
  );
  const objectType = select(
    [
      { value: '', label: t('admin.audit.allObjects') },
      ...OBJECT_TYPES.map((o) => ({ value: o, label: o })),
    ],
    '',
  );
  const actor = input({ maxlength: 40, placeholder: t('admin.audit.actor.placeholder') });
  const from = input({ type: 'date' });
  const to = input({ type: 'date' });

  const columns = [
    { label: t('admin.audit.id'), render: (e) => h('span', { class: 'mono' }, String(e.id)) },
    { label: t('admin.audit.at'), render: (e) => fmtDateTime(e.at) },
    {
      label: t('admin.audit.action'),
      render: (e) =>
        h(
          'div',
          { class: 'cell-main' },
          actionLabel(e.action),
          h('span', { class: 'muted mono small' }, e.action),
        ),
    },
    {
      label: t('admin.audit.object'),
      render: (e) =>
        e.objectType
          ? h(
              'div',
              { class: 'cell-main' },
              e.objectType,
              h('span', { class: 'muted mono small' }, e.objectId ?? ''),
            )
          : '—',
    },
    {
      label: t('admin.audit.actor'),
      render: (e) =>
        h(
          'span',
          { class: 'mono small' },
          e.actorId
            ? e.actorId === me.user.id
              ? `${e.actorId} (${t('admin.users.you')})`
              : e.actorId
            : '—',
        ),
    },
    {
      label: t('admin.audit.detail'),
      render: (e) => {
        if (!e.detail) return '—';
        const reason = typeof e.detail.reason === 'string' ? e.detail.reason : '';
        return h(
          'details',
          { class: 'detail' },
          h('summary', {}, reason || t('admin.audit.showDetail')),
          h('pre', { class: 'quote mono small' }, JSON.stringify(e.detail, null, 2)),
        );
      },
    },
  ];

  const draw = () => {
    clear(results);
    results.append(
      state.events.length
        ? dataTable({ columns, rows: state.events, caption: t('admin.nav.audit') })
        : emptyState(t('admin.audit.empty'), t('admin.audit.empty.hint')),
    );
    if (state.next)
      results.append(
        h(
          'div',
          { class: 'more' },
          button(t('admin.loadMore'), () => void load(true)),
        ),
      );
  };
  async function load(append = false) {
    const mine = ++state.serial;
    if (!append) clear(results).append(loading());
    try {
      const q = {
        action: group.value,
        objectType: objectType.value,
        actorId: actor.value.trim(),
        from: from.value ? dayIso(from.value) : '',
        to: to.value ? dayIso(to.value, 1) : '',
        before: append ? state.next : '',
      };
      const res = await call('GET', `/audit${query(q)}`);
      if (mine !== state.serial) return;
      state.events = append ? [...state.events, ...res.events] : res.events;
      state.next = res.next;
      draw();
    } catch (err) {
      if (mine === state.serial) clear(results).append(failure(err, () => void load()));
    }
  }
  let timer = null;
  for (const el of [group, objectType, from, to]) el.addEventListener('change', () => void load());
  actor.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => void load(), 350);
  });

  root.append(
    sectionHead(t('admin.nav.audit')),
    h('p', { class: 'muted lead' }, t('admin.audit.lead')),
    platform ? null : h('p', { class: 'note' }, t('admin.audit.tenantNote')),
    h(
      'div',
      { class: 'toolbar toolbar-wrap' },
      field(t('admin.audit.action'), group),
      field(t('admin.audit.object'), objectType),
      field(t('admin.audit.actor'), actor),
      field(t('admin.audit.from'), from),
      field(t('admin.audit.to'), to),
    ),
    results,
  );
  void load();
  return () => clearTimeout(timer);
}
