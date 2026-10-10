// Разрешението за стъпка (§11.2 Human-in-the-loop) в отговора: състояние (чака / разрешено /
// отказано), заявка от техника (или изрично собствено потвърждение при политика SELF) и решение
// от ДРУГ човек от персонала с причина. Порталът вижда ролята на разрешилия, не името (сървърът).

import { announce, h } from '../dom.js';
import { fmtStamp } from '../format.js';
import { t } from '../i18n.js';
import { state } from '../store.js';
import { flowApi, flowError } from './api.js';
import { personText, stepFocus } from './people.js';
import { approvalFor, reloadSteps } from './state.js';

const APPROVERS = { SUPPORT: ['SUPPORT', 'ENGINEERING'], ENGINEERING: ['ENGINEERING'] };

const isValid = (a) =>
  a?.status === 'GRANTED' && a.expiresAt && new Date(a.expiresAt).getTime() > Date.now();

function stateLine(a, level) {
  if (!a || (a.status === 'GRANTED' && !isValid(a))) {
    return h(
      'p',
      { class: 'step-approval' },
      t('step.approval.needed', { level: t(`step.level.${level}`) }),
    );
  }
  if (a.status === 'PENDING') {
    return h(
      'p',
      { class: 'step-approval step-pending' },
      h('span', { 'aria-hidden': 'true' }, '⏳ '),
      t('step.approval.pending', {
        level: t(`step.level.${a.level}`),
        when: fmtStamp(a.requestedAt),
      }),
    );
  }
  if (a.status === 'GRANTED') {
    return h(
      'p',
      { class: 'step-approval step-granted' },
      h('span', { 'aria-hidden': 'true' }, '✓ '),
      a.selfAttested
        ? t('step.approval.self', { when: fmtStamp(a.decidedAt) })
        : t('step.approval.granted', { who: personText(a.decidedBy), when: fmtStamp(a.decidedAt) }),
      a.decisionReason ? ` — ${a.decisionReason}` : '',
    );
  }
  return h(
    'p',
    { class: 'step-approval step-denied' },
    h('span', { 'aria-hidden': 'true' }, '✗ '),
    t('step.approval.denied', { who: personText(a.decidedBy) }),
    a.decisionReason ? ` — ${a.decisionReason}` : '',
  );
}

/** Бутон с действие: при грешка — съобщение до бутона; при успех — опресняване на стъпките. */
function actionButton(label, cls, msg, key, run) {
  return h(
    'button',
    {
      type: 'button',
      class: `btn ${cls} btn-sm`,
      onclick: async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        msg.textContent = '';
        try {
          const text = await run();
          if (text) announce(text);
          stepFocus.key = key;
          await reloadSteps();
        } catch (err) {
          msg.textContent = flowError(err);
          btn.disabled = false;
        }
      },
    },
    label,
  );
}

function requestControls(message, check, level, msg, key) {
  const uid = `appr-${key.replace(/[^\w-]/g, '_')}`;
  if (level === 'SELF') {
    const box = h('input', { type: 'checkbox', id: `${uid}-attest` });
    const confirm = actionButton(
      t('step.approval.confirmSelf'),
      'btn-primary',
      msg,
      key,
      async () => {
        if (!box.checked)
          throw Object.assign(new Error('attest'), { code: 'attestation_required' });
        await flowApi.requestApproval(state.currentId, {
          messageId: message.id,
          step: check.step,
          attest: true,
        });
        return t('step.approval.selfDone', { step: check.step });
      },
    );
    return h(
      'div',
      { class: 'step-attest' },
      h('label', { class: 'check-row', for: box.id }, box, ` ${t('step.approval.attest')}`),
      confirm,
    );
  }
  return actionButton(
    t('step.approval.request', { level: t(`step.level.${level}`) }),
    'btn-secondary',
    msg,
    key,
    async () => {
      await flowApi.requestApproval(state.currentId, { messageId: message.id, step: check.step });
      return t('step.approval.requested', { step: check.step });
    },
  );
}

function decideControls(a, msg, key) {
  const id = `dec-${a.id}`;
  const reason = h('textarea', { id, rows: 2, maxlength: 1000, required: true });
  const run = (decision) => async () => {
    const text = reason.value.trim();
    if (text.length < 3) {
      reason.focus();
      throw Object.assign(new Error('reason'), { code: 'reason_required' });
    }
    await flowApi.decide(a.id, decision, text);
    return t(decision === 'GRANT' ? 'step.approval.grantedNow' : 'step.approval.deniedNow');
  };
  return h(
    'div',
    { class: 'step-decide' },
    h('label', { for: id }, t('step.approval.reason')),
    reason,
    h(
      'div',
      { class: 'step-buttons' },
      actionButton(t('step.approval.grant'), 'btn-primary', msg, key, run('GRANT')),
      actionButton(t('step.approval.deny'), 'btn-secondary', msg, key, run('DENY')),
    ),
  );
}

/** Блокът за разрешението; `valid` — може ли стъпката да се отбележи като изпълнена. */
export function approvalBlock(message, check, level, flow) {
  const key = `${message.id}#${check.step}`;
  const a = approvalFor(message.id, check.step);
  const msg = h('p', { class: 'step-msg', role: 'status' });
  const el = h('div', { class: 'step-approval-box' }, stateLine(a, level));
  const mine = a?.requestedBy?.id === state.user?.id;
  if (a?.status === 'PENDING') {
    if (mine) {
      el.append(
        actionButton(t('step.approval.cancel'), 'btn-quiet', msg, key, async () => {
          await flowApi.cancel(a.id);
          return t('step.approval.cancelled');
        }),
      );
    }
    const canDecide =
      flow.can?.approve && !mine && (APPROVERS[a.level] ?? []).includes(state.user?.role);
    if (canDecide) el.append(decideControls(a, msg, key));
  } else if (!isValid(a) && flow.can?.recordSteps) {
    el.append(requestControls(message, check, level, msg, key));
  }
  el.append(msg);
  return { el, valid: isValid(a) };
}
