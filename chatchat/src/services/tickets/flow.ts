import type { CaseStatus, TicketStatus } from '@prisma/client';

/**
 * Машината на преходите на тикета (FR-09, FR-19) — чиста, без база. Липсващ ключ = действието не
 * е позволено от този статус (409 `invalid_transition`). Случаят следва тикета (`caseStatusFor`):
 * чака оператор → в работа → чака данни от техника → решен.
 *
 *   OPEN ──claim──▶ IN_PROGRESS ──request_info──▶ WAITING ──info_provided──▶ IN_PROGRESS
 *    │  ╲assign▶ ASSIGNED ─claim─▶ IN_PROGRESS            ╲close▶ CLOSED ─reopen─▶ OPEN/ASSIGNED
 *    └◀──────── escalate (към Engineering: обратно в опашката, без отговорник) ◀───────┘
 */

export type TicketAction =
  | 'claim'
  | 'assign'
  | 'request_info'
  | 'info_provided'
  | 'escalate'
  | 'return_to_ai'
  | 'close'
  | 'reopen'
  | 'handoff';

const OPEN_STATES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING'] as const;

// prettier-ignore
export const TICKET_TRANSITIONS: Record<TicketAction, Partial<Record<TicketStatus, TicketStatus>>> =
  {
    // Поемане = започва работа; в чакане на данни остава в чакане.
    claim: { OPEN: 'IN_PROGRESS', ASSIGNED: 'IN_PROGRESS', IN_PROGRESS: 'IN_PROGRESS', WAITING: 'WAITING' },
    // Назначаване/прехвърляне на друг: той още не е започнал.
    assign: { OPEN: 'ASSIGNED', ASSIGNED: 'ASSIGNED', IN_PROGRESS: 'ASSIGNED', WAITING: 'WAITING' },
    request_info: { ASSIGNED: 'WAITING', IN_PROGRESS: 'WAITING' },
    info_provided: { WAITING: 'IN_PROGRESS' },
    // Към Engineering: обратно в опашката (на инженеринга), без отговорник.
    escalate: { OPEN: 'OPEN', ASSIGNED: 'OPEN', IN_PROGRESS: 'OPEN', WAITING: 'OPEN' },
    // „Върни към AI“ не сменя статуса — операторът остава отговорен.
    return_to_ai: { ASSIGNED: 'ASSIGNED', IN_PROGRESS: 'IN_PROGRESS', WAITING: 'WAITING' },
    close: { ASSIGNED: 'CLOSED', IN_PROGRESS: 'CLOSED', WAITING: 'CLOSED' },
    reopen: { CLOSED: 'OPEN' },
    // Техникът предава на оператор: открит тикет остава както е; затворен се отваря отново.
    handoff: { OPEN: 'OPEN', ASSIGNED: 'ASSIGNED', IN_PROGRESS: 'IN_PROGRESS', WAITING: 'WAITING', CLOSED: 'OPEN' },
  };

/**
 * Следващият статус или null (не е позволено). Отворен наново тикет с отговорник е „назначен“,
 * не „отворен“ — отговорникът го вижда в „моите“.
 */
export function nextTicketStatus(
  action: TicketAction,
  from: TicketStatus,
  hasOwner: boolean,
): TicketStatus | null {
  const to = TICKET_TRANSITIONS[action][from] ?? null;
  if (to === 'OPEN' && from === 'CLOSED' && hasOwner) return 'ASSIGNED';
  return to;
}

export function isOpenTicket(status: TicketStatus): boolean {
  return (OPEN_STATES as readonly string[]).includes(status);
}

/** Статусът на случая според тикета (§12.4): случаят следва тикета, докато тикетът е отворен. */
export function caseStatusFor(ticket: TicketStatus): CaseStatus {
  switch (ticket) {
    case 'OPEN':
      return 'WAITING_TECHNICIAN';
    case 'ASSIGNED':
    case 'IN_PROGRESS':
      return 'IN_PROGRESS';
    case 'WAITING':
      return 'WAITING_CUSTOMER';
    case 'CLOSED':
      return 'RESOLVED';
  }
}
