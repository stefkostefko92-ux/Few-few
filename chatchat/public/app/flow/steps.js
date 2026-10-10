// Изпълнените стъпки и човешкото потвърждение в самия отговор (§11.2, FR-09). Под всяка
// проверка: последният резултат, разрешението (ако стъпката го иска) и бутоните OK / KO /
// „Non possibile“ с бележка. Големи бутони за ръкавици; смисълът е в текста и знака, не в цвета.
// Само textContent — никога innerHTML. Сървърът проверява всичко отново.

import { announce, clear, h } from '../dom.js';
import { fmtStamp } from '../format.js';
import { t } from '../i18n.js';
import { state } from '../store.js';
import { flowApi, flowError } from './api.js';
import { approvalBlock } from './approve.js';
import { personText, stepFocus } from './people.js';
import { currentFlow, executionsFor, levelFor, reloadSteps } from './state.js';

const registry = new Map(); // ключ „messageId#step“ → { box, message, check }
const RESULTS = ['OK', 'KO', 'NOT_POSSIBLE'];
const MARK = { OK: '✓', KO: '✗', NOT_POSSIBLE: '–' };

function statusLine(messageId, check) {
  const list = executionsFor(messageId, check.step);
  const last = list.at(-1);
  if (!last) return h('p', { class: 'step-status' }, t('step.notYet'));
  return h(
    'p',
    { class: `step-status step-${last.result.toLowerCase()}` },
    h('span', { class: 'step-mark', 'aria-hidden': 'true' }, MARK[last.result] ?? '•'),
    ` ${t('step.lastResult', { result: t(`step.result.${last.result}`), who: personText(last.by), when: fmtStamp(last.at) })}`,
    list.length > 1 ? ` ${t('step.attempts', { count: list.length })}` : '',
    last.note ? h('span', { class: 'step-note-text' }, ` — ${last.note}`) : null,
  );
}

function recordForm(key, message, check, gated) {
  const uid = `step-${key.replace(/[^\w-]/g, '_')}`;
  const note = h('textarea', { id: `${uid}-note`, rows: 2, maxlength: 1000 });
  const status = h('p', { class: 'step-msg', role: 'status' });
  const buttons = RESULTS.map((result) => {
    const blocked = gated && result !== 'NOT_POSSIBLE';
    return h(
      'button',
      {
        type: 'button',
        class: `btn btn-secondary btn-step btn-step-${result.toLowerCase()}`,
        disabled: blocked ? true : null,
        'aria-describedby': blocked ? `${uid}-gated` : null,
        onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          status.textContent = '';
          try {
            await flowApi.execute(state.currentId, {
              messageId: message.id,
              step: check.step,
              result,
              ...(note.value.trim() ? { note: note.value.trim() } : {}),
            });
            announce(t('step.recorded', { step: check.step, result: t(`step.result.${result}`) }));
            stepFocus.key = key;
            await reloadSteps();
          } catch (err) {
            status.textContent = flowError(err);
            btn.disabled = false;
          }
        },
      },
      h('span', { 'aria-hidden': 'true' }, `${MARK[result]} `),
      t(`step.result.${result}`),
    );
  });
  return h(
    'fieldset',
    { class: 'step-record' },
    h('legend', null, t('step.recordLegend', { step: check.step })),
    gated ? h('p', { class: 'hint', id: `${uid}-gated` }, t('step.needsApproval')) : null,
    h('div', { class: 'step-buttons' }, buttons),
    h(
      'details',
      { class: 'step-note' },
      h('summary', null, t('step.addNote')),
      h('label', { for: note.id }, t('step.noteLabel')),
      note,
    ),
    status,
  );
}

function fill(key) {
  const entry = registry.get(key);
  if (!entry) return;
  const { box, message, check } = entry;
  clear(box);
  const flow = currentFlow();
  if (!flow) return;
  const level = levelFor(check, flow.policy);
  if (level === 'BLOCKED') {
    box.append(h('p', { class: 'step-status' }, t('step.notExecutable')));
    return;
  }
  const status = statusLine(message.id, check);
  box.append(status);
  if (stepFocus.key === key) {
    stepFocus.key = null;
    status.tabIndex = -1;
    status.focus({ preventScroll: true });
  }
  let gated = false;
  if (level !== 'NONE') {
    const block = approvalBlock(message, check, level, flow);
    gated = !block.valid;
    box.append(block.el);
  }
  if (flow.can?.recordSteps) box.append(recordForm(key, message, check, gated));
}

/** Контролите под проверката в отговора (викат се от answer/checks.js). */
export function stepControls(message, check) {
  if (!message?.id || typeof check?.step !== 'number') return null;
  const key = `${message.id}#${check.step}`;
  const box = h('div', { class: 'step-ctl', 'data-step': key });
  registry.set(key, { box, message, check });
  fill(key);
  return box;
}

/** След ново състояние: всички видими контроли се попълват наново (откачените се забравят). */
export function refreshStepControls() {
  for (const [key, entry] of registry) {
    if (!entry.box.isConnected) registry.delete(key);
    else fill(key);
  }
}
