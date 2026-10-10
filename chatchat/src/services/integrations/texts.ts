import type { TicketStatus } from '@prisma/client';
import type { TicketEventType } from '../tickets/events.js';
import type { ExternalTicket } from './payload.js';
import type { ExternalLang } from './settings.js';

/**
 * Текстовете, които ChatChat пише в helpdesk-а (тема, описание, вътрешни коментари) — на езика от
 * настройката на конектора. Сглобяват се само от минимизирания тикет (payload.ts) и от кодове на
 * събитието: никакво име, имейл или свободен текст извън вече маскираното резюме/резолюция.
 */

interface Dict {
  status: Record<TicketStatus, string>;
  event: Record<TicketEventType, string>;
  role: string;
  heading: string;
  caseLabel: string;
  queue: string;
  board: string;
  hw: string;
  fw: string;
  serial: string;
  error: string;
  phase: string;
  diagnosis: string;
  checks: string;
  executed: string;
  sources: string;
  missing: string;
  attachments: string;
  open: string;
  rootCause: string;
  solution: string;
  byOutcome: string;
  byHelpdesk: string;
}

const IT: Dict = {
  status: {
    OPEN: 'Aperto',
    ASSIGNED: 'Assegnato',
    IN_PROGRESS: 'In lavorazione',
    WAITING: 'In attesa del tecnico',
    CLOSED: 'Chiuso',
  },
  event: {
    'ticket.created': 'Ticket aperto in ChatChat.',
    'ticket.claimed': 'Preso in carico.',
    'ticket.assigned': 'Assegnato.',
    'ticket.info_requested': 'Richiesti altri dati al tecnico.',
    'ticket.info_provided': 'Il tecnico ha fornito i dati richiesti.',
    'ticket.closed': 'Chiuso in ChatChat.',
    'ticket.reopened': 'Riaperto in ChatChat.',
    'handoff.to_operator': 'Il tecnico ha chiesto un operatore.',
    'handoff.to_engineering': 'Passato a Engineering.',
    'handoff.to_ai': 'L’operatore ha riattivato l’assistenza AI.',
  },
  role: 'Ruolo',
  heading: 'Ticket ChatChat',
  caseLabel: 'caso',
  queue: 'Coda',
  board: 'Quadro',
  hw: 'HW',
  fw: 'FW',
  serial: 'S/N',
  error: 'Codice errore',
  phase: 'Fase',
  diagnosis: 'Diagnosi (generata da AI, filtrata dal Safety Gate)',
  checks: 'Verifiche proposte',
  executed: 'Passi eseguiti',
  sources: 'Fonti',
  missing: 'Dati mancanti',
  attachments: 'Allegati in ChatChat',
  open: 'Apri in ChatChat',
  rootCause: 'Causa',
  solution: 'Soluzione',
  byOutcome: 'Il tecnico ha confermato il caso come risolto.',
  byHelpdesk: 'Chiuso dal helpdesk.',
};

const EN: Dict = {
  status: {
    OPEN: 'Open',
    ASSIGNED: 'Assigned',
    IN_PROGRESS: 'In progress',
    WAITING: 'Waiting for the technician',
    CLOSED: 'Closed',
  },
  event: {
    'ticket.created': 'Ticket opened in ChatChat.',
    'ticket.claimed': 'Taken in charge.',
    'ticket.assigned': 'Assigned.',
    'ticket.info_requested': 'More data requested from the technician.',
    'ticket.info_provided': 'The technician provided the requested data.',
    'ticket.closed': 'Closed in ChatChat.',
    'ticket.reopened': 'Reopened in ChatChat.',
    'handoff.to_operator': 'The technician asked for an operator.',
    'handoff.to_engineering': 'Escalated to Engineering.',
    'handoff.to_ai': 'The operator resumed AI assistance.',
  },
  role: 'Role',
  heading: 'ChatChat ticket',
  caseLabel: 'case',
  queue: 'Queue',
  board: 'Board',
  hw: 'HW',
  fw: 'FW',
  serial: 'S/N',
  error: 'Error code',
  phase: 'Phase',
  diagnosis: 'Diagnosis (AI-generated, filtered by the Safety Gate)',
  checks: 'Proposed checks',
  executed: 'Executed steps',
  sources: 'Sources',
  missing: 'Missing data',
  attachments: 'Attachments in ChatChat',
  open: 'Open in ChatChat',
  rootCause: 'Root cause',
  solution: 'Solution',
  byOutcome: 'The technician confirmed the case as resolved.',
  byHelpdesk: 'Closed by the helpdesk.',
};

