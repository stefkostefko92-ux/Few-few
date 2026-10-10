// Допълненията към панела на случая: кой го е поел, хронология (AC-19), „Поеми“ (оператор) и
// вътрешната дискусия на персонала по случая. Бутоните се показват само където ролята ги има.

import { $, announce, show } from '../dom.js';
import { errorText } from '../errors.js';
import { roleLabel } from '../format.js';
import { t } from '../i18n.js';
import { listen, state } from '../store.js';
import { wsApi } from './api.js';
import { can } from './caps.js';
import { openTimeline } from './timeline.js';

export function assigneeText(c) {
  const a = c?.assignedTo;
  if (!a) return t('case.unassigned');
  if (a.id === state.user?.id) return t('case.assignedToYou');
  return a.name ?? roleLabel(a.role);
}

export function renderCaseFacts() {
  const c = state.current?.case;
  if (!c) return;
  $('#case-assignee').textContent = assigneeText(c);
  const tk = state.tickets.get(c.id);
  $('#case-ticket-fact').textContent = tk ? `${tk.number}` : t('case.noTicket');
  show(
    $('#btn-assign'),
    can('case:assign') && c.assignedTo?.id !== state.user?.id && c.status !== 'RESOLVED',
  );
  show($('#btn-case-discussion'), can('case:readAll') && state.user?.kind === 'INTERNAL');
}

/** @param {{ openConversation: (id: string) => void, refreshCases: () => Promise<void> }} nav */
export function initCaseActions(nav) {
  listen('case:loaded', renderCaseFacts);
  listen('lang', renderCaseFacts);
  $('#btn-timeline').addEventListener('click', () => {
    const c = state.current?.case;
    if (c) void openTimeline(c.id);
  });
  $('#btn-assign').addEventListener('click', async () => {
    const c = state.current?.case;
    if (!c) return;
    const fb = $('#actions-feedback');
    try {
      await wsApi.assign(c.id);
      await nav.refreshCases();
      state.current.case = {
        ...c,
        assignedTo: { id: state.user.id, name: state.user.name, role: state.user.role },
      };
      renderCaseFacts();
      announce(t('case.taken'));
      fb.textContent = t('case.taken');
      fb.className = 'form-note';
    } catch (err) {
      fb.textContent = errorText(err);
      fb.className = 'form-error';
    }
    fb.hidden = false;
  });
  $('#btn-case-discussion').addEventListener('click', async () => {
    const c = state.current?.case;
    if (!c) return;
    try {
      const { conversation } = await wsApi.caseConversation(c.id);
      nav.openConversation(conversation.id, conversation);
    } catch (err) {
      const fb = $('#actions-feedback');
      fb.textContent = errorText(err);
      fb.className = 'form-error';
      fb.hidden = false;
    }
  });
}
