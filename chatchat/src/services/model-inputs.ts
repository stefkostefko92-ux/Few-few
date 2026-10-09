import type { PrismaClient } from '@prisma/client';
import {
  NO_ATTACHMENTS,
  prepareAttachments,
  type ModelAttachments,
  type StoredAttachment,
} from '../ai/attachments.js';
import type { AttachmentStore } from '../storage/attachments.js';

/**
 * Файловете, които техникът е привързал към ТОВА съобщение (§9.2): само CLEAN PHOTO/LOG от същия
 * клиент, вързани в транзакцията на съобщението (`bindToMessage` вече провери случай, автор и
 * антивирус). Никога файлове от по-стари съобщения, документи за базата знания или разговори.
 * Без хранилище (прикачените файлове са изключени) → нищо не се праща, с код защо.
 */
export async function loadModelAttachments(
  db: PrismaClient,
  store: AttachmentStore | null,
  tenantId: string,
  messageId: string,
): Promise<ModelAttachments> {
  const rows = await db.attachment.findMany({
    where: {
      tenantId,
      caseMessageId: messageId,
      scanStatus: 'CLEAN',
      kind: { in: ['PHOTO', 'LOG'] },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, kind: true, objectKey: true },
  });
  if (rows.length === 0) return NO_ATTACHMENTS;
  const files: StoredAttachment[] = [];
  for (const r of rows) {
    const kind = r.kind === 'PHOTO' ? 'PHOTO' : 'LOG';
    files.push({ id: r.id, kind, bytes: store ? await store.get(r.objectKey) : null });
  }
  return prepareAttachments(files);
}
