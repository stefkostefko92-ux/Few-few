// Оркестраторът на работното пространство (§12.3): навигация между изгледите (случай · разговор ·
// списък), страничната лента, броячите, индикаторът за връзка и жизненият цикъл (старт след вход,
// спиране при изход). Изглед „случай“ е в cases.js/chat.js; тук е всичко около разговорите.

import { $, clear, h, show } from '../dom.js';
import { t } from '../i18n.js';
import { listen, state } from '../store.js';
import { wsApi } from './api.js';
import { can } from './caps.js';
import { initCaseActions } from './case-actions.js';
import {
  closeConversationView,
  currentConversationId,
  initConvView,
  openConversationView,
  setConvHooks,
} from './conv-view.js';
import { ws, resetWorkspace, conversationsByActivity } from './model.js';
import { initNewConversation, openNewConversation } from './newconv.js';
import { startPresence, stopPresence } from './presence.js';
import { startRealtime, stopRealtime } from './realtime.js';
import { conversationItem, renderSidebar } from './sidebar.js';
import { loadConversations, loadNotifications, loadPresence } from './sync.js';
import {
  closeAllWindows,
  closeWindow,
  hasWindow,
  openWindow,
  openWindowIds,
  restoreWindows,
  wide,
} from './windows.js';
import { renderBadges, renderConn } from './status.js';
import { renderBrowse, renderHistory, renderInbox } from './views.js';
import { refreshQueue, renderQueue } from '../flow/queue.js';

const app = () => $('#app-view');
let listKind = null; // 'inbox' | 'history' | 'browse'
let nav = { selectCase: async () => {}, refreshCases: async () => {} };

function setMain(kind) {
  app().dataset.main = kind;
  app().dataset.view = 'chat';
  window.scrollTo(0, 0);
}

export const mainKind = () => app().dataset.main;

/* ---------- Навигация ---------- */

export async function openConversation(id, known) {
  if (known) ws.convs.has(id) || ws.convs.set(id, { ...known, member: true });
  if (wide() && hasWindow(id)) return openWindow(id);
  listKind = null;
  setMain('conv');
  await openConversationView(id);
  $('#conv-title').focus();
  renderSide();
  return undefined;
}

function leaveConversation() {
  closeConversationView();
  listKind = null;
  setMain('case');
  renderSide();
}

function showList(kind) {
  listKind = kind;
  closeConversationView();
  setMain('list');
  renderList();
  $('#list-title').focus();
}

function renderList() {
  if (listKind === 'inbox') renderInbox({ onOpenNotification });
  else if (listKind === 'history') renderHistory({ onOpen: openFromHistory });
  else if (listKind === 'browse') void renderBrowse({ onJoin: joinChannel });
  else if (listKind === 'queue') void renderQueue({ onOpenCase: openFromHistory });
}

function openFromHistory(id) {
  if (id.startsWith('case:')) return void nav.selectCase(id.slice(5)).then(() => setMain('case'));
  // Опашката подава id на случай без префикс — разговорите имат свои id, случаите — `case:`.
  if (listKind === 'queue') return void nav.selectCase(id).then(() => setMain('case'));
  return openConversation(id);
}

async function joinChannel(id) {
  try {
    await wsApi.addMembers(id, [state.user.id]);
    await loadConversations();
    await openConversation(id);
  } catch {
    /* грешката се вижда: бутонът остава */
  }
}

async function onOpenNotification(n) {
  if (!n.readAt) {
    try {
      await wsApi.readNotifications({ ids: [n.id] });
      await loadNotifications();
    } catch {
      /* навигацията е по-важна от маркера */
    }
  }
  const p = n.payload ?? {};
  if (n.objectType === 'conversation') return openConversation(n.objectId);
  const caseId = p.caseId ?? (n.objectType === 'case' ? n.objectId : null);
  if (caseId) {
    await nav.selectCase(caseId);
    setMain('case');
  }
  return undefined;
}

/* ---------- Лента и броячи ---------- */

function renderSide() {
  renderSidebar({
    activeId: mainKind() === 'conv' ? currentConversationId() : null,
    onOpen: openConversation,
  });
}

/* ---------- Превключвател (мобилно) ---------- */

function openSwitcher() {
  const ul = clear($('#switch-list'));
  const close = () => $('#dlg-switch').close();
  const convs = conversationsByActivity((c) => c.member !== false && c.type !== 'CASE').sort(
    (a, b) => (b.unread > 0) - (a.unread > 0),
  );
  for (const c of convs.slice(0, 20)) {
    ul.append(
      h(
        'li',
        null,
        conversationItem(c, {
          active: false,
          onOpen: (id) => (close(), void openConversation(id)),
        }),
      ),
    );
  }
  for (const c of state.cases.slice(0, 8)) {
    ul.append(
      h(
        'li',
        null,
        h(
          'button',
          {
            class: 'conv-item',
            type: 'button',
            onclick: () => (close(), void nav.selectCase(c.id).then(() => setMain('case'))),
          },
          h(
            'span',
            { class: 'conv-title-text mono' },
            `${c.number} · ${c.context?.productModel ?? ''}`,
          ),
        ),
      ),
    );
  }
  if (!ul.children.length) ul.append(h('li', { class: 'muted' }, t('history.empty')));
  $('#dlg-switch').showModal();
}

