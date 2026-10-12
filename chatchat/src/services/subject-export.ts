import type { PrismaClient } from '@prisma/client';

/**
 * Достъп/преносимост (GDPR чл. 15/20): JSON с профила, метаданните на сесиите (без токени) и
 * написаното от човека — съобщения, тикети, обратна връзка, работния поток, предложенията към
 * знанието и връзката с доставчика на единния вход. Изтриването е в `subject.ts`.
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
  const [flow, knowledge] = await Promise.all([
    exportFlow(db, tenantId, userId),
    exportKnowledgeAndSso(db, tenantId, userId),
  ]);
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
    ...knowledge,
    notificationSettings,
    messageMarks,
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
 * Предложенията към знанието (FR-10), които човекът е направил или решил (текстът е маскиран), и
 * връзката с доставчика на единния вход (issuer + oid/sub — идентификатор на човека).
 */
async function exportKnowledgeAndSso(db: PrismaClient, tenantId: string, userId: string) {
  const [knowledgeProposals, knowledgeDecisions, ssoIdentity] = await Promise.all([
    db.knowledgeProposal.findMany({
      where: { tenantId, createdById: userId },
      select: {
        id: true,
        source: true,
        status: true,
        rating: true,
        comment: true,
        caseId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_ROWS,
    }),
    db.knowledgeProposal.findMany({
      where: { tenantId, decidedById: userId },
      select: { id: true, status: true, rejectReason: true, decidedAt: true },
      orderBy: { decidedAt: 'asc' },
      take: MAX_ROWS,
    }),
    db.externalIdentity.findFirst({
      where: { tenantId, userId },
      select: { issuer: true, externalSubject: true, createdAt: true, lastLoginAt: true },
    }),
  ]);
  return { knowledgeProposals, knowledgeDecisions, ssoIdentity };
}
