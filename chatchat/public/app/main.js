import { api } from './api.js';
import { $, $$, announce, show } from './dom.js';
import { getLang, guessLang, LANGS, setLang, t } from './i18n.js';
import { initChat, resetChat } from './chat.js';
import { initContext, renderContext } from './context.js';
import {
  initNewCase,
  loadCases,
  openNewCaseWithDevice,
  refreshCases,
  renderCases,
  selectCase,
} from './cases.js';
import { emit, on, state } from './store.js';
import { showScreen } from './auth/screens.js';
import { initMfaVerify, showMfaVerify } from './auth/mfa-verify.js';
import { mountMfaSetup } from './auth/mfa-setup.js';
import { initReset, showReset, takeResetToken } from './auth/reset.js';
import { openSecurityDialog } from './auth/security.js';
import { initSso, logoutRequest, ssoLoginError, ssoResultText, takeSsoError } from './auth/sso.js';
import { hasPendingQr, initScan, resolvePendingQr, takeQrFromUrl } from './qr/scan.js';
import { initWorkspace, startWorkspace, stopWorkspace } from './workspace/index.js';
import { initFlow } from './flow/index.js';
import { resetQuickResponses } from './workspace/quick.js';
import { wide } from './workspace/windows.js';

const app = () => $('#app-view');

function showLogin(message) {
  state.user = null;
  state.csrf = null;
  state.mfa = { enabled: false, passed: false, required: false };
  state.cases = [];
  state.currentId = null;
  state.current = null;
  state.flow = null;
  state.tickets.clear();
  stopWorkspace();
  resetQuickResponses();
  resetChat();
  show($('#btn-admin'), false);
  showScreen('login');
  const err = $('#login-error');
  err.textContent = message ?? '';
  show(err, Boolean(message));
  $('#login-email').focus();
}

async function logout() {
  let next = null;
  try {
    next = await logoutRequest(); // при SSO — и адресът за изход при доставчика (по избор)
  } catch {
    /* излизаме от интерфейса така или иначе */
  }
  showLogin();
  if (next) location.assign(next);
}

/** След парола: втори фактор (код / настройка) или самото приложение. */
async function enter(session) {
  state.user = session.user;
  state.csrf = session.csrfToken ?? state.csrf;
  state.mfa = session.mfa ?? state.mfa;
  state.authMethod = session.authMethod ?? 'password';
  // FR-14: езикът на профила (същият за писмата и AI) печели след вход — и на друго устройство;
  // освен ако човекът току-що е избрал друг на екрана за вход (тогава той отива в профила).
  const own = session.user?.locale;
  if (!chosenLang && LANGS.includes(own) && own !== getLang()) {
    await setLang(own);
    emit('lang');
  }
  if (state.mfa.enabled && !state.mfa.passed) return showMfaVerify();
  // Вторият фактор, доказан от доставчика на единния вход (mfa.idp), не иска локален TOTP.
  if (state.mfa.required && !state.mfa.enabled && !state.mfa.idp) return showSetup();
  return showApp();
}

function showSetup() {
  showScreen('setup');
  mountMfaSetup($('#setup-host'), {
    onDone: () => {
      interactiveEntry = true;
      return showApp();
    },
  });
}

/** Връзка към конзолата само за ролите с административна способност (сървърът пак проверява). */
const ADMIN_CAPS = ['users:manage', 'kb:manage', 'audit:read'];

async function showAdminLink() {
  try {
    const me = await api('GET', '/auth/me');
    const caps = Array.isArray(me?.capabilities) ? me.capabilities : [];
    show(
      $('#btn-admin'),
      caps.some((c) => ADMIN_CAPS.includes(c)),
    );
  } catch {
    show($('#btn-admin'), false);
  }
}

/** Влязъл е през форма (парола/код): екранът за вход изчезва, а фокусът не бива да остане в нищото. */
let interactiveEntry = false;