/* ---------- Жизнен цикъл ---------- */

export function initWorkspace(navigation) {
  nav = navigation;
  initConvView();
  initNewConversation();
  initCaseActions({ openConversation, refreshCases: navigation.refreshCases });
  setConvHooks({
    onPopout: (id) => {
      void openWindow(id);
      leaveConversation();
    },
    onLeave: async (id) => {
      ws.convs.delete(id);
      leaveConversation();
      await loadConversations();
    },
    onAddPeople: (id) => openNewConversation({ addTo: id, onCreated: () => openConversation(id) }),
  });
  $('#nav-inbox').addEventListener('click', () => showList('inbox'));
  $('#btn-inbox').addEventListener('click', () => showList('inbox'));
  $('#nav-history').addEventListener('click', () => showList('history'));
  $('#nav-queue').addEventListener('click', () => showList('queue'));
  listen('rt:queue.updated', () => listKind === 'queue' && mainKind() === 'list' && refreshQueue());
  $('#btn-browse').addEventListener('click', () => showList('browse'));
  $('#btn-switch').addEventListener('click', openSwitcher);
  $('#btn-new-dm').addEventListener('click', () =>
    openNewConversation({ type: 'DIRECT', onCreated: openConversation }),
  );
  $('#btn-new-channel').addEventListener('click', () =>
    openNewConversation({ type: 'CHANNEL', onCreated: openConversation }),
  );

  listen('ws:convs', () => {
    renderSide();
    if (listKind === 'history')
      renderHistory({ onOpen: openFromHistory, query: $('#history-filter')?.value ?? '' });
  });
  listen('ws:presence', renderSide);
  listen('ws:notifs', () => {
    renderBadges();
    if (listKind === 'inbox' && mainKind() === 'list') renderList();
  });
  listen('ws:conn', renderConn);
  listen('ws:removed', (id) => {
    if (currentConversationId() === id) leaveConversation();
    closeWindow(id);
  });
  listen('lang', () => {
    renderSide();
    renderBadges();
    renderConn();
    if (mainKind() === 'list') renderList();
  });
  listen('case:loading', () => {
    closeConversationView();
    listKind = null;
    app().dataset.main = 'case';
    renderSide();
  });
  listen('case:assigned', () => void nav.refreshCases());
  addEventListener('hashchange', () => void followHash());
}

/** `#c=<разговор>&m=<съобщение>` (копирана връзка). Фрагментът се чисти след прочитане. */
async function followHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  const c = p.get('c');
  if (!c || !can('conversation:use')) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    await loadConversations();
  } catch {
    /* ще се види от отворения изглед */
  }
  setMain('conv');
  await openConversationView(c, { messageId: p.get('m') ?? undefined });
  renderSide();
}

export async function startWorkspace() {
  const usable = can('conversation:use');
  for (const g of ['grp-starred', 'grp-channels', 'grp-dms']) show($(`#${g}`), usable);
  for (const id of ['#nav-inbox', '#nav-history', '#btn-inbox', '#btn-switch']) show($(id), usable);
  show($('#btn-new-case'), can('case:create'));
  show($('#btn-scan'), can('case:create'));
  show($('#btn-new-channel'), can('channel:create'));
  show($('#btn-new-dm'), can('conversation:create'));
  show($('#btn-browse'), state.user?.kind === 'INTERNAL');
  show($('#grp-assigned'), can('case:assign') || can('case:create'));
  show($('#nav-queue'), can('case:readAll') && state.user?.kind === 'INTERNAL');
  if (!usable) return;
  renderConn();
  renderBadges();
  try {
    await Promise.all([loadConversations(), loadNotifications()]);
  } catch {
    /* потокът/опреснителят ще го поправят */
  }
  renderSide();
  void loadPresence(
    [...ws.convs.values()].flatMap((c) =>
      c.type === 'DIRECT' ? (c.members ?? []).map((m) => m.id) : [],
    ),
  );
  startPresence();
  startRealtime(() => [
    ...new Set([...(currentConversationId() ? [currentConversationId()] : []), ...openWindowIds()]),
  ]);
  if (wide()) restoreWindows();
  await followHash();
}

export function stopWorkspace() {
  stopRealtime();
  stopPresence();
  closeConversationView();
  closeAllWindows();
  resetWorkspace();
  listKind = null;
}
