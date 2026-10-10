// Диалог „Акаунт и сигурност“: втори фактор (включване по желание за техниците, изключване с код;
// персоналът не го изключва сам — изгубено устройство = нулиране от администратора) и
// поверителност на присъствието (последно видян).

import { api } from '../api.js';
import { announce, clear, h, $ } from '../dom.js';
import { errorText } from '../errors.js';
import { t } from '../i18n.js';
import { state } from '../store.js';
import { mountMfaSetup } from './mfa-setup.js';
import { cleanCode, codeErrorText } from './mfa-verify.js';

function statusLine(mfa) {
  if (mfa.enabled)
    return h(
      'p',
      { class: 'status-line' },
      h('span', { 'aria-hidden': 'true' }, '✓ '),
      t('sec.mfa.on'),
    );
  return h(
    'p',
    { class: 'status-line' },
    h('span', { 'aria-hidden': 'true' }, '– '),
    t('sec.mfa.off'),
  );
}

function mfaSection(body) {
  const mfa = state.mfa;
  const box = h('section', { class: 'sec-block', 'aria-labelledby': 'sec-mfa-title' });
  box.append(h('h3', { id: 'sec-mfa-title' }, t('sec.mfa.title')), statusLine(mfa));

  if (mfa.enabled && mfa.required) {
    box.append(h('p', { class: 'hint' }, t('sec.mfa.requiredHint')));
  } else if (mfa.enabled) {
    const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const code = h('input', {
      id: 'sec-disable-code',
      class: 'mono code-input',
      inputmode: 'numeric',
      autocomplete: 'one-time-code',
      maxlength: '10',
    });
    box.append(
      h(
        'form',
        {
          novalidate: true,
          onsubmit: async (e) => {
            e.preventDefault();
            const value = cleanCode(code.value);
            if (!/^\d{6,8}$/.test(value)) {
              err.textContent = t('mfa.error.format');
              err.hidden = false;
              return;
            }
            err.hidden = true;
            try {
              const data = await api('POST', '/auth/mfa/disable', { code: value });
              state.mfa = data.mfa ?? { enabled: false, passed: false, required: false };
              announce(t('sec.mfa.disabled'));
              render(body);
            } catch (ex) {
              err.textContent =
                ex.code === 'mfa_required_for_role' ? t('sec.mfa.requiredHint') : codeErrorText(ex);
              err.hidden = false;
            }
          },
        },
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'sec-disable-code' }, t('sec.mfa.disableLabel')),
          code,
        ),
        err,
        h('button', { class: 'btn btn-secondary', type: 'submit' }, t('sec.mfa.disable')),
      ),
    );
  } else {
    const host = h('div', { class: 'sec-setup' });
    box.append(
      h(
        'p',
        { class: 'hint' },
        mfa.required ? t('sec.mfa.requiredHint') : t('sec.mfa.optionalHint'),
      ),
      h(
        'button',
        {
          class: 'btn btn-secondary',
          type: 'button',
          onclick: (e) => {
            e.currentTarget.hidden = true;
            mountMfaSetup(host, { onDone: () => render(body), onCancel: () => render(body) });
          },
        },
        t('sec.mfa.enable'),
      ),
      host,
    );
  }
  return box;
}

function presenceSection() {
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const box = h('input', {
    id: 'sec-lastseen',
    type: 'checkbox',
    checked: state.showLastSeen !== false,
    onchange: async (e) => {
      const want = e.currentTarget.checked;
      err.hidden = true;
      try {
        const data = await api('PATCH', '/presence/me', { showLastSeen: want });
        state.showLastSeen = data.showLastSeen;
        announce(t('sec.presence.saved'));
      } catch (ex) {
        e.currentTarget.checked = !want;
        err.textContent = errorText(ex);
        err.hidden = false;
      }
    },
  });
  return h(
    'section',
    { class: 'sec-block', 'aria-labelledby': 'sec-pres-title' },
    h('h3', { id: 'sec-pres-title' }, t('sec.presence.title')),
    h('p', { class: 'hint' }, t('sec.presence.hint')),
    h(
      'label',
      { class: 'check-row', for: 'sec-lastseen' },
      box,
      h('span', null, t('sec.presence.lastSeen')),
    ),
    err,
  );
}

function render(body) {
  clear(body).append(mfaSection(body), presenceSection());
}

export function openSecurityDialog() {
  const dlg = $('#dlg-security');
  render($('#sec-body'));
  if (!dlg.open) dlg.showModal();
}
