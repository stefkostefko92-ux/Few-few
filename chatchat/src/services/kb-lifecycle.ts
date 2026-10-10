import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { auditReason } from './users.js';

/**
 * Жизненият цикъл на знанието (§4.1, §11.3, FR-04, FR-11) — общото за документите и кодовете:
 *   DRAFT → REVIEW → PUBLISHED → DEPRECATED → (възстановяване) REVIEW → PUBLISHED …
 * Решение на собственика: публикуваното е НЕИЗМЕНИМО и се пази завинаги — само преходи на
 * статуса; отписването е изрично действие с причина и е обратимо; нова ревизия НЕ отписва
 * старата сама. Четирите очи (§11.3): нещо, свързано с безопасността, не се публикува от човек,
 * който го е подготвил (качил/създал, редактирал, пратил за преглед, възстановил).
 */

/** Причина на действие (отписване, възстановяване): в одита, маскирана от лични данни. */
export const Reason = z.string().trim().min(3).max(500);

/** Тялото на отписване/възстановяване — само причината. */
export const ReasonBody = z.object({ reason: Reason }).strict();
/** Отхвърляне при преглед — причината е по избор. */
export const OptionalReasonBody = z.object({ reason: Reason.optional() }).strict();

/** Причината за одита: маскирана и с таван (никога суровият текст). */
export const reasonForAudit = (reason: string | undefined): string | undefined =>
  auditReason(reason);

/**
 * Отхвърлено при преглед: никога публикуваното се връща в чернова за поправка; вече публикувано
 * (възстановено и върнато) — обратно в DEPRECATED, защото е неизменимо.
 */
export function rejectTarget(everPublished: boolean): 'DRAFT' | 'DEPRECATED' {
  return everPublished ? 'DEPRECATED' : 'DRAFT';
}

/** Принципът на четирите очи: публикуващият не е сред подготвилите. */
export function fourEyesBlocked(
  actorId: string,
  preparers: ReadonlyArray<string | null | undefined>,
): boolean {
  return preparers.some((id) => id === actorId);
}

/** Добавя човека към авторите на версията (без повторения, подредено — стабилно за одита). */
export function withAuthor(authorIds: readonly string[], userId: string): string[] {
  return [...new Set([...authorIds, userId])].sort();
}

/** Код за грешка, свързан с безопасността: флагът му или проверка/действие по безопасност. */
export function errorIsSafetyRelevant(e: {
  safetyRelevant: boolean;
  relations: ReadonlyArray<{ actionClass: string }>;
}): boolean {
  return (
    e.safetyRelevant ||
    e.relations.some(
      (r) => r.actionClass === 'SAFETY_RELEVANT' || r.actionClass === 'DIRECT_COMMAND',
    )
  );
}

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Публикуваните кодове, чийто източник е документът — при отписването му AI вече не ги вижда
 * (източникът не е PUBLISHED). Не се местят тихо в REVIEW: връщат се на отговорника и личат в
 * списъка с кодове; при възстановяване на документа се връщат сами.
 */
export async function errorsSourcedBy(
  db: Db,
  tenantId: string,
  documentId: string,
): Promise<Array<{ id: string; code: string; version: number }>> {
  return db.errorCode.findMany({
    where: { tenantId, sourceDocumentId: documentId, status: 'PUBLISHED' },
    select: { id: true, code: true, version: true },
    orderBy: [{ code: 'asc' }, { version: 'asc' }],
  });
}

export interface HistoryEntry {
  action: string;
  at: Date;
  actor: { id: string; name: string } | null;
  reason: string | null;
}

/**
 * Историята на един обект на знанието — от одита (веригата е неизменима): само действията
 * `kb.<вид>.*` по ТОЗИ обект в клиента; причината е вече маскирана при записа.
 */
export async function knowledgeHistory(
  db: PrismaClient,
  tenantId: string,
  objectType: 'document' | 'error',
  objectId: string,
): Promise<HistoryEntry[]> {
  const events = await db.auditEvent.findMany({
    where: { tenantId, objectType, objectId, action: { startsWith: `kb.${objectType}.` } },
    orderBy: { id: 'asc' },
    take: 200,
    select: { action: true, at: true, actorId: true, detail: true },
  });
  const actorIds = [...new Set(events.map((e) => e.actorId).filter((x): x is string => !!x))];
  const names = new Map(
    (
      await db.user.findMany({
        where: { id: { in: actorIds }, tenantId },
        select: { id: true, name: true },
      })
    ).map((u) => [u.id, u.name]),
  );
  return events.map((e) => {
    const detail = e.detail;
    const reason =
      detail !== null && typeof detail === 'object' && !Array.isArray(detail)
        ? (detail as Record<string, unknown>).reason
        : undefined;
    return {
      action: e.action,
      at: e.at,
      actor: e.actorId ? { id: e.actorId, name: names.get(e.actorId) ?? '' } : null,
      reason: typeof reason === 'string' ? reason : null,
    };
  });
}
