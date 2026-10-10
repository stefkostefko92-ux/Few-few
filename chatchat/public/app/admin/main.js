// Административната конзола — вход в страницата. Няма втори екран за вход: без сесия или без
// минат втори фактор отиваме в основното приложение (/). Навигацията показва само секциите, за
// които ролята има способност (от /auth/me); сървърът проверява всяко действие наново.

import { api } from '../api.js';
import { $, clear, h } from '../dom.js';
import { guessLang, setLang, t } from '../i18n.js';
import { can, goToLogin, me, setSession } from './core.js';
import { failure, loading } from './ui.js';
import { on } from '../store.js';

const SECTIONS = [
  { id: 'users', cap: 'users:manage', load: () => import('./users.js') },
  { id: 'products', cap: 'kb:manage', load: () => import('./products.js') },
  { id: 'devices', cap: 'kb:manage', load: () => import('./devices.js') },
  { id: 'documents', cap: 'kb:manage', load: () => import('./documents.js') },
  { id: 'codes', cap: 'kb:manage', load: () => import('./codes.js') },
  // Опашката с предложенията за знанието (FR-10, §11.3) — етикетът е под своя префикс.
  {
    id: 'proposals',
    cap: 'kb:manage',
    label: 'kbq.nav',
    load: () => import('./proposals.js'),
  },
  { id: 'quick', cap: 'kb:manage', load: () => import('./quick.js') },
  { id: 'kpi', cap: 'kpi:read', load: () => import('./kpi.js') },
  { id: 'audit', cap: 'audit:read', load: () => import('./audit.js') },
  // Политиката за разрешенията на стъпки (§11.2) — етикетът е под своя префикс.
  {
    id: 'steppolicy',
    cap: 'policy:manage',
    label: 'step.policy.nav',
    load: () => import('./step-policy.js'),
  },
  // Интеграцията с helpdesk (FR-09, §14.4) — етикетът е под своя префикс.
  {
    id: 'integrations',
    cap: 'integrations:manage',
    label: 'admin.integrations.nav',
    load: () => import('./integrations.js'),
  },
  // Единният вход (OIDC / Entra ID) — доставчик, домейни, режим, MFA на доставчика.
  { id: 'sso', cap: 'sso:manage', label: 'admin.sso.nav', load: () => import('./sso.js') },
];

const labelOf = (s) => t(s.label ?? `admin.nav.${s.id}`);

let available = [];
let current = null; // { id, destroy }
let ticket = 0;

function parseHash() {
  const [id, query = ''] = location.hash.slice(1).split('?');
  return { id, params: new URLSearchParams(query) };
}

function renderNav(activeId) {
  const nav = $('#nav');
  clear(nav);
  nav.setAttribute('aria-label', t('admin.nav'));
  const list = h('ul', { class: 'nav-list' });
  for (const s of available) {
    const link = h('a', { href: `#${s.id}`, class: 'nav-link' }, labelOf(s));
    if (s.id === activeId) link.setAttribute('aria-current', 'page');
    list.append(h('li', {}, link));
  }
  nav.append(list);
}

async function route() {
  const { id, params } = parseHash();
  const section = available.find((s) => s.id === id) ?? available[0];
  if (!section) return;
  if (id !== section.id) {
    history.replaceState(null, '', `#${section.id}`);
  }
  const mine = ++ticket;
  current?.destroy?.();
  current = null;
  renderNav(section.id);
  const view = $('#view');
  clear(view).append(loading());
  document.title = `${labelOf(section)} — ${t('admin.title')} | ChatChat`;
  try {
    const mod = await section.load();
    if (mine !== ticket) return;
    clear(view);
    const destroy = await mod.mount(view, params);
    if (mine === ticket) {
      current = { id: section.id, destroy };
      const title = $('#sec-title');
      if (title && !params.has('keep')) title.focus({ preventScroll: true });
    }
  } catch (err) {
    if (mine === ticket) clear(view).append(failure(err, route));
  }
}

async function init() {
  let session;
  try {
    session = await api('GET', '/auth/me');
  } catch {
    return goToLogin();
  }
  const mfa = session.mfa ?? {};
  // mfa.idp: вторият фактор е доказан от доставчика на единния вход — локален TOTP не се иска.
  if ((mfa.enabled && !mfa.passed) || (mfa.required && !mfa.enabled && !mfa.idp)) {
    return goToLogin();
  }
  setSession(session);
  await setLang(guessLang(session.user?.locale), { persist: false });

  available = SECTIONS.filter((s) => can(s.cap));
  if (available.length === 0) {
    $('#denied').hidden = false;
    document.title = `${t('admin.title')} | ChatChat`;
    return;
  }
  $('#shell').hidden = false;
  $('#who-name').textContent = session.user.name;
  $('#who-role').textContent = `(${t(`admin.role.${session.user.role}`)})`;

  $('#lang-select').addEventListener('change', async (e) => {
    await setLang(e.target.value);
    $('#who-role').textContent = `(${t(`admin.role.${me.user.role}`)})`;
    await route();
  });
  $('#btn-logout').addEventListener('click', async () => {
    try {
      await api('POST', '/auth/logout');
    } catch {
      /* si esce comunque */
    }
    goToLogin();
  });
  on('auth:expired', goToLogin);
  window.addEventListener('hashchange', route);
  await route();
  document.documentElement.dataset.ready = 'true';
}

void init();
