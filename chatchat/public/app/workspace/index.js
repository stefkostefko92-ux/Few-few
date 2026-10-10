// Оркестраторът на работното пространство (§12.3): навигация между изгледите (случай · разговор ·
// списък: Inbox, Cronologia, търсене, „Da fare“, „Preferiti“, канали), страничната лента,
// броячите, индикаторът за връзка и жизненият цикъл (старт след вход, спиране при изход).
// Изглед „случай“ е в cases.js/chat.js; тук е всичко около разговорите.

import { $, show } from '../dom.js';
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
import { ws, resetWorkspace } from './model.js';
import { initNewConversation, openNewConversation } from './newconv.js';
import { initNotifSettings } from './notif-settings.js';
import { renderMarked, renderSearch, resetSearch } from './search-view.js';
import { startPresence, stopPresence } from './presence.js';
import { startRealtime, stopRealtime } from './realtime.js';
import { renderSidebar } from './sidebar.js';
import { openSwitcher } from './switcher.js';
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

const app = () => $('#app-view');
let listKind = null; // 'inbox' | 'history' | 'browse' | 'search' | 'todo' | 'saved'
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

function renderList(opts = {}) {
  if (listKind === 'inbox') renderInbox({ onOpenNotification });
  else if (listKind === 'history') renderHistory({ onOpen: openFromHistory });
  else if (listKind === 'browse') void renderBrowse({ onJoin: joinChannel });
  else if (listKind === 'search') renderSearch({ onOpen: openHit, focus: opts.focus === true });
  else if (listKind === 'todo') void renderMarked({ kind: 'TODO', onOpen: openHit });
  else if (listKind === 'saved') void renderMarked({ kind: 'STARRED', onOpen: openHit });
}

const openCase = (caseId) => nav.selectCase(caseId).then(() => setMain('case'));

/** Резултат от търсенето/маркиран: съобщението в контекста му (основният изглед, не прозорец). */
async function openHit(r) {
  if (r.source === 'case') return openCase(r.caseId);
  const convId = r.conversation?.id;
  if (!convId) return undefined;
  listKind = null;
  setMain('conv');
  await openConversationView(convId, { messageId: r.id, replyToId: r.replyToId ?? null });
  renderSide();
  return undefined;
}

function openFromHistory(id) {
  if (id.startsWith('case:')) return void nav.selectCase(id.slice(5)).then(() => setMain('case'));
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
  if (caseId) await openCase(caseId);
  return undefined;
}

/* ---------- Лента и броячи ---------- */

function renderSide() {
  renderSidebar({
    activeId: mainKind() === 'conv' ? currentConversationId() : null,
    onOpen: openConversation,
  });
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
  $('#btn-browse').addEventListener('click', () => showList('browse'));
  $('#btn-switch').addEventListener('click', () => openSwitcher({ openConversation, openCase }));
  $('#nav-search').addEventListener('click', () => {
    listKind = 'search';
    closeConversationView();
    setMain('list');
    renderList({ focus: true });
  });
  $('#nav-todo').addEventListener('click', () => showList('todo'));
  $('#nav-saved').addEventListener('click', () => showList('saved'));
  initNotifSettings();
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
  listen('ws:marks', () => {
    if ((listKind === 'todo' || listKind === 'saved') && mainKind() === 'list') renderList();
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

/**
 * `#c=<разговор>&m=<съобщение>` (копирана връзка, имейл) или `#case=<случай>` (имейл за поет
 * случай). Фрагментът се чисти след прочитане; достъпът го проверява сървърът.
 */
async function followHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  const c = p.get('c');
  const caseId = p.get('case');
  if (caseId) {
    history.replaceState(null, '', location.pathname + location.search);
    await openCase(caseId).catch(() => undefined);
    return true;
  }
  if (!c || !can('conversation:use')) return false;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    await loadConversations();
  } catch {
    /* ще се види от отворения изглед */
  }
  setMain('conv');
  await openConversationView(c, { messageId: p.get('m') ?? undefined });
  renderSide();
  return true;
}

/** → true, ако връзка във фрагмента е отворила разговор/случай (тогава не отваряме последния). */
export async function startWorkspace() {
  const usable = can('conversation:use');
  for (const g of ['grp-starred', 'grp-channels', 'grp-dms']) show($(`#${g}`), usable);
  for (const id of [
    '#nav-inbox',
    '#nav-history',
    '#nav-search',
    '#nav-todo',
    '#nav-saved',
    '#btn-inbox',
    '#btn-switch',
  ]) {
    show($(id), usable);
  }
  show($('#btn-new-case'), can('case:create'));
  show($('#btn-scan'), can('case:create'));
  show($('#btn-new-channel'), can('channel:create'));
  show($('#btn-new-dm'), can('conversation:create'));
  show($('#btn-browse'), state.user?.kind === 'INTERNAL');
  show($('#grp-assigned'), can('case:assign') || can('case:create'));
  if (!usable) return false;
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
  return followHash();
}

export function stopWorkspace() {
  stopRealtime();
  stopPresence();
  closeConversationView();
  closeAllWindows();
  resetWorkspace();
  resetSearch();
  listKind = null;
}
