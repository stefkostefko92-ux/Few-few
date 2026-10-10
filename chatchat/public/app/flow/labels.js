// Текстовете на потока в хронологията (AC-19) и в Inbox: събитията `step.*`, `ticket.*`,
// `handoff.*` се превеждат с ключове под своя префикс — „ticket.claimed“ → „ticket.tl.claimed“,
// известието „step.approval_granted“ → „step.notif.approval_granted“.

import { roleLabel } from '../format.js';
import { has, t } from '../i18n.js';

// `proposal.*` — предложенията за знанието (FR-10): „proposal.created“ → „proposal.notif.created“.
const FLOW = /^(step|ticket|handoff|proposal)\.(.+)$/;

/** Ключът под префикса на потока, ако има превод; иначе null (викащият ползва своя). */
export function flowKey(type, kind) {
  const m = FLOW.exec(String(type ?? ''));
  if (!m) return null;
  const key = `${m[1]}.${kind}.${m[2]}`;
  return has(key) ? key : null;
}

/** Подробността под събитието в хронологията — само кодове и номера, никога свободен текст. */
export function flowDetail(e) {
  const p = e.payload ?? {};
  const step = typeof p.step === 'number' ? t('step.label', { step: p.step }) : '';
  switch (e.type) {
    case 'step.executed':
      return `${step}: ${has(`step.result.${p.result}`) ? t(`step.result.${p.result}`) : ''}`;
    case 'step.approval_requested':
      return `${step} · ${t(`step.level.${p.level}`)}`;
    case 'step.approval_granted':
    case 'step.approval_denied':
      return p.selfAttested
        ? `${step} · ${t('step.tl.selfAttested')}`
        : `${step} · ${p.decidedRole ? roleLabel(p.decidedRole) : ''}`;
    case 'step.approval_cancelled':
      return step;
    case 'ticket.assigned':
      return p.toRole ? roleLabel(p.toRole) : '';
    case 'ticket.info_requested':
      return t('ticket.tl.items', { count: p.items ?? 0 });
    case 'ticket.claimed':
    case 'ticket.closed':
    case 'ticket.reopened':
    case 'ticket.info_provided':
    case 'handoff.to_operator':
    case 'handoff.to_engineering':
    case 'handoff.to_ai':
      return p.to && has(`ticketstatus.${p.to}`)
        ? t('ticket.tl.status', { status: t(`ticketstatus.${p.to}`) })
        : '';
    default:
      return '';
  }
}
