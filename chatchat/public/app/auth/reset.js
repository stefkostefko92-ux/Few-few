// Страница `/reset#<токен>` — нова парола по еднократния линк от администратора.
// Токенът е във фрагмента (не стига до сървъра, до логовете и до Referer). Прочита се веднъж,
// пази се само в променлива на модула и веднага се маха от адреса и от историята.

import { api } from '../api.js';
import { $ } from '../dom.js';
import { errorText } from '../errors.js';
import { t } from '../i18n.js';
import { setNote, showScreen } from './screens.js';

const TOKEN = /^[A-Za-z0-9_-]{20,100}$/;
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 256;

let token = null;

/** true, ако текущият адрес е страница за нова парола. Маха токена от адреса. */
export function takeResetToken() {
  if (location.pathname !== '/reset') return false;
  const raw = location.hash.replace(/^#/, '');
  token = TOKEN.test(raw) ? raw : null;
  history.replaceState(null, '', '/reset');
  return true;
}

export function resetErrorText(err) {
  if (err?.code === 'invalid_token') return t('reset.error.token');
  if (err?.code === 'weak_password') return t('reset.error.weak', { min: PASSWORD_MIN });
  return errorText(err);
}

export function showReset() {
  const err = $('#reset-error');
  setNote(err, '');
  $('#reset-done').hidden = true;
  $('#reset-form').hidden = token === null;
  $('#reset-home').hidden = token !== null;
  if (token === null) setNote(err, t('reset.error.token'));
  showScreen('reset', token ? '#reset-password' : '#reset-home');
}

export function initReset() {
  const form = $('#reset-form');
  const err = $('#reset-error');
  const submit = $('#reset-submit');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = $('#reset-password').value;
    const b = $('#reset-password2').value;
    if (a.length < PASSWORD_MIN) {
      setNote(err, t('reset.error.weak', { min: PASSWORD_MIN }));
      $('#reset-password').focus();
      return;
    }
    if (a.length > PASSWORD_MAX) {
      setNote(err, t('reset.error.long', { max: PASSWORD_MAX }));
      return;
    }
    if (a !== b) {
      setNote(err, t('reset.error.mismatch'));
      $('#reset-password2').focus();
      return;
    }
    setNote(err, '');
    submit.disabled = true;
    try {
      await api('POST', '/auth/reset-password', { token, newPassword: a });
      token = null;
      $('#reset-password').value = '';
      $('#reset-password2').value = '';
      form.hidden = true;
      $('#reset-done').hidden = false;
      $('#reset-login').focus();
    } catch (ex) {
      setNote(err, resetErrorText(ex));
      if (ex.code === 'invalid_token') {
        token = null;
        form.hidden = true;
      }
    } finally {
      submit.disabled = false;
    }
  });
  // Към входа: чиста навигация (нова зареда на „/“), без остатъци в паметта.
  for (const id of ['#reset-login', '#reset-home']) {
    $(id).addEventListener('click', () => location.assign('/'));
  }
}
