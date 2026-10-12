// Състоянието на работния поток за ОТВОРЕНИЯ случай: тикет, изпълнени стъпки, разрешения,
// политика и какво човекът може (от сървъра). Пълни се от GET /cases/:id; опреснява се след
// действие или събитие в реално време (case.updated / step.updated) — винаги през REST.

import { emit, state } from '../store.js';
import { flowApi } from './api.js';

const EMPTY_STEPS = { executions: [], approvals: [] };

/** Записва частта за потока от отговора на GET /cases/:id. */
export function setFlow(caseId, data) {
  state.flow = {
    caseId,
    ticket: data?.ticket ?? null,
    steps: data?.steps ?? EMPTY_STEPS,
    policy: data?.stepPolicy ?? { safetyRelevant: 'SUPPORT', configurative: 'NONE' },
    can: data?.can ?? {},
  };
  if (data?.ticket) state.tickets.set(caseId, data.ticket);
}

export const currentFlow = () =>
  state.flow && state.flow.caseId === state.currentId ? state.flow : null;

/** Нивото на разрешение за стъпката — огледало на сървъра (той решава): NONE/SELF/SUPPORT/ENGINEERING. */
export function levelFor(check, policy) {
  if (check.actionClass === 'DIRECT_COMMAND') return 'BLOCKED';
  if (check.actionClass === 'SAFETY_RELEVANT' || check.requiresConfirmation) {
    return policy?.safetyRelevant ?? 'SUPPORT';
  }
  if (check.actionClass === 'CONFIGURATIVE') return policy?.configurative ?? 'NONE';
  return 'NONE';
}

export function executionsFor(messageId, step) {
  const f = currentFlow();
  return (f?.steps.executions ?? []).filter((e) => e.messageId === messageId && e.step === step);
}

/** Последната заявка за разрешение (без оттеглените). */
export function approvalFor(messageId, step) {
  const f = currentFlow();
  const list = (f?.steps.approvals ?? []).filter(
    (a) => a.messageId === messageId && a.step === step && a.status !== 'CANCELLED',
  );
  return list.at(-1) ?? null;
}

/** Само стъпките — след отбелязване/разрешение (по-леко от целия случай). */
export async function reloadSteps() {
  const f = currentFlow();
  if (!f) return;
  const caseId = f.caseId;
  const steps = await flowApi.steps(caseId);
  if (state.currentId !== caseId || !state.flow) return;
  state.flow.steps = steps;
  emit('flow:steps');
}

/** Целият случай (статус, тикет, съобщения) — след промяна по тикета или ново съобщение. */
export async function reloadCase() {
  const caseId = state.currentId;
  if (!caseId) return;
  const data = await flowApi.caseView(caseId);
  if (state.currentId !== caseId || !state.current) return;
  const before = state.current.messages.length;
  state.current.case = data.case;
  state.current.messages = Array.isArray(data.messages) ? data.messages : state.current.messages;
  setFlow(caseId, data);
  emit('flow:case', { messagesChanged: state.current.messages.length !== before });
}
