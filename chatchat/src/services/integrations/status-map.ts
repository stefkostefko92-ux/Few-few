import type { TicketStatus } from '@prisma/client';
import { nextTicketStatus } from '../tickets/flow.js';

/**
 * Мапването на статусите между ChatChat и helpdesk-а. Към helpdesk-а — само статусът (Zendesk:
 * new/open/pending/solved; JSM — коментар, защото преходите са по workflow на клиента). Обратно —
 * само „затвори“ и „отвори наново“, и то през машината на преходите (`nextTicketStatus`): каквото тя
 * не позволява (напр. затваряне на неподет тикет), се пропуска с код, без промяна.
 */

export type ZendeskStatus = 'new' | 'open' | 'pending' | 'hold' | 'solved' | 'closed';

/** Zendesk не приема връщане към „new“ след създаване — отвореният тикет е „open“. */
export function zendeskStatusFor(status: TicketStatus, creating: boolean): ZendeskStatus {
  switch (status) {
    case 'OPEN':
      return creating ? 'new' : 'open';
    case 'ASSIGNED':
    case 'IN_PROGRESS':
      return 'open';
    case 'WAITING':
      return 'pending';
    case 'CLOSED':
      return 'solved';
  }
}

export type InboundAction = 'close' | 'reopen';

/** Zendesk → ChatChat: решен/затворен → затваряне; отворен/нов → повторно отваряне. */
export function actionFromZendesk(status: string): InboundAction | null {
  const s = status.trim().toLowerCase();
  if (s === 'solved' || s === 'closed') return 'close';
  if (s === 'open' || s === 'new') return 'reopen';
  return null;
}

/** Jira/JSM по категорията на статуса (new · indeterminate · done). */
export function actionFromJira(categoryKey: string): InboundAction | null {
  const s = categoryKey.trim().toLowerCase();
  if (s === 'done') return 'close';
  if (s === 'new' || s === 'indeterminate') return 'reopen';
  return null;
}

export type InboundTransition =
  | { apply: true; to: TicketStatus }
  | { apply: false; reason: 'already_closed' | 'not_closed' | 'invalid_transition' };

/** Какво става с тикета при входящото действие — само по машината на преходите. */
export function inboundTransition(
  action: InboundAction,
  current: TicketStatus,
  hasOwner: boolean,
): InboundTransition {
  if (action === 'close' && current === 'CLOSED') return { apply: false, reason: 'already_closed' };
  if (action === 'reopen' && current !== 'CLOSED') return { apply: false, reason: 'not_closed' };
  const to = nextTicketStatus(action, current, hasOwner);
  return to ? { apply: true, to } : { apply: false, reason: 'invalid_transition' };
}
