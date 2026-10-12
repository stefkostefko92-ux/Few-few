// Тикетът в панела на случая (FR-09, FR-19): статус, опашка, отговорник (порталът — ролята),
// „AI е на пауза“, какво иска операторът (техникът отговаря в чата), резолюцията; бутоните
// „Passa a un operatore“ (техник) и действията на оператора. Показва се само позволеното —
// сървърът проверява всяко действие наново.

import { $, announce, clear, h } from '../dom.js';
import { fmtStamp } from '../format.js';
import { t } from '../i18n.js';
import { state } from '../store.js';
import { flowActions } from './panel-actions.js';
import { personText } from './people.js';
import { currentFlow, reloadCase } from './state.js';

function facts(tk) {
  return h(
    'dl',
    { class: 'case-facts ticket-facts' },
    h(
      'div',
      null,
      h('dt', null, t('ticket.panel.status')),
      h('dd', null, t(`ticketstatus.${tk.status}`)),
    ),
    h(
      'div',
      null,
      h('dt', null, t('ticket.panel.queue')),
      h('dd', null, t(`queue.name.${tk.queue}`)),
    ),
    h(
      'div',
      null,
      h('dt', null, t('ticket.panel.owner')),
      h('dd', null, tk.owner ? personText(tk.owner) : t('case.unassigned')),
    ),
  );
}

function infoRequest(req, forTechnician) {
  return h(
    'section',
    { class: 'flow-note flow-request', 'aria-labelledby': 'flow-req-title' },
    h('h4', { id: 'flow-req-title' }, t('ticket.info.title', { who: personText(req.requestedBy) })),
    h(
      'ul',
      null,
      (Array.isArray(req.items) ? req.items : []).map((i) => h('li', null, String(i))),
    ),
    req.note ? h('p', null, req.note) : null,
    h(
      'p',
      { class: 'hint' },
      forTechnician
        ? t('ticket.info.howTo')
        : t('ticket.info.waiting', { when: fmtStamp(req.requestedAt) }),
    ),
  );
}

function resolution(r) {
  const sources = Array.isArray(r?.sources) ? r.sources : [];
  return h(
    'section',
    { class: 'flow-note', 'aria-labelledby': 'flow-res-title' },
    h('h4', { id: 'flow-res-title' }, t('ticket.resolution.title')),
    r?.rootCause
      ? h('p', null, h('strong', null, `${t('ticket.resolution.rootCause')}: `), r.rootCause)
      : null,
    r?.solution
      ? h('p', null, h('strong', null, `${t('ticket.resolution.solution')}: `), r.solution)
      : null,
    r?.via === 'case.outcome' ? h('p', { class: 'hint' }, t('ticket.resolution.byOutcome')) : null,
    sources.length
      ? h(
          'p',
          null,
          h('strong', null, `${t('ticket.resolution.sources')}: `),
          sources.map((s) => `${s.documentCode} rev. ${s.revision}`).join(' · '),
        )
      : null,
  );
}

export function renderTicketPanel() {
  const host = $('#ticket-panel');
  if (!host) return;
  clear(host);
  const flow = currentFlow();
  const c = state.current?.case;
  if (!flow || !c) return;
  const tk = flow.ticket;
  const technician = !flow.can?.operate;
  if (c.aiPaused) {
    host.append(
      h(
        'p',
        { class: 'flow-note flow-paused' },
        h('span', { 'aria-hidden': 'true' }, '⏸ '),
        t(technician ? 'handoff.pausedTech' : 'handoff.pausedStaff'),
      ),
    );
  }
  if (tk) {
    host.append(
      h('h4', { class: 'ticket-head' }, t('ticket.panel.title', { number: tk.number })),
      facts(tk),
    );
    if (tk.openInfoRequest) host.append(infoRequest(tk.openInfoRequest, technician));
    if (tk.status === 'CLOSED' && tk.resolution) host.append(resolution(tk.resolution));
  }
  const buttons = flowActions(flow, c, afterAction);
  if (buttons.length) host.append(h('div', { class: 'flow-actions' }, buttons));
}

/** След действие: ново състояние от сървъра + съобщение за екранния четец. */
export async function afterAction(text) {
  await reloadCase();
  if (text) {
    announce(text);
    const fb = $('#actions-feedback');
    fb.textContent = text;
    fb.className = 'form-note';
    fb.hidden = false;
  }
}
