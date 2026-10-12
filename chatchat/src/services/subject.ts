import type { PrismaClient, User } from '@prisma/client';
import { appendAudit } from '../audit.js';
import { revokeUserSessions, type SessionRevocation } from '../auth/sessions.js';
import type { AttachmentStore } from '../storage/attachments.js';
import { auditReason, ERASED_NAME, erasedEmail, unusablePasswordHash } from './users.js';

/**
 * Права на субекта на данните (GDPR чл. 15/17/20; правният одит, т. 8).
 *
 * Достъп/преносимост — `subject-export.ts` (JSON с профила, сесиите без токени и написаното).
 * Изтриване: анонимизация на акаунта, не изтриване на реда — техническото съдържание на случаите
 * (диагнози, проверки, тикети) е данни на клиента и остава, а авторът му е псевдонимен id без
 * име и имейл. Одитната верига не се пипа: изтрит или променен ред я чупи (SECURITY.md).
 * Файловете, качени от човека в лични разговори (директни, групи, канали — не в дискусия по
 * случай, която е техническо доказателство на клиента), се изтриват: файлът първо, после редът.
 */

export { exportSubject } from './subject-export.js';

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
    // Връзката с доставчика на единния вход (issuer + oid/sub) е идентификатор на човека.
    await tx.externalIdentity.deleteMany({ where: { userId: target.id } });
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
