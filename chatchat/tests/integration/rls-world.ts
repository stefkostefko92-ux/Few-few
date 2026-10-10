import { randomBytes } from 'node:crypto';
import { db } from './helpers.js';

/**
 * Засяване за тестовете на RLS: клиент с ПО ЕДИН (поне) ред във ВСЯКА таблица с данни на клиент —
 * като собственика (без RLS), с минималните задължителни полета. Тестът за изолация обикаля
 * таблиците от каталога на базата и пада, ако някоя няма ред тук (нова таблица = нов ред тук + нова
 * политика в миграция). Само фикстури — никакви реални данни.
 */

const hex = (n = 16) => randomBytes(n).toString('hex');

export interface SeededTenant {
  tenantId: string;
  userId: string;
  caseId: string;
  conversationId: string;
}

export async function seedEveryTable(slug: string): Promise<SeededTenant> {
  const tenant = await db.tenant.create({ data: { slug, name: `RLS ${slug}` } });
  const tenantId = tenant.id;
  const company = await db.company.create({ data: { tenantId, name: `Ditta ${slug}` } });
  const user = await db.user.create({
    data: {
      tenantId,
      email: `rls-${slug}-${hex(4)}@example.test`,
      name: 'Utente RLS',
      role: 'SUPPORT',
      kind: 'INTERNAL',
      passwordHash: 'x',
    },
  });
  const portal = await db.user.create({
    data: {
      tenantId,
      companyId: company.id,
      email: `rls-portal-${slug}-${hex(4)}@example.test`,
      name: 'Tecnico RLS',
      role: 'PORTAL_TECHNICIAN',
      kind: 'PORTAL',
      passwordHash: 'x',
    },
  });
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: hex(),
      csrfToken: hex(),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  await db.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash: hex(),
      expiresAt: new Date(Date.now() + 3_600_000),
      createdById: user.id,
    },
  });
  await db.userPresence.create({ data: { userId: user.id } });
  await db.notificationSettings.create({ data: { userId: user.id, tenantId } });

  // Продукт, табло, знание.
  const product = await db.product.create({
    data: { tenantId, family: 'LTX', model: `LTX-${slug}` },
  });
  const revision = await db.productRevision.create({
    data: { productId: product.id, hwRevision: 'A', fwMin: '1.0' },
  });
  const device = await db.device.create({
    data: { tenantId, serial: `SN-${slug}`, productRevisionId: revision.id, firmware: '1.0' },
  });
  const document = await db.document.create({
    data: {
      tenantId,
      code: `DOC-${slug}`,
      title: 'Manuale',
      type: 'MANUAL',
      language: 'it',
      revision: 'A',
      status: 'PUBLISHED',
      sourceFilename: 'm.pdf',
      checksum: hex(32),
      effectiveFrom: new Date(Date.now() - 86_400_000),
      uploadedById: user.id,
    },
  });
  await db.documentApplicability.create({
    data: { documentId: document.id, productId: product.id, allFirmware: true },
  });
  const chunk = await db.documentChunk.create({
    data: { documentId: document.id, tenantId, ordinal: 0, page: 1, text: 'Testo di prova E01' },
  });
  const error = await db.errorCode.create({
    data: {
      tenantId,
      productId: product.id,
      code: 'E01',
      title: 'Errore',
      description: 'Descrizione',
      severity: 'FAULT',
      sourceDocumentId: document.id,
    },
  });
  await db.errorRelation.create({
    data: { errorId: error.id, kind: 'CHECK', ordinal: 1, text: 'Controllare' },
  });
  const snapshot = await db.knowledgeSnapshot.create({
    data: { id: hex(32), tenantId, manifest: [] },
  });

  // Случай, AI отговор, тикет, стъпки.
  const kase = await db.case.create({
    data: {
      tenantId,
      number: `CASE-RLS-${slug}-${hex(3)}`,
      companyId: company.id,
      deviceId: device.id,
      context: {},
      createdById: portal.id,
    },
  });
  const message = await db.caseMessage.create({
    data: {
      caseId: kase.id,
      kind: 'AI',
      body: 'Risposta',
      knowledgeSnapshotId: snapshot.id,
      promptVersion: 'test',
    },
  });
  await db.caseEvidence.create({
    data: { caseId: kase.id, messageId: message.id, documentId: document.id, chunkId: chunk.id },
  });
  await db.caseTimelineEvent.create({ data: { caseId: kase.id, type: 'case.created' } });
  const feedback = await db.feedback.create({
    data: { messageId: message.id, userId: portal.id, rating: 'NOT_USEFUL' },
  });
  const ticket = await db.ticket.create({
    data: {
      caseId: kase.id,
      number: `TCK-RLS-${slug}-${hex(3)}`,
      reason: 'Escalation',
      summary: {},
      createdById: user.id,
    },
  });
  const event = await db.ticketEvent.create({
    data: { tenantId, ticketId: ticket.id, caseId: kase.id, type: 'ticket.created' },
  });
  await db.ticketInfoRequest.create({
    data: { ticketId: ticket.id, items: ['foto'], requestedById: user.id },
  });
  await db.caseHandoff.create({
    data: {
      tenantId,
      caseId: kase.id,
      ticketId: ticket.id,
      direction: 'TO_OPERATOR',
      reason: 'Aiuto',
      fromUserId: portal.id,
    },
  });
  await db.stepApprovalPolicy.create({ data: { tenantId } });
  const approval = await db.stepApproval.create({
    data: {
      tenantId,
      caseId: kase.id,
      messageId: message.id,
      step: 1,
      stepHash: hex(32),
      actionClass: 'SAFETY_RELEVANT',
      gateVersion: 'test',
      level: 'SUPPORT',
      requestedById: portal.id,
    },
  });
  await db.caseStepExecution.create({
    data: {
      tenantId,
      caseId: kase.id,
      messageId: message.id,
      step: 1,
      stepHash: hex(32),
      actionClass: 'DIAGNOSTIC',
      gateVersion: 'test',
      result: 'OK',
      approvalId: approval.id,
      authorId: portal.id,
    },
  });
  await db.knowledgeProposal.create({
    data: {
      tenantId,
      source: 'FEEDBACK',
      caseId: kase.id,
      messageId: message.id,
      feedbackId: feedback.id,
    },
  });
  await db.auditEvent.create({
    data: { tenantId, actorId: user.id, action: 'rls.seed', prevHash: hex(32), hash: hex(32) },
  });

  // Файлове, приемане.
  const attachment = await db.attachment.create({
    data: {
      tenantId,
      caseId: kase.id,
      uploadedById: portal.id,
      kind: 'PHOTO',
      mime: 'image/png',
      sizeBytes: 1,
      sha256: hex(32),
      objectKey: `rls/${slug}/${hex()}`,
      originalName: 'foto.png',
    },
  });
  const batch = await db.ingestBatch.create({
    data: { tenantId, createdById: user.id, defaults: {} },
  });
  await db.ingestItem.create({
    data: {
      tenantId,
      batchId: batch.id,
      attachmentId: attachment.id,
      fileName: 'm.pdf',
      meta: {},
      documentId: document.id,
    },
  });

  // Единен вход.
  const sso = await db.ssoConfig.create({
    data: {
      tenantId,
      scopeKey: 'internal',
      provider: 'OIDC',
      issuer: `https://idp.example.test/${slug}`,
      clientId: 'client',
      clientSecretEnc: 'v1.x.y',
    },
  });
  const domain = `${slug}-${hex(3)}.example.test`;
  await db.ssoDomain.create({
    data: { tenantId, configId: sso.id, domain, verifiedDomain: domain, verifiedAt: new Date() },
  });
  await db.externalIdentity.create({
    data: {
      tenantId,
      userId: user.id,
      configId: sso.id,
      issuer: sso.issuer,
      externalSubject: hex(),
    },
  });
  await db.ssoLoginState.create({
    data: {
      tenantId,
      configId: sso.id,
      stateHash: hex(),
      bindingHash: hex(),
      purpose: 'login',
      expiresAt: new Date(Date.now() + 600_000),
    },
  });

  // Работното пространство.
  await db.savedFilter.create({
    data: { tenantId, userId: user.id, scope: 'CASES', name: 'Aperti', filter: {} },
  });
  const conversation = await db.conversation.create({
    data: { tenantId, type: 'GROUP', createdById: user.id },
  });
  await db.conversationMember.create({
    data: { conversationId: conversation.id, userId: user.id, role: 'OWNER' },
  });
  const cmsg = await db.conversationMessage.create({
    data: { conversationId: conversation.id, senderId: user.id, body: 'Ciao' },
  });
  await db.messageReaction.create({
    data: { messageId: cmsg.id, userId: user.id, reaction: 'ok' },
  });
  await db.messageMark.create({
    data: { messageId: cmsg.id, userId: user.id, kind: 'TODO', tenantId },
  });
  await db.quickResponse.create({
    data: {
      tenantId,
      shortcut: '/ciao',
      locale: 'it',
      title: 'Saluto',
      body: 'Buongiorno',
      roleScope: ['SUPPORT'],
      createdById: user.id,
    },
  });
  const notification = await db.notification.create({
    data: {
      tenantId,
      userId: user.id,
      eventType: 'message',
      objectType: 'conversation',
      objectId: conversation.id,
    },
  });
  await db.emailOutbox.create({
    data: {
      tenantId,
      userId: user.id,
      kind: 'MESSAGE',
      notificationId: notification.id,
      dedupeKey: hex(),
      status: 'SENT',
    },
  });

  // Helpdesk.
  const integration = await db.helpdeskIntegration.create({
    data: { tenantId, kind: 'WEBHOOK', inboundId: hex() },
  });
  await db.helpdeskDelivery.create({
    data: {
      tenantId,
      integrationId: integration.id,
      ticketId: ticket.id,
      eventId: event.id,
      eventType: event.type,
      seq: 1,
      status: 'DELIVERED',
    },
  });
  await db.helpdeskLink.create({
    data: { ticketId: ticket.id, integrationId: integration.id, externalId: hex(4) },
  });
  await db.helpdeskInboundReceipt.create({
    data: { integrationId: integration.id, nonce: hex() },
  });

  return { tenantId, userId: user.id, caseId: kase.id, conversationId: conversation.id };
}

/** Глобалната таблица (без клиент): контролна точка на одитната верига. */
export async function seedGlobal(): Promise<void> {
  await db.auditCheckpoint.create({
    data: {
      throughId: 0,
      throughHash: hex(32),
      fromHash: hex(32),
      count: 0,
      firstAt: new Date(),
      lastAt: new Date(),
    },
  });
}
