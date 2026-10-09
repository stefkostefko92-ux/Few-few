// Настройка на втория фактор (TOTP): парола → QR + ръчен ключ → код. Един компонент за целия
// екран (персонал без MFA) и за диалога „Акаунт и сигурност“ (техник по желание).
// QR-ът идва като SVG низ от сървъра: показва се САМО като <img src="data:…"> (изолиран от
// страницата, без скриптове) — никога innerHTML.

import { api } from '../api.js';
import { announce, clear, h } from '../dom.js';
import { errorText } from '../errors.js';
import { t } from '../i18n.js';
import { state } from '../store.js';
import { cleanCode, codeErrorText } from './mfa-verify.js';

const groups = (secret) =>
  String(secret)
    .replace(/\s+/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim();

function svgDataUrl(svg) {
  return typeof svg === 'string' && /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    : '';
}

function field(id, label, input, hint) {
  return h(
    'div',
    { class: 'field' },
    h('label', { for: id }, label),
    input,
    hint ? h('p', { class: 'hint', id: `${id}-hint` }, hint) : null,
  );
}

function errorLine() {
  return h('p', { class: 'form-error', role: 'alert', hidden: true });
}

function setError(el, text) {
  el.textContent = text;
  el.hidden = text === '';
}

/**
 * @param {HTMLElement} host
 * @param {{ onDone: () => void | Promise<void>, onCancel?: () => void }} hooks
 */
export function mountMfaSetup(host, { onDone, onCancel }) {
  const askPassword = () => {
    const err = errorLine();
    const pw = h('input', {
      id: 'setup-password',
      type: 'password',
      autocomplete: 'current-password',
      required: true,
    });
    const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, t('mfa.setup.start'));
    const form = h(
      'form',
      {
        novalidate: true,
        onsubmit: async (e) => {
          e.preventDefault();
          if (!pw.value) {
            setError(err, t('mfa.setup.passwordRequired'));
            pw.focus();
            return;
          }
          setError(err, '');
          submit.disabled = true;
          try {
            const data = await api('POST', '/auth/mfa/setup', { password: pw.value });
            pw.value = '';
            showSecret(data);
          } catch (ex) {
            setError(
              err,
              ex.code === 'invalid_password' ? t('mfa.setup.badPassword') : errorText(ex),
            );
            if (ex.code === 'mfa_already_enabled') await finish();
          } finally {
            submit.disabled = false;
          }
        },
      },
      h('p', null, t('mfa.setup.intro')),
      field('setup-password', t('login.password'), pw, t('mfa.setup.passwordHint')),
      err,
      h(
        'div',
        { class: 'dlg-actions' },
        onCancel
          ? h(
              'button',
              { class: 'btn btn-quiet', type: 'button', onclick: onCancel },
              t('common.cancel'),
            )
          : null,
        submit,
      ),
    );
    clear(host).append(form);
    pw.focus();
  };

  const finish = async () => {
    state.mfa = { ...state.mfa, enabled: true, passed: true };
    announce(t('mfa.setup.done'));
    await onDone();
  };

  const showSecret = ({ qrSvg, secret, otpauthUri }) => {
    const src = svgDataUrl(qrSvg);
    const err = errorLine();
    const code = h('input', {
      id: 'setup-code',
      class: 'mono code-input',
      inputmode: 'numeric',
      autocomplete: 'one-time-code',
      pattern: '[0-9 ]*',
      maxlength: '10',
      required: true,
    });
    const copied = h(
      'span',
      { class: 'form-note', role: 'status', hidden: true },
      t('common.copied'),
    );
    const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, t('mfa.setup.enable'));
    const app = typeof otpauthUri === 'string' && otpauthUri.startsWith('otpauth://totp/');
    clear(host).append(
      h(
        'ol',
        { class: 'steps' },
        h(
          'li',
          null,
          h('p', null, t('mfa.setup.step1')),
          src
            ? h('img', {
                class: 'qr-img',
                src,
                width: '208',
                height: '208',
                alt: t('mfa.setup.qrAlt'),
              })
            : null,
          h('p', { class: 'hint' }, t('mfa.setup.manual')),
          h(
            'p',
            { class: 'secret-row' },
            h('code', { class: 'secret mono' }, groups(secret)),
            h(
              'button',
              {
                class: 'btn btn-secondary btn-sm',
                type: 'button',
                onclick: async () => {
                  try {
                    await navigator.clipboard.writeText(String(secret));
                    copied.hidden = false;
                  } catch {
                    copied.hidden = true;
                  }
                },
              },
              t('common.copy'),
            ),
            copied,
          ),
          app ? h('a', { class: 'hint-link', href: otpauthUri }, t('mfa.setup.openApp')) : null,
        ),
        h(
          'li',
          null,
          h(
            'form',
            {
              novalidate: true,
              onsubmit: async (e) => {
                e.preventDefault();
                const value = cleanCode(code.value);
                if (!/^\d{6,8}$/.test(value)) {
                  setError(err, t('mfa.error.format'));
                  code.focus();
                  return;
                }
                setError(err, '');
                submit.disabled = true;
                try {
                  await api('POST', '/auth/mfa/enable', { code: value });
                  await finish();
                } catch (ex) {
                  setError(err, codeErrorText(ex));
                  code.select();
                } finally {
                  submit.disabled = false;
                }
              },
            },
            field('setup-code', t('mfa.setup.step2'), code, t('mfa.setup.codeHint')),
            err,
            h(
              'div',
              { class: 'dlg-actions' },
              onCancel
                ? h(
                    'button',
                    { class: 'btn btn-quiet', type: 'button', onclick: onCancel },
                    t('common.cancel'),
                  )
                : null,
              submit,
            ),
          ),
        ),
      ),
    );
    code.focus();
  };

  askPassword();
}
