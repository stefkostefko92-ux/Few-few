// Екран за TOTP код след парола (401 mfa_required → POST /auth/mfa/verify).

import { api } from '../api.js';
import { $ } from '../dom.js';
import { errorText } from '../errors.js';
import { t } from '../i18n.js';
import { state } from '../store.js';
import { setNote, showScreen } from './screens.js';

/** Текст за грешка при код: изтекъл/грешен е различно от прекалено много опити. */
export function codeErrorText(err) {
  if (err?.code === 'invalid_code') return t('mfa.error.invalid');
  return errorText(err);
}

/** Кодът е само цифри; пастнат с интервал/тире („123 456“) се нормализира. */
export const cleanCode = (v) => String(v ?? '').replace(/[\s-]/g, '');

/**
 * @param {{ onPassed: () => void | Promise<void>, onCancel: () => void }} hooks
 */
export function initMfaVerify({ onPassed, onCancel }) {
  const form = $('#mfa-form');
  const err = $('#mfa-error');
  const submit = $('#mfa-submit');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = cleanCode($('#mfa-code').value);
    if (!/^\d{6,8}$/.test(code)) {
      setNote(err, t('mfa.error.format'));
      $('#mfa-code').focus();
      return;
    }
    setNote(err, '');
    submit.disabled = true;
    try {
      const data = await api('POST', '/auth/mfa/verify', { code });
      state.mfa = data.mfa ?? { ...state.mfa, passed: true };
      $('#mfa-code').value = '';
      await onPassed();
    } catch (ex) {
      setNote(err, codeErrorText(ex));
      $('#mfa-code').select();
    } finally {
      submit.disabled = false;
    }
  });
  $('#mfa-cancel').addEventListener('click', onCancel);
}

export function showMfaVerify() {
  setNote($('#mfa-error'), '');
  $('#mfa-code').value = '';
  showScreen('mfa', '#mfa-code');
}
