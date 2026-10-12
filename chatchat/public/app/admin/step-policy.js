// Политиката за човешкото потвърждение (§11.2): кой разрешава стъпките по безопасност и
// конфигурационните и колко важи разрешението. Само администраторът на клиента (policy:manage);
// всяка промяна иска причина и влиза в одита. „Без разрешение“ за безопасност не съществува.

import { t } from '../i18n.js';
import { call } from './core.js';
import {
  button,
  errText,
  failure,
  field,
  h,
  input,
  loading,
  sectionHead,
  select,
  textarea,
  toast,
} from './ui.js';

const SAFETY = ['SELF', 'SUPPORT', 'ENGINEERING'];
const ALL = ['NONE', ...SAFETY];
const option = (v) => ({ value: v, label: t(`step.policy.level.${v}`) });

function form(policy, reload) {
  const safety = select(SAFETY.map(option), policy.safetyRelevant);
  const config = select(ALL.map(option), policy.configurative);
  const ttl = input({
    type: 'number',
    min: '15',
    max: '1440',
    step: '15',
    value: String(policy.ttlMinutes),
  });
  const reason = textarea({ rows: 2, maxlength: 500, required: true });
  const msg = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const save = button(
    t('step.policy.save'),
    async () => {
      msg.hidden = true;
      const text = reason.value.trim();
      if (text.length < 3) {
        msg.textContent = t('ticket.err.reason_required');
        msg.hidden = false;
        reason.focus();
        return;
      }
      save.disabled = true;
      try {
        await call('PUT', '/admin/step-policy', {
          safetyRelevant: safety.value,
          configurative: config.value,
          ttlMinutes: Number(ttl.value),
          reason: text,
        });
        toast(t('step.policy.saved'));
        await reload();
      } catch (err) {
        msg.textContent = errText(err);
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
    field(t('step.policy.safety'), safety, { hint: t('step.policy.safetyHint') }),
    field(t('step.policy.config'), config, { hint: t('step.policy.configHint') }),
    field(t('step.policy.ttl'), ttl, { hint: t('step.policy.ttlHint') }),
    field(t('step.policy.reason'), reason, { wide: true }),
    msg,
    h('div', { class: 'btn-row' }, save),
  );
}

export async function mount(view) {
  const render = async () => {
    view.replaceChildren(
      sectionHead(t('step.policy.title')),
      h('p', { class: 'muted' }, t('step.policy.intro')),
      loading(),
    );
    try {
      const { policy } = await call('GET', '/admin/step-policy');
      view.lastElementChild.replaceWith(form(policy, render));
    } catch (err) {
      view.lastElementChild.replaceWith(failure(err, render));
    }
  };
  await render();
  return () => undefined;
}
