// Настройката на конектора: вид, включен, език на текстовете към helpdesk-а, полетата по вид и
// тайните. Тайните са САМО за запис: празно поле = без промяна; „Премахни“ = изтриване; сървърът
// връща само „зададена ли е“. HMAC ключовете може да се генерират тук (в браузъра) — показват се
// веднъж, преди запис, за да се копират в helpdesk-а.

import { t } from '../i18n.js';
import { callDetailed } from './core.js';
import {
  canGenerate,
  codeText,
  fieldLabel,
  KINDS,
  LANGS,
  randomSecret,
  secretFields,
  SETTINGS_FIELDS,
} from './integrations-common.js';
import { button, checkbox, field, h, input, select, toast } from './ui.js';

const SETTING_PROPS = {
  url: { type: 'url', maxlength: 500, placeholder: 'https://helpdesk.example.com/chatchat' },
  subdomain: { maxlength: 63, placeholder: 'azienda', spellcheck: 'false' },
  baseUrl: { type: 'url', maxlength: 500, placeholder: 'https://azienda.atlassian.net' },
  serviceDeskId: { inputmode: 'numeric', maxlength: 12, pattern: '\\d+' },
  requestTypeId: { inputmode: 'numeric', maxlength: 12, pattern: '\\d+' },
};

function settingControl(name, value) {
  if (name === 'authMode') {
    return select(
      ['oauth', 'api_token'].map((v) => ({ value: v, label: t(`admin.integrations.auth.${v}`) })),
      value || 'oauth',
    );
  }
  return input({ ...SETTING_PROPS[name], value: value ?? '' });
}

/** Поле за тайна: парола, „зададена/не е“, по желание „Генерирай“ и „Премахни“. */
function secretControl(kind, name, isSet) {
  const box = input({
    type: 'password',
    autocomplete: 'new-password',
    maxlength: 1024,
    spellcheck: 'false',
    placeholder: isSet ? t('admin.integrations.secretSet') : t('admin.integrations.secretUnset'),
  });
  const extras = [];
  if (canGenerate(kind, name)) {
    extras.push(
      button(
        t('admin.integrations.generate'),
        () => {
          box.type = 'text';
          box.value = randomSecret();
          box.select();
          toast(t('admin.integrations.generated'), 'warn');
        },
        { small: true },
      ),
    );
  }
  const remove = isSet ? checkbox(t('admin.integrations.secretRemove')) : null;
  const wrap = field(fieldLabel(name), box, {
    hint:
      name === 'inboundSecret'
        ? t('admin.integrations.inboundSecretHint')
        : t('admin.integrations.secretKeep'),
  });
  if (extras.length) box.after(h('div', { class: 'btn-row' }, ...extras));
  if (remove) wrap.append(remove);
  return {
    el: wrap,
    value: () => {
      if (remove?.querySelector('input')?.checked) return null;
      const v = box.value.trim();
      return v === '' ? undefined : v;
    },
  };
}

/**
 * Формулярът; `view` е изгледът от сървъра (или null — още няма конектор), `onSaved` презарежда
 * раздела. Връща елемента.
 */
export function integrationForm(view, onSaved) {
  const saved = view ?? { kind: 'WEBHOOK', enabled: false, settings: {}, secrets: {} };
  const kind = select(
    KINDS.map((k) => ({ value: k, label: t(`helpdesk.kind.${k}`) })),
    saved.kind,
  );
  const enabled = checkbox(t('admin.integrations.enabled'));
  enabled.querySelector('input').checked = saved.enabled;
  const language = select(
    LANGS.map((l) => ({ value: l, label: t(`admin.integrations.lang.${l}`) })),
    saved.settings?.language ?? 'it',
  );
  const specific = h('div', { class: 'field-row' });
  const secretsBox = h('div', { class: 'field-row' });
  const kindNote = h(
    'p',
    { class: 'note note-warn', hidden: true },
    t('admin.integrations.kindChange'),
  );
  let controls = {};
  let secrets = {};

  const renderSecrets = () => {
    const k = kind.value;
    const sameKind = k === saved.kind;
    const mode = controls.authMode?.value;
    secrets = {};
    secretsBox.replaceChildren();
    for (const name of secretFields(k, mode)) {
      const c = secretControl(k, name, sameKind && saved.secrets?.[name] === true);
      secrets[name] = c;
      secretsBox.append(c.el);
    }
  };
  const renderKind = () => {
    const k = kind.value;
    controls = {};
    specific.replaceChildren();
    for (const name of SETTINGS_FIELDS[k]) {
      const value = k === saved.kind ? saved.settings?.[name] : undefined;
      const control = settingControl(name, value);
      controls[name] = control;
      const hint = t(`admin.integrations.hint.${name}`);
      specific.append(field(fieldLabel(name), control, { hint }));
      if (name === 'authMode') control.addEventListener('change', renderSecrets);
    }
    kindNote.hidden = !view || k === saved.kind;
    renderSecrets();
  };
  kind.addEventListener('change', renderKind);
  renderKind();

  const msg = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const save = button(
    t('admin.integrations.save'),
    async () => {
      msg.hidden = true;
      const settings = { language: language.value };
      for (const [name, control] of Object.entries(controls)) settings[name] = control.value.trim();
      const secretValues = {};
      for (const [name, c] of Object.entries(secrets)) {
        const v = c.value();
        if (v !== undefined) secretValues[name] = v;
      }
      save.disabled = true;
      try {
        await callDetailed('PUT', '/admin/integrations', {
          kind: kind.value,
          enabled: enabled.querySelector('input').checked,
          settings,
          secrets: secretValues,
        });
        toast(t('admin.integrations.saved'));
        await onSaved();
      } catch (err) {
        const fields = Array.isArray(err?.body?.fields) ? err.body.fields : [];
        msg.textContent = [
          codeText(err?.code) || t('err.validation'),
          fields.length
            ? t('admin.integrations.fields', { fields: fields.map(fieldLabel).join(', ') })
            : '',
        ]
          .filter(Boolean)
          .join(' ');
        msg.hidden = false;
      } finally {
        save.disabled = false;
      }
    },
    { kind: 'primary' },
  );

  return h(
    'div',
    { class: 'fieldset' },
    h(
      'div',
      { class: 'field-row' },
      field(t('admin.integrations.kind'), kind),
      field(t('admin.integrations.language'), language, {
        hint: t('admin.integrations.languageHint'),
      }),
    ),
    enabled,
    kindNote,
    specific,
    h('h3', {}, t('admin.integrations.secretsTitle')),
    view?.secretsUnreadable
      ? h('p', { class: 'note note-warn' }, t('admin.integrations.unreadable'))
      : null,
    secretsBox,
    msg,
    h('div', { class: 'btn-row' }, save),
  );
}
