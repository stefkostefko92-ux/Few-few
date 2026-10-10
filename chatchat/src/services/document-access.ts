import { webcrypto } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { audiencesFor, can } from '../auth/rbac.js';
import type { Principal } from '../auth/sessions.js';
import type { AttachmentDeps } from './attachments.js';

/**
 * Достъп до документ и до оригиналния му PDF за визуализатора (§9.2). ЕДНО място за правилата —
 * текстът на страницата, метаданните и байтовете на PDF минават през `visibleDocument`, същите
 * като филтрите на AI (`store/knowledge.ts`): само своя клиент, само аудиторията на ролята
 * (портален човек → само PORTAL), само PUBLISHED; чернова — само за kb:manage.
 */

const DOCUMENT_SELECT = {
  id: true,
  tenantId: true,
  code: true,
  title: true,
  revision: true,
  type: true,
  status: true,
  audience: true,
  language: true,
  checksum: true,
} as const;

export async function visibleDocument(
  db: PrismaClient,
  p: Principal,
  documentId: string,
  /** Чернова — само за kb:manage и само за оригинала (рецензия на схемата преди публикуване). */
  opts: { drafts?: boolean } = {},
) {
  return db.document.findFirst({
    where: {
      id: documentId,
      tenantId: p.user.tenantId,
      audience: { in: [...audiencesFor(p.user.role)] },
      ...(opts.drafts && can(p.user.role, 'kb:manage') ? {} : { status: 'PUBLISHED' }),
    },
    select: DOCUMENT_SELECT,
  });
}

export type VisibleDocument = NonNullable<Awaited<ReturnType<typeof visibleDocument>>>;

/**
 * Оригиналът е прикаченият PDF, чийто sha256 е checksum-ът на документа (§7.2: при приемане от PDF
 * checksum = sha256 на оригинала). Ретенцията пази точно тези файлове. Документ, въведен като
 * JSON, няма оригинал → null (визуализаторът показва текста).
 */
export async function sourceAttachment(db: PrismaClient, doc: VisibleDocument) {
  return db.attachment.findFirst({
    where: {
      tenantId: doc.tenantId,
      kind: 'DOCUMENT',
      mime: 'application/pdf',
      scanStatus: 'CLEAN',
      sha256: doc.checksum,
    },
    select: { id: true, objectKey: true, sizeBytes: true, sha256: true },
  });
}

/** Байтовете на оригинала; ако sha256 не съвпада с checksum-а — няма оригинал (целост, §7.2). */
export async function readSourcePdf(
  attachments: AttachmentDeps,
  a: { objectKey: string; sha256: string },
): Promise<Buffer | null> {
  const bytes = await attachments.store.get(a.objectKey);
  if (!bytes) return null;
  // Хешът — асинхронно (webcrypto, пулът от нишки), не в главната нишка: PDF до 50 MB иначе
  // държи event loop-а ~130 ms на всеки преглед. Без копие на буфера.
  const digest = Buffer.from(await webcrypto.subtle.digest('SHA-256', bytes)).toString('hex');
  return digest === a.sha256 ? bytes : null;
}
