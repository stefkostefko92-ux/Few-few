// Свързване на акаунта с доставчика на единния вход ОТ САМИЯ СОБСТВЕНИК („Collega l’account
// aziendale“): администраторът на клиента и всеки с включен TOTP не се свързват по имейл при вход —
// само оттук, от сесия с парола + код (≤ 10 минути). Два входа: разделът в „Акаунт и сигурност“ и
// екранът при задължителен единен вход (сесия само за свързване — 403 `sso_link_required`).
// Връщането носи `?sso_link=ok|failed|denied` (махаме го веднага).

import { api } from '../api.js';
import { $, h, show } from '../dom.js';
import { t } from '../i18n.js';
import { state } from '../store.js';
import { showScreen } from './screens.js';
import { ssoErrorText } from './sso.js';

const RESULTS = ['ok', 'failed', 'denied'];

/** Сесията е само за свързване (REQUIRED, още без собствена връзка). */
export const needsLink = () => state.ssoLinkRequired === true;

/** Резултатът от връщането (`?sso_link=`) — махаме го от адреса веднага. */
export function takeSsoLink() {
  const url = new URL(location.href);
  const code = url.searchParams.get('sso_link');
  if (code === null) return null;
  url.searchParams.delete('sso_link');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  return RESULTS.includes(code) ? code : 'failed';
}

/** Текстът на резултата (след зареждане на езика). */
export function linkResultText(code, { signedIn = true } = {}) {
  if (code === 'ok' && !signedIn) return t('sso.link.result.okSignIn');
  return t(`sso.link.result.${RESULTS.includes(code) ? code : 'failed'}`);
}

/** Бележка (не грешка) на екрана за вход — напр. „свързан, сега влезте“; празен текст я скрива. */
export function loginNote(text) {
  const note = $('#login-note');
  note.textContent = text;
  show(note, Boolean(text));
}

function actionLabel(status) {
  if (status?.provider === 'ENTRA') return t('sso.link.actionMicrosoft');
  return status?.label ? t('sso.link.actionNamed', { name: status.label }) : t('sso.link.action');
}

/** Към доставчика: POST /auth/sso/link/start → пренасочване; грешката — в `err`. */
async function start(btn, err) {
  btn.disabled = true;
  err.hidden = true;
  try {
    const res = await api('POST', '/auth/sso/link/start');
    const url = typeof res?.url === 'string' ? res.url : '';
    if (!/^https?:\/\//i.test(url)) throw new Error('sso');
    location.assign(url);
  } catch (ex) {
    err.textContent = ssoErrorText(ex);
    err.hidden = false;
    btn.disabled = false;
  }
}

async function status() {
  try {
    return await api('GET', '/auth/sso/link');
  } catch {
    return null;
  }
}

/** Екранът при задължителен единен вход: само свързване или изход. */
export async function showSsoLink(note) {
  showScreen('link');
  const err = $('#sso-link-error');
  err.textContent = note ?? '';
  show(err, Boolean(note));
  const s = await status();
  $('#sso-link-label').textContent = actionLabel(s);
  show($('#sso-link-logo'), s?.provider === 'ENTRA');
  $('#sso-link-btn').focus();
}

export function initSsoLink({ onCancel }) {
  $('#sso-link-btn').addEventListener(
    'click',
    (e) => void start(e.currentTarget, $('#sso-link-error')),
  );
  $('#sso-link-cancel').addEventListener('click', onCancel);
}

function statusText(s) {
  if (s.linked && s.linkMethod === 'SELF') return t('sso.link.status.self');
  if (s.linked) return t('sso.link.status.email');
  return t('sso.link.status.none');
}

/** Разделът „Accesso aziendale“ в „Акаунт и сигурност“ (само ако доставчик покрива човека). */
export function ssoSection(note) {
  const box = h('section', {
    class: 'sec-block',
    'aria-labelledby': 'sec-sso-title',
    hidden: true,
  });
  void status().then((s) => {
    if (!s?.available) return;
    const err = h('p', { class: 'form-error', role: 'alert', hidden: !note }, note ?? '');
    box.append(
      h('h3', { id: 'sec-sso-title' }, t('sso.link.title')),
      h('p', { class: 'status-line' }, statusText(s)),
    );
    if (s.authMethod === 'sso') {
      box.append(h('p', { class: 'hint' }, t('sso.link.hintSso')));
    } else if (!s.mfaEnabled) {
      box.append(h('p', { class: 'hint' }, t('sso.link.hintNoMfa')));
    } else if (!(s.linked && s.linkMethod === 'SELF')) {
      box.append(
        h('p', { class: 'hint' }, t(s.ownerLinkRequired ? 'sso.link.hintOwner' : 'sso.link.hint')),
        h(
          'button',
          {
            id: 'sec-sso-link',
            class: 'btn btn-secondary',
            type: 'button',
            onclick: (e) => void start(e.currentTarget, err),
          },
          actionLabel(s),
        ),
      );
    }
    box.append(err);
    box.hidden = false;
  });
  return box;
}
