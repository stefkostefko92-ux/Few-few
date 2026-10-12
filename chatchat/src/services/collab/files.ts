import type { Attachment, Prisma, PrismaClient } from '@prisma/client';
import { loadConversationFor, type Viewer } from './access.js';
import type { CollabDeps } from './publish.js';

/**
 * Прикачени файлове в разговорите (§12.1 „Allegati chat“, §14.1 POST …/messages „allegato“).
 * Качването е общият поток (services/attachments.ts: магически байтове, антивирус, частно
 * хранилище); тук са правилата на разговора:
 * - привързване: само CLEAN, качени от СЪЩИЯ човек за СЪЩИЯ разговор, още непривързани — в
 *   транзакцията на съобщението (условието е в UPDATE-а: паралелно привързване минава веднъж);
 * - достъп = достъпът до разговора (`loadConversationFor`), проверен при всеки адрес И при всяко
 *   сваляне; непривързан файл — само качилият; файл на изтрито съобщение — никой;
 * - изтрито съобщение → файлът (първо) и редът се махат. Към AI файловете от разговори не отиват.
 */

export const MAX_FILES_PER_MESSAGE = 5;

export async function bindConversationFiles(
  tx: Prisma.TransactionClient,
  ids: readonly string[],
  where: { tenantId: string; conversationId: string; userId: string; messageId: string },
): Promise<boolean> {
  if (ids.length === 0) return true;
  if (ids.length > MAX_FILES_PER_MESSAGE) return false;
  const result = await tx.attachment.updateMany({
    where: {
      id: { in: [...ids] },
      tenantId: where.tenantId,
      conversationId: where.conversationId,
      uploadedById: where.userId,
      scanStatus: 'CLEAN',
      caseId: null,
      caseMessageId: null,
      conversationMessageId: null,
    },
    data: { conversationMessageId: where.messageId },
  });
  return result.count === ids.length;
}

/** Може ли зрителят да види файла от разговор — при издаване на адрес и при сваляне. */
export async function canReadConversationFile(
  db: PrismaClient,
  viewer: Viewer,
  a: Pick<Attachment, 'conversationId' | 'conversationMessageId' | 'uploadedById' | 'tenantId'>,
): Promise<boolean> {
  if (a.conversationId === null || a.tenantId !== viewer.tenantId) return false;
  const loaded = await loadConversationFor(db, viewer, a.conversationId);
  if (!loaded) return false;
  if (a.conversationMessageId === null) return a.uploadedById === viewer.id;
  const message = await db.conversationMessage.findFirst({
    where: { id: a.conversationMessageId, conversationId: a.conversationId },
    select: { deletedAt: true },
  });
  return message !== null && message.deletedAt === null;
}

/**
 * Файловете на съобщенията: първо от хранилището, после редовете (ред без файл е безвреден, файл
 * без ред е забравен завинаги). Без хранилище — нищо (ретенцията ги довършва). Грешка при
 * триене на файл — редът остава за следващия опит; отговорът на човека не пада.
 */
export async function purgeMessageFiles(
  deps: Pick<CollabDeps, 'db' | 'logger' | 'attachments'>,
  messageIds: readonly string[],
): Promise<number> {
  const store = deps.attachments?.store;
  if (!store || messageIds.length === 0) return 0;
  const files = await deps.db.attachment.findMany({
    where: { conversationMessageId: { in: [...messageIds] } },
    select: { id: true, objectKey: true },
  });
  let purged = 0;
  for (const f of files) {
    try {
      await store.delete(f.objectKey);
      await deps.db.attachment.delete({ where: { id: f.id } });
      purged += 1;
    } catch (err) {
      deps.logger.warn(
        { attachmentId: f.id, errName: err instanceof Error ? err.name : 'unknown' },
        'файлът на изтрито съобщение остава за ретенцията',
      );
    }
  }
  return purged;
}
