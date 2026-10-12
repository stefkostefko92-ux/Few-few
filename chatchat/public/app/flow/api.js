// REST към работния поток (FR-09, FR-19, §11.2): стъпки, разрешения, предаване, тикет, опашка.
// Тънки обвивки — сървърът проверява всяко действие; UI само крие бутони, които той би отказал.

import { api } from '../api.js';
import { errorText } from '../errors.js';
import { has, t } from '../i18n.js';

const id = encodeURIComponent;

export const flowApi = {
  caseView: (caseId) => api('GET', `/cases/${id(caseId)}`),
  steps: (caseId) => api('GET', `/cases/${id(caseId)}/steps`),
  execute: (caseId, body) => api('POST', `/cases/${id(caseId)}/steps`, body),
  requestApproval: (caseId, body) => api('POST', `/cases/${id(caseId)}/steps/approvals`, body),
  decide: (approvalId, decision, reason) =>
    api('POST', `/approvals/${id(approvalId)}/decide`, { decision, reason }),
  cancel: (approvalId) => api('POST', `/approvals/${id(approvalId)}/cancel`, {}),
  pendingApprovals: () => api('GET', '/approvals'),
  handoff: (caseId, message) => api('POST', `/cases/${id(caseId)}/handoff`, { message }),
  ticket: (ticketId) => api('GET', `/tickets/${id(ticketId)}`),
  act: (ticketId, action, body = {}) => api('POST', `/tickets/${id(ticketId)}/${action}`, body),
  queue: (params) => api('GET', `/tickets?${new URLSearchParams(params)}`),
  assignees: (q) => api('GET', `/tickets/assignees?q=${id(q ?? '')}`),
};

/** Преведената грешка: първо кодовете на потока (step.err.* / ticket.err.*), после общите. */
export function flowError(err) {
  const code = err?.code;
  if (code) {
    for (const prefix of ['step.err.', 'ticket.err.']) {
      if (has(`${prefix}${code}`)) return t(`${prefix}${code}`);
    }
  }
  return errorText(err);
}
