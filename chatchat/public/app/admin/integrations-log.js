// Дневникът на доставките към helpdesk-а: статус, опити, последна грешка (само код), кога. „Чака
// предишното“ — събитие, което не изпреварва по-ранно недоставено на същия тикет. Dead-letter се
// пуска отново с бутон (сървърът пише одит); следващите събития на тикета тръгват след него.

import { t } from '../i18n.js';
import { call, fmtDateTime, query } from './core.js';
import { codeText, eventLabel, STATUSES } from './integrations-common.js';
import {
  badge,
  button,
  clear,
  dataTable,
  emptyState,
  errText,
  failure,
  field,
  h,
  loading,
  select,
  toast,
} from './ui.js';

const BADGE = { DELIVERED: 'ok', PENDING: 'info', SENDING: 'info', SKIPPED: 'idle', DEAD: 'stop' };

function statusCell(row) {
  if (row.status === 'PENDING' && row.blocked) return badge('warn', t('helpdesk.blocked'));
  return badge(BADGE[row.status] ?? 'idle', t(`helpdesk.status.${row.status}`));
}

export function deliveryLog() {
  const state = { items: [], next: null, serial: 0 };
  const results = h('div', { class: 'results', 'aria-live': 'polite' });
  const status = select(
    [
      { value: '', label: t('admin.integrations.log.all') },
      ...STATUSES.map((s) => ({ value: s, label: t(`helpdesk.status.${s}`) })),
    ],
    '',
  );

  const replay = async (row, btn) => {
    btn.disabled = true;
    try {
      await call('POST', `/admin/integrations/deliveries/${encodeURIComponent(row.id)}/replay`);
      toast(t('admin.integrations.log.replayed'));
      await load();
    } catch (err) {
      toast(codeText(err?.code) || errText(err), 'err');
      btn.disabled = false;
    }
  };

  const columns = [
    {
      label: t('admin.integrations.log.ticket'),
      render: (r) => h('span', { class: 'mono' }, r.ticketNumber),
    },
    { label: t('admin.integrations.log.event'), render: (r) => eventLabel(r.eventType) },
    { label: t('admin.integrations.log.status'), render: statusCell },
    { label: t('admin.integrations.log.attempts'), render: (r) => String(r.attempts) },
    {
      label: t('admin.integrations.log.error'),
      render: (r) =>
        r.lastError
          ? h(
              'div',
              { class: 'cell-main' },
              codeText(r.lastError),
              h('span', { class: 'muted mono small' }, r.lastError),
            )
          : '—',
    },
    {
      label: t('admin.integrations.log.updated'),
      render: (r) => fmtDateTime(r.deliveredAt ?? r.updatedAt),
    },
    {
      label: t('admin.integrations.log.actions'),
      cls: 'col-actions',
      render: (r) => {
        if (r.status !== 'DEAD') return '';
        const b = button(t('admin.integrations.log.replay'), () => void replay(r, b), {
          small: true,
          'aria-label': t('admin.integrations.log.replayFor', { number: r.ticketNumber }),
        });
        return b;
      },
    },
  ];

  const draw = () => {
    clear(results);
    results.append(
      state.items.length
        ? dataTable({ columns, rows: state.items, caption: t('admin.integrations.log.title') })
        : emptyState(t('admin.integrations.log.empty')),
    );
    if (state.next) {
      results.append(
        h(
          'div',
          { class: 'more' },
          button(t('admin.loadMore'), () => void load(true)),
        ),
      );
    }
  };

  async function load(append = false) {
    const mine = ++state.serial;
    if (!append) clear(results).append(loading());
    try {
      const res = await call(
        'GET',
        `/admin/integrations/deliveries${query({ status: status.value, after: append ? state.next : '' })}`,
      );
      if (mine !== state.serial) return;
      state.items = append ? [...state.items, ...res.items] : res.items;
      state.next = res.nextCursor;
      draw();
    } catch (err) {
      if (mine === state.serial) clear(results).append(failure(err, () => void load()));
    }
  }
  status.addEventListener('change', () => void load());

  const el = h(
    'div',
    {},
    h('div', { class: 'toolbar toolbar-wrap' }, field(t('admin.integrations.log.filter'), status)),
    h(
      'div',
      { class: 'btn-row' },
      button(t('admin.integrations.log.refresh'), () => void load()),
    ),
    results,
  );
  void load();
  return el;
}
