import { Prisma, type PrismaClient, type Case } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { can, coversAudiences } from '../auth/rbac.js';
import type { Audience } from '../retrieval/types.js';
import type { Principal } from '../auth/sessions.js';
import { DiagnosticContextSchema, type DiagnosticContext } from '../domain/context.js';
import type { DiagnosticAnswer } from '../domain/response.js';
import { stepsForSummary } from './steps/summary.js';

/**
 * Достъп до случаи (§12.4): техниците (портал и вътрешни) виждат своите и възложените им;
 * поддръжка/инженеринг/знание/админ на клиента — всички случаи на клиента. Чуждият случай
 * е „няма такъв“ (404), не „забранено“ — не издаваме, че съществува.
 */
export function caseWhereFor(p: Principal): Prisma.CaseWhereInput {
  const base: Prisma.CaseWhereInput = { tenantId: p.user.tenantId };
  if (can(p.user.role, 'case:readAll')) return base;
  return { ...base, OR: [{ createdById: p.user.id }, { assignedToId: p.user.id }] };
}

export async function findCaseFor(
  db: PrismaClient,
  p: Principal,
  caseId: string,
): Promise<Case | null> {
  return db.case.findFirst({ where: { AND: [{ id: caseId }, caseWhereFor(p)] } });
}

/**
 * Променя случая (контекст, изход) само участник — създателят или поелият го оператор.
 * `case:readAll` е право за ЧЕТЕНЕ (триаж, одит), не за затваряне на чужд случай.
 */
export function isParticipant(
  p: Principal,
  c: Pick<Case, 'createdById' | 'assignedToId'>,
): boolean {
  return c.createdById === p.user.id || c.assignedToId === p.user.id;
}

export function contextOf(c: Pick<Case, 'context'>): DiagnosticContext {
  return DiagnosticContextSchema.parse(c.context);
}

/** „CASE-2026-004821“ / „TS-2026-004821“ — повтор при съвпадение на уникалния индекс. */
export function humanNumber(prefix: 'CASE' | 'TS', now = new Date()): string {
  return `${prefix}-${now.getUTCFullYear()}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
}

/**
 * Нарушен уникален индекс, който (може би) включва полето `field` (P2002). Под RLS PostgreSQL НЕ връща
 * подробността на нарушението (ключът би издал ред, който ролята не вижда), затова Prisma не знае
 * полетата (`target` е null) — тогава отговорът е „възможно“: викащият ПОТВЪРЖДАВА с четене
 * (съществуващия ред, повтора) и при липса хвърля, никога не решава на сляпо.
 */
export function isUniqueOn(err: unknown, field: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  const target = (err.meta as { target?: unknown } | undefined)?.target;
  if (target === null || target === undefined) return true;
  return JSON.stringify(target).includes(field);
}

export async function withUniqueRetry<T>(create: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 1; ; i += 1) {
    try {
      return await create();
    } catch (err) {
      if (!isUniqueOn(err, 'number') || i >= attempts) throw err;
    }
  }
}

type Db = PrismaClient | Prisma.TransactionClient;

/** Единната хронология (AC-19): кой (човек/AI/система), какво, кога. */
export async function addTimeline(
  db: Db,
  caseId: string,
  type: string,
  actorId: string | null,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await db.caseTimelineEvent.create({
    data: { caseId, type, actorId, payload: payload as Prisma.InputJsonValue },
  });
}

/**
 * Обобщението на тикета се сглобява от СЪРВЪРА от записаното в случая (AC-08, AC-14): контекст,
 * проверките, които AI е предложил, ИЗПЪЛНЕНИТЕ стъпки с резултатите и разрешенията (§11.2),
 * консултираните източници, решенията на Safety Gate и липсващите данни — техникът не въвежда
 * нищо повторно.
 */
export async function buildTicketSummary(db: Db, c: Case, readerAudiences: readonly Audience[]) {
  // Само отговорите, които авторът на тикета вижда — обобщението не разширява достъпа.
  const aiMessages = (
    await db.caseMessage.findMany({
      where: { caseId: c.id, kind: 'AI' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        payload: true,
        knowledgeSnapshotId: true,
        createdAt: true,
        audiences: true,
      },
    })
  ).filter((m) => coversAudiences(readerAudiences, m.audiences));
  const humanCount = await db.caseMessage.count({ where: { caseId: c.id, kind: 'HUMAN' } });
  const answers = aiMessages
    .map((m) => ({ id: m.id, at: m.createdAt, answer: m.payload as DiagnosticAnswer | null }))
    .filter((m): m is { id: string; at: Date; answer: DiagnosticAnswer } => m.answer !== null);
  const sources = new Map<string, { documentCode: string; revision: string; pages: number[] }>();
  for (const { answer } of answers) {
    for (const e of answer.evidence) {
      const key = `${e.documentCode}@${e.revision}`;
      const entry = sources.get(key) ?? {
        documentCode: e.documentCode,
        revision: e.revision,
        pages: [],
      };
      if (e.page !== null && !entry.pages.includes(e.page)) entry.pages.push(e.page);
      sources.set(key, entry);
    }
  }
  const last = answers.at(-1)?.answer ?? null;
  // AC-14: прикачените файлове (само CLEAN, привързани към съобщение на случая) — само описание;
  // байтовете се свалят през подписан адрес с повторна проверка на достъпа.
  const attachments = await db.attachment.findMany({
    where: {
      tenantId: c.tenantId,
      caseId: c.id,
      caseMessageId: { not: null },
      scanStatus: 'CLEAN',
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, kind: true, mime: true, originalName: true },
  });
  const steps = await stepsForSummary(db, c.id, aiMessages);
  return {
    caseNumber: c.number,
    context: contextOf(c),
    humanMessages: humanCount,
    aiAnswers: answers.length,
    lastAnswer: last
      ? {
          // AI Act чл. 50(2): генерираното от AI е маркирано и в тикета.
          generatedBy: 'ai' as const,
          promptVersion: last.promptVersion,
          status: last.status,
          confidence: last.confidence,
          summary: last.summary,
          checks: last.checks.map((k) => ({
            step: k.step,
            action: k.action,
            expected: k.expected,
            actionClass: k.actionClass,
            requiresConfirmation: k.requiresConfirmation,
          })),
          safety: last.safety,
          missingData: last.missingData,
          gateDecisions: last.gate.decisions,
        }
      : null,
    sources: [...sources.values()],
    attachments,
    executedSteps: steps.executedSteps,
    approvals: steps.approvals,
    knowledgeSnapshots: [...new Set(aiMessages.map((m) => m.knowledgeSnapshotId).filter(Boolean))],
  };
}
