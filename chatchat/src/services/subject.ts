import type { PrismaClient, User } from '@prisma/client';
import { appendAudit } from '../audit.js';
import { revokeUserSessions, type SessionRevocation } from '../auth/sessions.js';
import type { AttachmentStore } from '../storage/attachments.js';
import { auditReason, ERASED_NAME, erasedEmail, unusablePasswordHash } from './users.js';

/**
 * Права на субекта на данните (GDPR чл. 15/17/20; правният одит, т. 8).
 *
 * Достъп/преносимост: JSON с профила, метаданните на сесиите (без токени) и написаното от човека.
 * Изтриване: анонимизация на акаунта, не изтриване на реда — техническото съдържание на случаите
 * (диагнози, проверки, тикети) е данни на клиента и остава, а авторът му е псевдонимен id без
 * име и имейл. Одитната верига не се пипа: изтрит или променен ред я чупи (SECURITY.md).
 * Файловете, качени от човека в лични разговори (директни, групи, канали — не в дискусия по
 * случай, която е техническо доказателство на клиента), се изтриват: файлът първо, после редът.
 */

const MAX_ROWS = 10_000;

export async function exportSubject(db: PrismaClient, tenantId: string, userId: string) {
  const user = await db.user.findFirst({
    where: { id: userId, tenantId },
    include: { company: { select: { id: true, name: true } } },
  });
  if (!user) return null;
  const [
    sessions,
    caseMessages,
    cases,
    tickets,
    feedback,
    conversationMessages,
    memberships,
    attachments,
    notifications,
    presence,
    savedFilters,
    notificationSettings,
    messageMarks,
  ] = await Promise.all([
    db.session.findMany({
      where: { userId },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        lastSeenAt: true,
        revokedAt: true,
        mfaPassed: true,
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_ROWS,
    }),
    db.caseMessage.findMany({
      where: { authorId: userId, kind: 'HUMAN', case: { tenantId } },
      select: {
        id: true,
        caseId: true,
        body: true,
        createdAt: true,
        case: { select: { number: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_ROWS,
    }),
    db.case.findMany({
      where: { createdById: userId, tenantId },
      select: {
        id: true,
        number: true,
        status: true,
        outcome: true,
        createdAt: true,
        closedAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_ROWS,
    }),
    db.ticket.findMany({
      where: { createdById: userId, case: { tenantId } },
      select: {
        id: true,
        number: true,
        status: true,
        reason: true,
        createdAt: true,
        case: { select: { number: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_ROWS,
    }),
    db.feedback.findMany({
      where: { userId },
      select: { id: true, messageId: true, rating: true, comment: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: MAX_ROWS,
    }),
    db.conversationMessage.findMany({
      where: { senderId: userId, conversation: { tenantId } },
      select: {
        id: true,
        conversationId: true,
        body: true,
        createdAt: true,
        editedAt: true,
        deletedAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_ROWS,
    }),
    db.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true, role: true, joinedAt: true, notificationPref: true },
      take: MAX_ROWS,
    }),
    db.attachment.findMany({
      where: { uploadedById: userId, tenantId },
      select: {
        id: true,
        kind: true,
        mime: true,
        sizeBytes: true,
        originalName: true,
        caseId: true,
        conversationId: true,
        createdAt: true,
      },
      take: MAX_ROWS,
    }),
    db.notification.findMany({
      where: { userId },
      select: {
        eventType: true,
        objectType: true,
        objectId: true,
        createdAt: true,
        readAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_ROWS,
    }),
    db.userPresence.findUnique({
      where: { userId },
      select: { status: true, lastSeenAt: true, showLastSeen: true },
    }),
    db.savedFilter.findMany({
      where: { userId },
      select: { id: true, scope: true, name: true, filter: true, shared: true, createdAt: true },
    }),
    db.notificationSettings.findUnique({
      where: { userId },
      select: {
        emailEnabled: true,
        digest: true,
        quietStart: true,
        quietEnd: true,
        timeZone: true,
        updatedAt: true,
      },
    }),
    db.messageMark.findMany({
      where: { userId, tenantId },
      select: { messageId: true, kind: true, createdAt: true },
      take: MAX_ROWS,
    }),
  ]);
  const flow = await exportFlow(db, tenantId, userId);
  return {
    format: 'chatchat.subject-export.v1',
    exportedAt: new Date(),
    profile: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      kind: user.kind,
      company: user.company,
      locale: user.locale,
      active: user.active,
      expiresAt: user.expiresAt,
      lastLoginAt: user.lastLoginAt,
      mfaEnabledAt: user.totpEnabledAt,
      passwordChangedAt: user.passwordChangedAt,
      deactivatedAt: user.deactivatedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    sessions,
    caseMessages: caseMessages.map(({ case: c, ...m }) => ({ ...m, caseNumber: c.number })),
    casesCreated: cases,
    tickets: tickets.map(({ case: c, ...t }) => ({ ...t, caseNumber: c.number })),
    feedback,
    conversationMessages,
    conversationMemberships: memberships,
    attachments,
    notifications,
    presence,
    savedFilters,
    ...flow,
    notificationSettings,
    messageMarks,
  };
}

/** Личните файлове на човека в разговори (не в дискусия по случай) — за изтриване по чл. 17. */
function personalFilesWhere(tenantId: string, userId: string) {
  return {
    tenantId,
    uploadedById: userId,
    conversationId: { not: null },
    conversation: { type: { not: 'CASE' as const } },
  };
}

/**
 * Написаното от човека в работния поток (FR-09, FR-19, §11.2): бележки към изпълнени стъпки,
 * заявки и решения по разрешения (с причините), предавания и заявки за данни.
 */
async function exportFlow(db: PrismaClient, tenantId: string, userId: string) {
  const [stepExecutions, stepApprovals, handoffs, infoRequests] = await Promise.all([
    db.caseStepExecution.findMany({
      where: { authorId: userId, tenantId },
      select: { id: true, caseId: true, step: true, result: true, note: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: MAX_ROWS,
    }),
    db.stepApproval.findMany({
      where: { tenantId, OR: [{ requestedById: userId }, { decidedById: userId }] },
      select: {
        id: true,
        caseId: true,
        step: true,
        status: true,
        requestedById: true,
        requestNote: true,
        decidedById: true,
        decisionReason: true,
        createdAt: true,
        decidedAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_ROWS,
    }),
    db.caseHandoff.findMany({
      where: { fromUserId: userId, tenantId },
      select: { id: true, caseId: true, direction: true, reason: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: MAX_ROWS,
    }),
    db.ticketInfoRequest.findMany({
      where: { requestedById: userId, ticket: { case: { tenantId } } },
      select: { id: true, ticketId: true, items: true, note: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: MAX_ROWS,
    }),
  ]);
  return { stepExecutions, stepApprovals, handoffs, infoRequests };
}

/**
 * Анонимизация (чл. 17): име „Utente rimosso“, имейл `erased-<id>@invalid`, парола, която никой
 * не знае, деактивиран, без втори фактор и без последен вход; сесиите се отнемат и изтриват,
 * известията, присъствието, запазените филтри и линковете за парола — изтрити. Всичко в една
 * транзакция с одита; куките за realtime потоците се викат от викащия след commit.
 */
export async function eraseSubject(
  db: PrismaClient,
  actor: { id: string; tenantId: string },
  target: User,
  reason: string,
  store: AttachmentStore | null = null,
): Promise<SessionRevocation> {
  const passwordHash = await unusablePasswordHash();
  const now = new Date();
  // Файловете — ПРЕДИ редовете и извън транзакцията (хранилището не е транзакционно). Без
  // хранилище редовете остават (fail-closed: ред без файл не се губи), броят им е в одита.
  const files = await db.attachment.findMany({
    where: personalFilesWhere(target.tenantId, target.id),
    select: { id: true, objectKey: true },
  });
  if (store) for (const f of files) await store.delete(f.objectKey);
  return db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: {
        name: ERASED_NAME,
        email: erasedEmail(target.id),
        passwordHash,
        active: false,
        deactivatedAt: target.deactivatedAt ?? now,
        totpSecretEnc: null,
        totpEnabledAt: null,
        lastLoginAt: null,
      },
    });
    const revocation = await revokeUserSessions(tx, [target.id], 'erased');
    await tx.session.deleteMany({ where: { userId: target.id } });
    await tx.passwordReset.deleteMany({ where: { userId: target.id } });
    const notifications = await tx.notification.deleteMany({ where: { userId: target.id } });
    await tx.userPresence.deleteMany({ where: { userId: target.id } });
    const filters = await tx.savedFilter.deleteMany({ where: { userId: target.id } });
    await tx.notificationSettings.deleteMany({ where: { userId: target.id } });
    await tx.messageMark.deleteMany({ where: { userId: target.id } });
    await tx.emailOutbox.deleteMany({ where: { userId: target.id } });
    const erasedFiles = store
      ? (await tx.attachment.deleteMany({ where: { id: { in: files.map((f) => f.id) } } })).count
      : 0;
    await appendAudit(tx, {
      tenantId: actor.tenantId,
      actorId: actor.id,
      action: 'user.erase',
      objectType: 'user',
      objectId: target.id,
      detail: {
        reason: auditReason(reason),
        revokedSessions: revocation.count,
        notifications: notifications.count,
        savedFilters: filters.count,
        files: erasedFiles,
        filesKept: files.length - erasedFiles,
      },
    });
    return revocation;
  });
}
