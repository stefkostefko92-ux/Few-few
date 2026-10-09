import { api } from './api.js';
import { answerSummaryText, renderAnswer } from './answer.js';
import { $, announce, clear, h, show } from './dom.js';
import { errorText } from './errors.js';
import { openTicketDialog } from './context.js';
import { openSource } from './docview.js';
import { refreshCases } from './cases.js';
import { createTray } from './attachments/tray.js';
import { renderAttachments } from './attachments/view.js';
import { roleLabel } from './format.js';
import { getLang, t } from './i18n.js';
import { attachQuickResponses } from './workspace/quick.js';
import { on, state } from './store.js';

const rated = new Map(); // messageId -> rating (за сесията на страницата)
let pendingText = null; // текст, който се изпраща в момента (оптимистично показан)
let attempt = null; // { text, cmid } — повторният опит с ЕДИН текст ползва същия ключ (AC-12)
let tray = null;

function fmtTime(iso) {
  try {
    return new Intl.DateTimeFormat(getLang(), {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

const onFeedback = async (messageId, rating) => {
  await api('POST', '/feedback', { messageId, rating });
  rated.set(messageId, rating);
};

function renderMessage(m) {
  if (m.kind === 'AI') {
    return renderAnswer(m, {
      onOpenSource: openSource,
      onOpenTicket: openTicketDialog,
      onFeedback,
      rated: (id) => rated.get(id) ?? null,
    });
  }
  if (m.kind === 'SYSTEM') {
    return h(
      'div',
      { class: 'msg msg-system' },
      h('span', { class: 'sys-tag' }, t('chat.system')),
      ' ',
      String(m.body ?? ''),
    );
  }
  return h(
    'article',
    { class: 'msg msg-human' },
    h(
      'header',
      { class: 'msg-head' },
      h(
        'span',
        { class: 'who' },
        m.authorName
          ? String(m.authorName)
          : m.authorRole
            ? t('chat.staffRole', { role: roleLabel(m.authorRole) })
            : t('chat.you'),
      ),
      m.createdAt
        ? h('time', { class: 'when', datetime: String(m.createdAt) }, fmtTime(m.createdAt))
        : null,
    ),
    h('p', { class: 'msg-text' }, String(m.body ?? '')),
    renderAttachments(m.attachments),
  );
}

export function renderMessages({ scroll = 'keep' } = {}) {
  const box = $('#messages');
  const cur = state.current;
  clear(box);
  if (!cur) return;
  const list = cur.messages;
  if (!list.length && pendingText === null) {
    box.append(h('p', { class: 'muted chat-hint' }, t('chat.empty')));
  }
  let lastAi = null;
  for (const m of list) {
    const el = renderMessage(m);
    box.append(el);
    if (m.kind === 'AI') lastAi = el;
  }
  if (pendingText !== null) {
    box.append(
      h(
        'article',
        { class: 'msg msg-human' },
        h(
          'header',
          { class: 'msg-head' },
          h('span', { class: 'who' }, state.user?.name ? String(state.user.name) : t('chat.you')),
        ),
        h('p', { class: 'msg-text' }, pendingText),
      ),
      h(
        'div',
        { class: 'msg msg-pending' },
        h('span', { class: 'pending-bar', 'aria-hidden': 'true' }),
        t('chat.waiting'),
      ),
    );
  }
  if (scroll === 'answer' && lastAi) lastAi.scrollIntoView({ block: 'start' });
  else if (scroll === 'end') box.lastElementChild?.scrollIntoView({ block: 'end' });
}

function setBusy(busy) {
  state.sending = busy;
  $('#composer-send').disabled = busy;
  tray?.setDisabled(busy);
  $('#composer-text').readOnly = busy;
  $('#composer').setAttribute('aria-busy', String(busy));
  $('#composer-status').textContent = busy ? t('chat.waiting') : '';
}

function composerError(text) {
  const el = $('#composer-error');
  el.textContent = text;
  show(el, text !== '');
}

async function send() {
  const cur = state.current?.case;
  const area = $('#composer-text');
  const text = area.value.trim();
  if (!cur || state.sending) return;
  if (!text) {
    area.focus();
    return;
  }
  composerError('');
  if (tray.uploading()) return composerError(t('att.wait'));
  if (tray.hasFailed()) return composerError(t('att.failedBlock'));
  if (!attempt || attempt.text !== text) attempt = { text, cmid: crypto.randomUUID() };
  const attachmentIds = tray.ids();
  pendingText = text;
  area.value = '';
  setBusy(true);
  renderMessages({ scroll: 'end' });
  const caseId = cur.id;
  try {
    const data = await api(
      'POST',
      '/chat/messages',
      { caseId, text, clientMessageId: attempt.cmid, attachmentIds },
      { timeoutMs: 120000 },
    );
    pendingText = null;
    attempt = null;
    tray.clearSent();
    if (state.currentId === caseId && state.current) {
      // Повторът връща вече записаното — без дубликати по id и без празен отговор.
      const known = new Set(state.current.messages.map((m) => m?.id));
      for (const m of [data.message, data.answer]) {
        if (m && !known.has(m.id)) state.current.messages.push(m);
      }
      renderMessages({ scroll: 'answer' });
      const ans = data.answer;
      const blocked = ans?.payload?.safety?.level === 'blocked';
      announce(
        t('chat.newAnswer', {
          summary: `${blocked ? t('ans.safety.blocked') + '. ' : ''}${answerSummaryText(ans?.payload) || String(ans?.body ?? '')}`,
        }),
      );
    }
    refreshCases();
  } catch (err) {
    pendingText = null;
    // Разговорът остава: презареждаме го (записаното съобщение се вижда веднъж).
    try {
      const fresh = await api('GET', `/cases/${encodeURIComponent(caseId)}`);
      if (state.currentId === caseId) {
        state.current = {
          case: fresh.case,
          messages: Array.isArray(fresh.messages) ? fresh.messages : [],
        };
      }
    } catch {
      /* без опресняване: текстът се връща по-долу така или иначе */
    }
    // Текстът се връща винаги и със СЪЩИЯ clientMessageId (`attempt` остава): ако съобщението е
    // записано, повторното „Изпрати“ пита AI за него, без да го дублира (AC-12).
    area.value = text;
    renderMessages({ scroll: 'end' });
    const aiDown = err.code === 'ai_unavailable' || err.status === 503;
    composerError(
      aiDown || err.code === 'ai_in_progress'
        ? `${aiDown ? t('chat.unavailable') : errorText(err)} ${t('chat.retrySame')}`
        : errorText(err),
    );
  } finally {
    setBusy(false);
    refreshCases();
  }
}

export function initChat() {
  tray = createTray({ getCaseId: () => state.currentId });
  $('#tray-host').append(tray.el);
  attachQuickResponses($('#composer-text'), $('#composer-wrap'));
  $('#composer').addEventListener('submit', (e) => {
    e.preventDefault();
    send();
  });
  $('#composer-text').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      send();
    }
  });

  on('case:loading', () => {
    show($('#chat-empty'), false);
    show($('#chat-body'), true);
    clear($('#messages')).append(h('p', { class: 'muted chat-hint' }, t('chat.loading')));
    composerError('');
    tray.reset();
    attempt = null;
  });
  on('case:loaded', () => {
    pendingText = null;
    tray.setDisabled(state.current?.case?.status === 'RESOLVED');
    const last = state.current?.messages.at(-1);
    renderMessages({ scroll: last?.kind === 'AI' ? 'answer' : 'end' });
  });
  on('case:error', (err) => {
    clear($('#messages')).append(
      h('p', { class: 'form-error' }, `${t('chat.loadError')} ${errorText(err)}`),
    );
  });
  on('lang', () => {
    tray.refreshLabels();
    if (state.current) renderMessages();
    $('#composer-status').textContent = state.sending ? t('chat.waiting') : '';
  });
}

export function resetChat() {
  pendingText = null;
  attempt = null;
  tray?.reset();
  show($('#chat-empty'), true);
  show($('#chat-body'), false);
  clear($('#messages'));
}
