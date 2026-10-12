// Формуляр в диалог за действията на потока (предаване, искане на данни, затваряне…). Създава се
// при отваряне и се маха при затваряне. Етикет за всяко поле, грешката — role="alert", фокусът —
// в първото поле; Esc/„Annulla“ затварят и браузърът връща фокуса към бутона, който го е отворил.
// Само DOM възли и textContent — никога innerHTML.

import { h } from '../dom.js';
import { t } from '../i18n.js';
import { flowError } from './api.js';

let seq = 0;

function fieldFor(f, uid) {
  const fid = `${uid}-${f.name}`;
  if (f.type === 'checks') {
    return h(
      'fieldset',
      { class: 'flow-checks' },
      h('legend', null, f.label),
      f.options.length === 0 ? h('p', { class: 'hint' }, f.empty ?? '') : null,
      f.options.map((o, i) =>
        h(
          'label',
          { class: 'check-row', for: `${fid}-${i}` },
          h('input', { type: 'checkbox', id: `${fid}-${i}`, name: f.name, value: o.value }),
          ` ${o.label}`,
        ),
      ),
    );
  }
  const hintId = f.hint ? `${fid}-hint` : null;
  const common = {
    id: fid,
    name: f.name,
    required: f.required ? true : null,
    maxlength: f.maxlength ?? null,
    'aria-describedby': hintId,
  };
  let control;
  if (f.type === 'select') {
    control = h(
      'select',
      common,
      f.options.map((o) => h('option', { value: o.value }, o.label)),
    );
  } else if (f.type === 'text') {
    control = h('input', { ...common, type: 'text', autocomplete: 'off' });
  } else {
    control = h('textarea', { ...common, rows: f.rows ?? 4 });
  }
  if (f.value !== undefined) control.value = f.value;
  return h(
    'div',
    { class: 'field' },
    h('label', { for: fid }, f.label),
    control,
    f.hint ? h('p', { class: 'hint', id: hintId }, f.hint) : null,
  );
}

function valuesOf(form, fields) {
  const out = {};
  for (const f of fields) {
    if (f.type === 'checks') {
      out[f.name] = [...form.querySelectorAll(`input[name="${f.name}"]:checked`)].map(
        (i) => i.value,
      );
    } else {
      out[f.name] = String(form.elements.namedItem(f.name)?.value ?? '').trim();
    }
  }
  return out;
}

/**
 * @param {{ title: string, hint?: string, fields: object[], submitLabel: string,
 *   onSubmit: (values: Record<string, unknown>) => Promise<void> }} spec
 * @returns {Promise<boolean>} true — изпратено успешно
 */
export function formDialog(spec) {
  const uid = `flowdlg-${(seq += 1)}`;
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, spec.submitLabel);
  const form = h(
    'form',
    { method: 'dialog', novalidate: true },
    h('h2', { id: `${uid}-title` }, spec.title),
    spec.hint ? h('p', { class: 'hint' }, spec.hint) : null,
    spec.fields.map((f) => fieldFor(f, uid)),
    error,
    h(
      'div',
      { class: 'dlg-actions' },
      h('button', { class: 'btn btn-quiet', type: 'button', value: 'cancel' }, t('common.cancel')),
      submit,
    ),
  );
  const dlg = h('dialog', { class: 'dlg', 'aria-labelledby': `${uid}-title` }, form);
  document.body.append(dlg);
  return new Promise((resolve) => {
    let sent = false;
    dlg.addEventListener('close', () => {
      dlg.remove();
      resolve(sent);
    });
    form.querySelector('button[value="cancel"]').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close();
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const values = valuesOf(form, spec.fields);
      const missing = spec.fields.find(
        (f) => f.required && String(values[f.name] ?? '').length < (f.minlength ?? 1),
      );
      if (missing) {
        error.textContent = missing.requiredText ?? t('err.invalid_input');
        error.hidden = false;
        form.elements.namedItem(missing.name)?.focus();
        return;
      }
      submit.disabled = true;
      error.hidden = true;
      try {
        await spec.onSubmit(values);
        sent = true;
        dlg.close();
      } catch (err) {
        error.textContent = flowError(err);
        error.hidden = false;
      } finally {
        submit.disabled = false;
      }
    });
    dlg.showModal();
    form.querySelector('input, select, textarea')?.focus();
  });
}
