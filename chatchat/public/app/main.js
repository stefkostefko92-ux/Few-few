import { api } from './api.js';
import { $, $$, show } from './dom.js';
import { guessLang, setLang, t } from './i18n.js';
import { initChat, resetChat } from './chat.js';
import { initContext, renderContext } from './context.js';
import { initNewCase, loadCases, renderCases, selectCase } from './cases.js';
import { emit, on, state } from './store.js';

const app = () => $('#app-view');
const wide = () => window.matchMedia('(min-width: 1100px)').matches;

function showLogin() {
  state.user = null;
  state.csrf = null;
  state.cases = [];
  state.currentId = null;
  state.current = null;
  state.tickets.clear();
  show($('#app-view'), false);
  show($('#login-view'), true);
  resetChat();
  $('#login-email').focus();
}

async function showApp(session) {
  state.user = session.user;
  state.csrf = session.csrfToken;
  $('#user-name').textContent = session.user?.name ?? '';
  show($('#login-view'), false);
  show($('#app-view'), true);
  app().dataset.view = 'cases';
  renderContext();
  await loadCases();
  // На десктоп работното пространство е пълно: отваряме последния случай.
  if (wide() && state.cases.length) await selectCase(state.cases[0].id);
}

async function changeLang(l) {
  await setLang(l);
  emit('lang');
  renderCases();
}

/** Връзката към информацията за поверителност (по чл. 13/14 GDPR), ако администраторът я е дал. */
async function loadMeta() {
  try {
    const meta = await api('GET', '/meta');
    const url = typeof meta?.privacyUrl === 'string' ? meta.privacyUrl : '';
    if (/^https:\/\//.test(url)) {
      const link = $('#privacy-link');
      link.href = url;
      show(link, true);
    }
  } catch {
    // Без мета данни приложението работи; връзката просто не се показва.
  }
}

async function init() {
  void loadMeta();
  let session = null;
  try {
    session = await api('GET', '/auth/me');
  } catch {
    session = null;
  }
  await setLang(guessLang(session?.user?.locale), { persist: false });

  for (const sel of $$('[data-lang-select]')) {
    sel.addEventListener('change', () => changeLang(sel.value));
  }

  // Вход
  const form = $('#login-form');
  const err = $('#login-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    if (!email || !password) {
      err.textContent = t('login.required');
      show(err, true);
      return;
    }
    show(err, false);
    const btn = $('#login-submit');
    btn.disabled = true;
    try {
      const data = await api('POST', '/auth/login', { email, password });
      $('#login-password').value = '';
      await showApp(data);
    } catch (ex) {
      err.textContent =
        ex.status === 401
          ? t('login.error.invalid')
          : ex.status === 429
            ? t('login.error.rate')
            : t('login.error.generic');
      show(err, true);
    } finally {
      btn.disabled = false;
    }
  });

  $('#btn-logout').addEventListener('click', async () => {
    try {
      await api('POST', '/auth/logout');
    } catch {
      /* излизаме от интерфейса така или иначе */
    }
    showLogin();
  });

  $('#btn-show-cases').addEventListener('click', () => {
    app().dataset.view = 'cases';
    window.scrollTo(0, 0);
  });
  on('case:loading', () => {
    app().dataset.view = 'chat';
    window.scrollTo(0, 0);
  });

  // Диалози: затваряне и клик върху фона
  for (const dlg of $$('dialog')) {
    for (const b of $$('[data-close]', dlg)) b.addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close();
    });
  }

  initContext();
  initNewCase();
  initChat();

  // Изтекла сесия по средата на работа
  on('auth:expired', () => {
    if (state.user) {
      showLogin();
      const err = $('#login-error');
      err.textContent = t('err.unauthorized');
      show(err, true);
    }
  });

  if (session?.user) {
    state.csrf = session.csrfToken;
    await showApp(session);
  } else {
    showLogin();
  }
  document.documentElement.dataset.ready = 'true';
}

init();