async function showApp() {
  $('#user-name').textContent = state.user?.name ?? '';
  if (chosenLang && chosenLang !== state.user?.locale) void saveLang(true);
  chosenLang = null;
  showScreen('app');
  if (interactiveEntry) {
    interactiveEntry = false;
    $('#chat-pane')?.focus({ preventScroll: true });
  }
  void showAdminLink();
  app().dataset.view = 'cases';
  app().dataset.main = 'case';
  renderContext();
  await loadCases();
  const navigated = await startWorkspace();
  // QR етикет от адреса: таблото → нов случай с неговия контекст.
  if (hasPendingQr()) {
    try {
      const device = await resolvePendingQr();
      if (device) {
        openNewCaseWithDevice(device);
        return;
      }
    } catch {
      /* непознат/чужд етикет: продължаваме нормално; ръчното сканиране остава */
    }
  }
  // На десктоп работното пространство е пълно: отваряме последния случай.
  if (!navigated && wide() && state.cases.length) await selectCase(state.cases[0].id);
}

/** Избран преди вход (екранът за вход) — записва се в профила след втория фактор. */
let chosenLang = null;

async function saveLang(quiet) {
  try {
    const res = await api('PATCH', '/me', { locale: getLang() });
    state.user = { ...state.user, locale: res?.user?.locale ?? getLang() };
    if (!quiet) announce(t('settings.langSaved'));
  } catch {
    if (!quiet) announce(t('settings.langLocalOnly'));
  }
}

async function changeLang(l) {
  await setLang(l);
  emit('lang');
  renderCases();
  if (!state.user) {
    chosenLang = getLang();
    return;
  }
  // Синхронно със сървъра (PATCH /me): на него са и отговорите на AI, и писмата.
  await saveLang(false);
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

function wireLogin() {
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
      interactiveEntry = true;
      await enter(data);
    } catch (ex) {
      err.textContent =
        ssoLoginError(ex) ??
        (ex.status === 401
          ? t('login.error.invalid')
          : ex.status === 429
            ? t('login.error.rate')
            : t('login.error.generic'));
      show(err, true);
    } finally {
      btn.disabled = false;
    }
  });
}

async function init() {
  // Първо чувствителните неща от адреса: токенът за парола и QR токенът се махат веднага.
  const isReset = takeResetToken();
  takeQrFromUrl();
  const ssoError = takeSsoError(); // `?sso_error=` от връщането на единния вход
  void loadMeta();
  let session = null;
  if (!isReset) {
    try {
      session = await api('GET', '/auth/me');
    } catch {
      session = null;
    }
  }
  await setLang(guessLang(session?.user?.locale), { persist: false });
  for (const sel of $$('[data-lang-select]')) {
    sel.addEventListener('change', () => changeLang(sel.value));
  }

  wireLogin();
  initSso();
  initReset();
  initMfaVerify({
    onPassed: () => {
      interactiveEntry = true;
      return showApp();
    },
    onCancel: logout,
  });
  $('#setup-cancel').addEventListener('click', logout);
  $('#btn-logout').addEventListener('click', logout);
  $('#btn-security').addEventListener('click', openSecurityDialog);
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
  initScan(openNewCaseWithDevice);
  initWorkspace({ selectCase, refreshCases });
  initFlow();

  // Изтекла сесия по средата на работа / втори фактор, поискан от API-то
  on('auth:expired', () => {
    if (state.user) showLogin(t('err.unauthorized'));
  });
  on('auth:mfa', (kind) => {
    if (!state.user) return;
    stopWorkspace();
    if (kind === 'setup') showSetup();
    else showMfaVerify();
  });

  if (isReset) {
    showReset();
  } else if (session?.user) {
    await enter(session);
  } else {
    showLogin(ssoError ? ssoResultText(ssoError) : undefined);
  }
  document.documentElement.dataset.ready = 'true';
}

init();
