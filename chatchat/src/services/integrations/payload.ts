import type { PrismaClient, TicketQueue, TicketStatus } from '@prisma/client';
import { caseAudiences } from '../../auth/rbac.js';
import { redactPii } from '../../domain/pii.js';
import { buildTicketSummary, contextOf } from '../cases.js';

/**
 * Какво излиза към helpdesk-а (GDPR чл. 5(1)(c), §15.2 „minimizzare i dati personali nei ticket e
 * negli allegati“) — САМО тези полета, сглобени от сървъра:
 *   ticket      номер, статус, опашка, създаден/затворен (без причината — свободен текст на човека)
 *   case        номер + връзка обратно към ChatChat (`/#case=<id>`, отваря се с вход и права)
 *   board       модел, ревизия HW, фърмуер, сериен номер, код за грешка, фаза (без симптоми/наблюдения)
 *   diagnosis   последният AI отговор СЛЕД Safety Gate: статус, увереност, резюме, ниво на безопасност,
 *               предложените проверки (действие, очакван резултат, клас), липсващи данни — маркиран като AI
 *   executedSteps  стъпка, действие, резултат, клас (без бележки и без кой я е изпълнил)
 *   sources     код на документа, ревизия, страници
 *   attachments само БРОЙ + връзката към случая — никога файл, име на файл или съдържание
 *   resolution  първопричина, решение, източници (при затваряне)
 * НИКОГА: имена, имейли, телефони, id на хора, роли на конкретни хора извън „възложен на роля“,
 * съобщения от разговора, бележки, прикачени файлове. Всеки свободен текст минава отново през
 * `redactPii` (вече маскиран при запис) и е отрязан до таван. Резюмето е с аудиториите на
 * поддръжката (портален случай — само PORTAL): инженерните отговори не напускат ChatChat.
 */

export const EXTERNAL_PAYLOAD_VERSION = 1;

const MAX_TEXT = 2000;
const MAX_ITEMS = 30;

export const clip = (text: string, max = MAX_TEXT): string => {
  const masked = redactPii(text).trim();
  return masked.length > max ? `${masked.slice(0, max - 1)}…` : masked;
};

export interface ExternalTicket {
  version: typeof EXTERNAL_PAYLOAD_VERSION;
  ticket: {
    number: string;
    status: TicketStatus;
    queue: TicketQueue;
    createdAt: string;
    closedAt: string | null;
  };
  case: { number: string; link: string };
  board: {
    productModel: string;
    hardwareRevision: string | null;
    firmware: string | null;
    serial: string | null;
    errorCode: string | null;
    phase: string;
  };
  diagnosis: {
    generatedBy: 'ai';
    status: string;
    confidence: string;
    summary: string;
    safetyLevel: string;
    checks: Array<{ step: number; action: string; expected: string; actionClass: string }>;
    missingData: string[];
  } | null;
  executedSteps: Array<{
    step: number;
    action: string | null;
    result: string;
    actionClass: string;
  }>;
  sources: Array<{ documentCode: string; revision: string; pages: number[] }>;
  attachments: { count: number; link: string };
  resolution: {
    rootCause: string | null;
    solution: string | null;
    via: string;
    sources: Array<{ documentCode: string; revision: string }>;
  } | null;
}

interface StoredResolution {
  rootCause?: unknown;
  solution?: unknown;
  via?: unknown;
  sources?: unknown;
}

function resolutionOf(raw: unknown): ExternalTicket['resolution'] {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as StoredResolution;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? clip(v) : null);
  const sources = Array.isArray(r.sources)
    ? r.sources.flatMap((s: unknown) => {
        if (typeof s !== 'object' || s === null) return [];
        const { documentCode, revision } = s as Record<string, unknown>;
        return typeof documentCode === 'string' && typeof revision === 'string'
          ? [{ documentCode, revision }]
          : [];
      })
    : [];
  return {
    rootCause: text(r.rootCause),
    solution: text(r.solution),
    via: typeof r.via === 'string' ? r.via : 'ticket',
    sources: sources.slice(0, MAX_ITEMS),
  };
}

/** Минимизираният тикет за външната система — null, ако тикетът/случаят вече ги няма. */
export async function buildExternalTicket(
  db: PrismaClient,
  ticketId: string,
  baseUrl: string,
): Promise<ExternalTicket | null> {
  const ticket = await db.ticket.findUnique({ where: { id: ticketId }, include: { case: true } });
  if (!ticket) return null;
  const c = ticket.case;
  const summary = await buildTicketSummary(db, c, caseAudiences('SUPPORT', c.portal));
  const ctx = contextOf(c);
  const link = `${baseUrl.replace(/\/+$/, '')}/#case=${encodeURIComponent(c.id)}`;
  const last = summary.lastAnswer;
  return {
    version: EXTERNAL_PAYLOAD_VERSION,
    ticket: {
      number: ticket.number,
      status: ticket.status,
      queue: ticket.queue,
      createdAt: ticket.createdAt.toISOString(),
      closedAt: ticket.closedAt?.toISOString() ?? null,
    },
    case: { number: c.number, link },
    board: {
      productModel: ctx.productModel,
      hardwareRevision: ctx.hardwareRevision,
      firmware: ctx.firmware,
      serial: ctx.serial,
      errorCode: ctx.errorCode,
      phase: ctx.phase,
    },
    diagnosis: last
      ? {
          generatedBy: 'ai',
          status: last.status,
          confidence: last.confidence,
          summary: clip(last.summary),
          safetyLevel: last.safety.level,
          checks: last.checks.slice(0, MAX_ITEMS).map((k) => ({
            step: k.step,
            action: clip(k.action, 500),
            expected: clip(k.expected, 500),
            actionClass: k.actionClass,
          })),
          missingData: last.missingData.slice(0, MAX_ITEMS).map((m) => clip(m, 200)),
        }
      : null,
    executedSteps: summary.executedSteps.slice(0, 100).map((s) => ({
      step: s.step,
      action: s.action ? clip(s.action, 500) : null,
      result: s.result,
      actionClass: s.actionClass,
    })),
    sources: summary.sources.slice(0, MAX_ITEMS).map((s) => ({
      documentCode: s.documentCode,
      revision: s.revision,
      pages: s.pages.slice(0, 50),
    })),
    attachments: { count: summary.attachments.length, link },
    resolution: ticket.status === 'CLOSED' ? resolutionOf(ticket.resolution) : null,
  };
}
