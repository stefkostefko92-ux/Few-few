// Опашката на персонала (FR-09, FR-19): неназначени / мои / всички, по статус, по опашка, по
// възраст. Под нея — заявките за разрешение, по които човекът може да реши (§11.2). Редовете
// носят само номер, модел/код, статуси и отговорник — съдържанието е в самия случай.

import { $, announce, clear, h } from '../dom.js';
import { fmtStamp } from '../format.js';
import { t } from '../i18n.js';
import { can } from '../workspace/caps.js';
import { flowApi, flowError } from './api.js';
import { personText } from './people.js';

const STATUSES = ['', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'CLOSED'];
const filters = { view: 'unassigned', status: '', queue: '', sort: 'age' };

/** „от 3 ч“ — възрастта на тикета (сървърът дава часа на създаване). */
export function ageText(iso, now = Date.now()) {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (min < 60) return t('queue.age.min', { n: min });
  const hours = Math.round(min / 60);
  if (hours < 48) return t('queue.age.hour', { n: hours });
  return t('queue.age.day', { n: Math.round(hours / 24) });
}

function select(id, label, value, options, onchange) {
  return h(
    'label',
    { class: 'queue-filter', for: id },
    h('span', null, label),
    h(
      'select',
      { id, onchange: (e) => onchange(e.currentTarget.value) },
      options.map(([v, text]) => {
        const o = h('option', { value: v }, text);
        if (v === value) o.selected = true;
        return o;
      }),
    ),
  );
}

/** Филтрите се рисуват веднъж — при смяна се презарежда само списъкът (фокусът остава). */
function tools(rerender) {
  const views = ['unassigned', 'mine', 'all'].map((v) =>
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-secondary btn-sm',
        'aria-pressed': String(filters.view === v),
        'data-view': v,
        onclick: (e) => {
          filters.view = v;
          for (const b of e.currentTarget.parentElement.children) {
            b.setAttribute('aria-pressed', String(b.dataset.view === v));
          }
          void rerender();
        },
      },
      t(`queue.view.${v}`),
    ),
  );
  const set = (k) => (v) => {
    filters[k] = v;
    void rerender();
  };
  return [
    h('div', { class: 'queue-views', role: 'group', 'aria-label': t('queue.viewLabel') }, views),
    select(
      'queue-status',
      t('queue.status'),
      filters.status,
      STATUSES.map((s) => [s, s ? t(`ticketstatus.${s}`) : t('queue.allOpen')]),
      set('status'),
    ),
    select(
      'queue-queue',
      t('queue.queue'),
      filters.queue,
      [
        ['', t('queue.allQueues')],
        ['SUPPORT', t('queue.name.SUPPORT')],
        ['ENGINEERING', t('queue.name.ENGINEERING')],
      ],
      set('queue'),
    ),
    select(
      'queue-sort',
      t('queue.sort'),
      filters.sort,
      [
        ['age', t('queue.sortAge')],
        ['updated', t('queue.sortUpdated')],
      ],
      set('sort'),
    ),
  ];
}

function ticketRow(tk, { onOpenCase, rerender }) {
  const label = `${tk.number} · ${tk.case.productModel ?? t('cases.noModel')}${tk.case.errorCode ? ` · ${tk.case.errorCode}` : ''}`;
  const flags = [
    t(`ticketstatus.${tk.status}`),
    t(`queue.name.${tk.queue}`),
    tk.owner ? personText(tk.owner) : t('case.unassigned'),
    tk.waitingForData ? t('queue.waitingData') : null,
    tk.case.aiPaused ? t('queue.aiPaused') : null,
    tk.pendingApprovals > 0 ? t('queue.pendingApprovals', { count: tk.pendingApprovals }) : null,
  ].filter(Boolean);
  const msg = h('p', { class: 'step-msg', role: 'status' });
  const claim =
    !tk.owner && tk.status !== 'CLOSED' && can('case:assign')
      ? h(
          'button',
          {
            type: 'button',
            class: 'btn btn-primary btn-sm',
            'aria-label': t('queue.claimLabel', { number: tk.number }),
            onclick: async (e) => {
              // След await `currentTarget` е null — бутонът се взима преди заявката.
              const btn = e.currentTarget;
              btn.disabled = true;
              try {
                await flowApi.act(tk.id, 'claim');
                announce(t('queue.claimed', { number: tk.number }));
                await rerender();
                $('#list-title')?.focus();
              } catch (err) {
                msg.textContent = flowError(err);
                btn.disabled = false;
              }
            },
          },
          t('queue.claim'),
        )
      : null;
  return h(
    'li',
    { class: 'queue-row' },
    h(
      'button',
      { type: 'button', class: 'conv-item queue-open', onclick: () => onOpenCase(tk.case.id) },
      h('span', { class: 'conv-title-text mono' }, label),
      h('span', { class: 'conv-preview' }, `${flags.join(' · ')} · ${ageText(tk.createdAt)}`),
    ),
    claim,
    msg,
  );
}

function approvalRow(a, onOpenCase) {
  return h(
    'li',
    { class: 'queue-row' },
    h(
      'button',
      { type: 'button', class: 'conv-item queue-open', onclick: () => onOpenCase(a.caseId) },
      h(
        'span',
        { class: 'conv-title-text mono' },
        `${a.caseNumber} · ${t('step.label', { step: a.step })}`,
      ),
      h(
        'span',
        { class: 'conv-preview' },
        `${a.action ?? ''} · ${t(`step.level.${a.level}`)} · ${personText(a.requestedBy)} · ${fmtStamp(a.requestedAt)}`,
      ),
    ),
  );
}

let openCase = () => undefined;

/** Изгледът „опашка“: заглавие и филтри веднъж, после списъкът. */
export function renderQueue({ onOpenCase }) {
  openCase = onOpenCase;
  $('#list-title').textContent = t('queue.title');
  clear($('#list-tools')).append(...tools(refreshQueue));
  clear($('#list-body'));
  return refreshQueue();
}

/** Само списъкът (смяна на филтър, събитие в реално време) — филтрите и фокусът остават. */
export async function refreshQueue() {
  const onOpenCase = openCase;
  const rerender = refreshQueue;
  const body = $('#list-body');
  if (!body.firstChild) body.append(h('p', { class: 'muted' }, t('conv.loading')));
  try {
    const params = { view: filters.view, sort: filters.sort };
    if (filters.status) params.status = filters.status;
    if (filters.queue) params.queue = filters.queue;
    const [data, approvals] = await Promise.all([
      flowApi.queue(params),
      can('step:approve') ? flowApi.pendingApprovals() : Promise.resolve({ approvals: [] }),
    ]);
    clear(body);
    body.append(
      h(
        'p',
        { class: 'muted' },
        t('queue.counts', {
          unassigned: data.counts?.unassigned ?? 0,
          mine: data.counts?.mine ?? 0,
        }),
      ),
    );
    const tickets = data.tickets ?? [];
    if (!tickets.length) body.append(h('p', { class: 'muted' }, t('queue.empty')));
    else
      body.append(
        h(
          'ul',
          { class: 'side-list queue-list' },
          tickets.map((tk) => ticketRow(tk, { onOpenCase, rerender })),
        ),
      );
    const list = approvals.approvals ?? [];
    if (list.length) {
      body.append(
        h('h3', null, t('queue.approvals', { count: list.length })),
        h(
          'ul',
          { class: 'side-list queue-list' },
          list.map((a) => approvalRow(a, onOpenCase)),
        ),
      );
    }
  } catch (err) {
    clear(body).append(h('p', { class: 'form-error', role: 'alert' }, flowError(err)));
  }
}