const BG: Dict = {
  status: {
    OPEN: 'Отворен',
    ASSIGNED: 'Възложен',
    IN_PROGRESS: 'В работа',
    WAITING: 'Чака техника',
    CLOSED: 'Затворен',
  },
  event: {
    'ticket.created': 'Тикетът е отворен в ChatChat.',
    'ticket.claimed': 'Поет.',
    'ticket.assigned': 'Възложен.',
    'ticket.info_requested': 'Поискани са още данни от техника.',
    'ticket.info_provided': 'Техникът даде поисканите данни.',
    'ticket.closed': 'Затворен в ChatChat.',
    'ticket.reopened': 'Отворен отново в ChatChat.',
    'handoff.to_operator': 'Техникът поиска оператор.',
    'handoff.to_engineering': 'Прехвърлен към Engineering.',
    'handoff.to_ai': 'Операторът върна помощта от AI.',
  },
  role: 'Роля',
  heading: 'Тикет в ChatChat',
  caseLabel: 'случай',
  queue: 'Опашка',
  board: 'Табло',
  hw: 'HW',
  fw: 'FW',
  serial: 'S/N',
  error: 'Код за грешка',
  phase: 'Фаза',
  diagnosis: 'Диагноза (от AI, след Safety Gate)',
  checks: 'Предложени проверки',
  executed: 'Изпълнени стъпки',
  sources: 'Източници',
  missing: 'Липсващи данни',
  attachments: 'Прикачени файлове в ChatChat',
  open: 'Отвори в ChatChat',
  rootCause: 'Първопричина',
  solution: 'Решение',
  byOutcome: 'Техникът потвърди случая като решен.',
  byHelpdesk: 'Затворен от helpdesk-а.',
};

const DICTS: Record<ExternalLang, Dict> = { it: IT, en: EN, bg: BG };
const dict = (lang: ExternalLang): Dict => DICTS[lang];

export function statusLabel(lang: ExternalLang, status: TicketStatus): string {
  return dict(lang).status[status];
}

/** Темата: номер + табло + код — без нищо за хора. */
export function subjectOf(t: ExternalTicket): string {
  const parts = [`[ChatChat] ${t.ticket.number}`, t.board.productModel];
  if (t.board.errorCode) parts.push(t.board.errorCode);
  return parts.join(' · ').slice(0, 250);
}

/** Описанието на нов тикет (обикновен текст) — всичко от минимизирания тикет, нищо повече. */
export function describe(lang: ExternalLang, t: ExternalTicket, status: TicketStatus): string {
  const d = dict(lang);
  const b = t.board;
  const lines = [
    `${d.heading} ${t.ticket.number} (${d.caseLabel} ${t.case.number})`,
    `${d.status[status]} · ${d.queue}: ${t.ticket.queue}`,
    [
      `${d.board}: ${b.productModel}`,
      b.hardwareRevision ? `${d.hw} ${b.hardwareRevision}` : null,
      b.firmware ? `${d.fw} ${b.firmware}` : null,
      b.serial ? `${d.serial} ${b.serial}` : null,
      b.errorCode ? `${d.error} ${b.errorCode}` : null,
      `${d.phase}: ${b.phase}`,
    ]
      .filter(Boolean)
      .join(' · '),
  ];
  if (t.diagnosis) {
    const g = t.diagnosis;
    lines.push('', `${d.diagnosis} [${g.status} · ${g.confidence} · ${g.safetyLevel}]:`, g.summary);
    if (g.checks.length > 0) {
      lines.push('', `${d.checks}:`);
      for (const k of g.checks)
        lines.push(`${k.step}. ${k.action} → ${k.expected} [${k.actionClass}]`);
    }
    if (g.missingData.length > 0) lines.push('', `${d.missing}: ${g.missingData.join('; ')}`);
  }
  if (t.executedSteps.length > 0) {
    lines.push('', `${d.executed}:`);
    for (const s of t.executedSteps) {
      lines.push(`${s.step}. ${s.action ?? '—'} — ${s.result} [${s.actionClass}]`);
    }
  }
  if (t.sources.length > 0) {
    const src = t.sources.map(
      (s) =>
        `${s.documentCode} rev ${s.revision}${s.pages.length ? ` (p. ${s.pages.join(', ')})` : ''}`,
    );
    lines.push('', `${d.sources}: ${src.join('; ')}`);
  }
  lines.push('', `${d.attachments}: ${t.attachments.count}`, `${d.open}: ${t.case.link}`);
  return lines.join('\n');
}

/** Вътрешният коментар за събитие по вече свързан тикет. */
export function commentOf(
  lang: ExternalLang,
  type: TicketEventType,
  t: ExternalTicket,
  change: { to: TicketStatus | null; assigneeRole: string | null },
): string {
  const d = dict(lang);
  const lines = [d.event[type]];
  if (change.assigneeRole) lines.push(`${d.role}: ${change.assigneeRole}`);
  if (change.to) lines.push(`${d.status[change.to]} · ${d.queue}: ${t.ticket.queue}`);
  if (type === 'ticket.closed' && t.resolution) {
    const r = t.resolution;
    if (r.via === 'case.outcome') lines.push(d.byOutcome);
    if (r.via === 'external') lines.push(d.byHelpdesk);
    if (r.rootCause) lines.push(`${d.rootCause}: ${r.rootCause}`);
    if (r.solution) lines.push(`${d.solution}: ${r.solution}`);
    if (r.sources.length > 0) {
      lines.push(
        `${d.sources}: ${r.sources.map((s) => `${s.documentCode} rev ${s.revision}`).join('; ')}`,
      );
    }
  }
  lines.push(`${d.open}: ${t.case.link}`);
  return lines.join('\n');
}
