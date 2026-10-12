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

/**
 * Префикси на действията за филтъра (`tests/audit-labels.test.ts` пази всяко действие от сървъра
 * покрито с група и етикет). `auth.` и `document.` (входове, прегледи на оригинали) се предлагат
 * само там, където сървърът ги дава — на платформения администратор.
 */
const GROUPS = [
  'kb.',
  'proposal.',
  'user.',
  'sso.',
  'catalog.',
  'quick_response.',
  'case.',
  'ticket.',
  'handoff.',
  'step.',
  'integration.',
  'attachment.',
  'conversation.',
  'message.',
  'ai.',
  'auth.',
  'document.',
  'retention.',
  'audit.',
];
const PLATFORM_ONLY = new Set(['auth.', 'document.']);
const OBJECT_TYPES = [
  'case',
  'ticket',
  'case_step',
  'step_approval',
  'step_policy',
  'document',
  'error',
  'proposal',
  'ingest_batch',
  'ingest',
  'user',
  'sso_config',
  'device',
  'product',
  'quick_response',
  'attachment',
  'conversation',
  'conversation_message',
  'helpdesk_integration',
  'helpdesk_delivery',
  'audit_checkpoint',
];

const labelOr = (key, raw) => (has(key) ? t(key) : raw);
const actionLabel = (a) => labelOr(`admin.audit.action.${a}`, a);
const objectLabel = (o) => labelOr(`admin.audit.object.${o}`, o);

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
      ...GROUPS.filter((g) => platform || !PLATFORM_ONLY.has(g)).map((g) => ({
        value: g,
        label: t(`admin.audit.group.${g}`),
      })),
    ],
    '',
  );
  const objectType = select(
    [
      { value: '', label: t('admin.audit.allObjects') },
      ...OBJECT_TYPES.map((o) => ({ value: o, label: objectLabel(o) })),
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
              objectLabel(e.objectType),
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
