// Единният вход на екрана за вход (OIDC / Microsoft Entra ID). Бутонът се показва само ако
// домейнът на въведения имейл има доставчик (POST /auth/sso/discover — отговорът зависи само от
// домейна, не издава дали акаунт съществува). „Accedi con Microsoft“ → POST /auth/sso/start →
// пренасочване към доставчика; връщането носи `?sso_error=` само при неуспех (махаме го веднага).

import { api } from '../api.js';
import { $, show } from '../dom.js';
import { errorText } from '../errors.js';
import { has, t } from '../i18n.js';
import { state } from '../store.js';

/** Намереният доставчик за текущия имейл: { provider, label, email } или null. */
let found = null;
let lastAsked = '';

const RESULT_CODES = ['sso_failed', 'sso_denied', 'sso_unavailable'];

/** Преведена грешка на единния вход (`sso.err.*`), иначе общата. */
export function ssoErrorText(err) {
  const code = err?.code;
  return code && has(`sso.err.${code}`) ? t(`sso.err.${code}`) : errorText(err);
}

function buttonLabel(sso) {
  if (sso.provider === 'ENTRA') return t('sso.login.microsoft');
  return sso.label ? t('sso.login.named', { name: sso.label }) : t('sso.login.generic');
}

function render() {
  const box = $('#login-sso');
  if (!box) return;
  show(box, Boolean(found));
  if (!found) return;
  $('#login-sso-label').textContent = buttonLabel(found);
  show($('#login-sso-logo'), found.provider === 'ENTRA');
}

async function discover() {
  const email = $('#login-email').value.trim().toLowerCase();
  if (email === lastAsked) return;
  lastAsked = email;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    found = null;
    render();
    return;
  }
  try {
    const res = await api('POST', '/auth/sso/discover', { email });
    if (lastAsked !== email) return;
    const sso = res?.sso;
    found =
      sso && (sso.provider === 'ENTRA' || sso.provider === 'OIDC')
        ? { provider: sso.provider, label: typeof sso.label === 'string' ? sso.label : null, email }
        : null;
  } catch {
    found = null;
  }
  render();
}

function showError(text) {
  const err = $('#login-error');
  err.textContent = text;
  show(err, Boolean(text));
}

async function start() {
  if (!found) return;
  const btn = $('#login-sso-btn');
  btn.disabled = true;
  showError('');
  try {
    const res = await api('POST', '/auth/sso/start', { email: found.email });
    const url = typeof res?.url === 'string' ? res.url : '';
    // Само абсолютен адрес на доставчика (https; http — само в локалните тестове).
    if (!/^https?:\/\//i.test(url)) throw new Error('sso');
    location.assign(url);
  } catch (ex) {
    showError(ssoErrorText(ex));
    btn.disabled = false;
  }
}

export function initSso() {
  const email = $('#login-email');
  email.addEventListener('change', () => void discover());
  email.addEventListener('blur', () => void discover());
  $('#login-sso-btn').addEventListener('click', () => void start());
}

/** Паролата е отказана, защото за акаунта е задължителен единният вход. */
export function ssoLoginError(ex) {
  if (ex?.code !== 'sso_required') return null;
  lastAsked = '';
  void discover().then(() => $('#login-sso-btn')?.focus());
  return t('sso.err.sso_required');
}

/** Кодът от връщането (`?sso_error=…`) — махаме го от адреса веднага (преди езика). */
export function takeSsoError() {
  const url = new URL(location.href);
  const code = url.searchParams.get('sso_error');
  if (code === null) return null;
  url.searchParams.delete('sso_error');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  return RESULT_CODES.includes(code) ? code : 'sso_failed';
}

/** Текстът за кода от връщането (след зареждане на езика). */
export function ssoResultText(code) {
  return t(`sso.err.${RESULT_CODES.includes(code) ? code : 'sso_failed'}`);
}

/**
 * Изход: при SSO сесия — през /auth/sso/logout (връща адреса за изход при доставчика, ако е
 * включен); иначе обичайният. Връща адреса за пренасочване или null.
 */
export async function logoutRequest() {
  if (state.authMethod === 'sso') {
    const res = await api('POST', '/auth/sso/logout');
    const next = typeof res?.endSessionUrl === 'string' ? res.endSessionUrl : '';
    return /^https?:\/\//i.test(next) ? next : null;
  }
  await api('POST', '/auth/logout');
  return null;
}
