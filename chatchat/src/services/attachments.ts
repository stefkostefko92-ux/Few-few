import type { Attachment, AttachmentKind, Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { Logger } from 'pino';
import { appendAudit } from '../audit.js';
import { can } from '../auth/rbac.js';
import type { Principal } from '../auth/sessions.js';
import type { Scanner, ScanVerdict } from '../storage/antivirus.js';
import { newObjectKey, type AttachmentStore } from '../storage/attachments.js';
import { findCaseFor } from './cases.js';
import { detectMime, MAX_BYTES, sanitizeFileName } from './filetype.js';

/**
 * Прикачени файлове (FR-06, §7.3 т. 1–3, §13.3): разпознаване по съдържание → таван по вид →
 * sha256 → ред PENDING → запис в частното хранилище → антивирус → CLEAN/INFECTED/FAILED.
 * Само CLEAN се показва, сваля и привързва към съобщение; INFECTED/FAILED файлът се трие веднага,
 * остава редът (с одит), докато ретенцията не го махне. Към AI отиват само PHOTO/LOG, изрично
 * привързани към въпрос (`services/model-inputs.ts`), никога DOCUMENT като файл.
 */

export interface AttachmentDeps {
  store: AttachmentStore;
  /** null → без антивирус качването е изключено (503 av_unavailable), fail-closed. */
  scanner: Scanner | null;
  /** HMAC ключ за подписаните адреси (ATTACHMENT_URL_KEY). */
  urlKey: string;
}

export function attachmentView(a: Attachment) {
  return {
    id: a.id,
    kind: a.kind,
    mime: a.mime,
    sizeBytes: a.sizeBytes,
    originalName: a.originalName,
    scanStatus: a.scanStatus,
    createdAt: a.createdAt,
  };
}

export interface UploadInput {
  tenantId: string;
  userId: string;
  kind: AttachmentKind;
  caseId: string | null;
  name: string | undefined;
  bytes: Buffer;
}

export type UploadOutcome =
  | { ok: true; attachment: Attachment; verdict: ScanVerdict }
  | { ok: false; status: 400 | 413 | 415; code: string };

export async function acceptUpload(
  db: PrismaClient,
  deps: { store: AttachmentStore; scanner: Scanner; logger: Logger },
  input: UploadInput,
): Promise<UploadOutcome> {
  const { bytes, kind } = input;
  if (bytes.length === 0) return { ok: false, status: 400, code: 'invalid_input' };
  if (bytes.length > MAX_BYTES[kind]) return { ok: false, status: 413, code: 'payload_too_large' };
  const mime = detectMime(kind, bytes);
  if (!mime) return { ok: false, status: 415, code: 'unsupported_type' };

  const objectKey = newObjectKey(input.tenantId);
  // Редът е ПРЕДИ файла: срив по средата оставя PENDING ред, който ретенцията чисти, а не
  // файл без ред, за който никой не знае.
  const row = await db.attachment.create({
    data: {
      tenantId: input.tenantId,
      caseId: input.caseId,
      uploadedById: input.userId,
      kind,
      mime,
      sizeBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      objectKey,
      originalName: sanitizeFileName(input.name),
    },
  });
  try {
    await deps.store.put(objectKey, bytes);
  } catch (err) {
    await db.attachment.update({ where: { id: row.id }, data: { scanStatus: 'FAILED' } });
    throw err;
  }

  // Скенерът по договор не хвърля; ако все пак го направи — FAILED, никога CLEAN.
  const verdict = await deps.scanner
    .scan(bytes)
    .catch((): ScanVerdict => ({ status: 'FAILED', reason: 'bad_response' }));
  const attachment = await db.attachment.update({
    where: { id: row.id },
    data: { scanStatus: verdict.status, scannedAt: new Date() },
  });
  if (verdict.status !== 'CLEAN') await deps.store.delete(objectKey);
  if (verdict.status === 'FAILED') {
    deps.logger.warn({ attachmentId: row.id, reason: verdict.reason }, 'антивирусът не потвърди');
  }

  // Одит: само идентификатори, вид, размер и статус — името може да носи лични данни.
  const audit = { tenantId: input.tenantId, actorId: input.userId, objectType: 'attachment' };
  await appendAudit(db, {
    ...audit,
    action: 'attachment.upload',
    objectId: row.id,
    detail: { kind, sizeBytes: bytes.length, scanStatus: verdict.status, caseId: input.caseId },
  });
  if (verdict.status === 'INFECTED') {
    await appendAudit(db, {
      ...audit,
      action: 'attachment.infected',
      objectId: row.id,
      detail: { kind, sizeBytes: bytes.length, signature: verdict.signature },
    });
  }
  return { ok: true, attachment, verdict };
}

/**
 * Може ли човекът да види файла — проверява се при всяко издаване на адрес И при всяко сваляне
 * (§13.3 „ricontrollare l'autorizzazione“). Само CLEAN; документ за базата знания — само
 * kb:manage; файл от случай — с достъп до случая (findCaseFor), а още непривързан — само качилият.
 * Файловете на разговори в работното пространство имат свое правило (тук — не).
 */
export async function canReadAttachment(
  db: PrismaClient,
  p: Principal,
  a: Attachment,
): Promise<boolean> {
  if (a.tenantId !== p.user.tenantId || a.scanStatus !== 'CLEAN') return false;
  if (a.kind === 'DOCUMENT') return can(p.user.role, 'kb:manage');
  if (a.caseId === null) return false;
  if (a.caseMessageId === null && a.uploadedById !== p.user.id) return false;
  return (await findCaseFor(db, p, a.caseId)) !== null;
}

/**
 * Привързва файловете към човешкото съобщение в СЪЩАТА транзакция: само CLEAN, от същия случай,
 * качени от същия човек, още непривързани. Частично съвпадение → false (транзакцията се отменя).
 * Условието е в UPDATE-а — паралелно привързване на същия файл минава само веднъж.
 */
export async function bindToMessage(
  tx: Prisma.TransactionClient,
  ids: readonly string[],
  where: { tenantId: string; caseId: string; userId: string; messageId: string },
): Promise<boolean> {
  if (ids.length === 0) return true;
  const result = await tx.attachment.updateMany({
    where: {
      id: { in: [...ids] },
      tenantId: where.tenantId,
      caseId: where.caseId,
      uploadedById: where.userId,
      scanStatus: 'CLEAN',
      caseMessageId: null,
      conversationMessageId: null,
    },
    data: { caseMessageId: where.messageId },
  });
  return result.count === ids.length;
}

export interface MessageAttachment {
  id: string;
  kind: AttachmentKind;
  mime: string;
  originalName: string;
}

/** Файловете към съобщенията на случая (само CLEAN), по id на съобщение. */
export async function attachmentsByMessage(
  db: PrismaClient,
  tenantId: string,
  messageIds: readonly string[],
): Promise<Map<string, MessageAttachment[]>> {
  const rows = await db.attachment.findMany({
    where: { tenantId, caseMessageId: { in: [...messageIds] }, scanStatus: 'CLEAN' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, kind: true, mime: true, originalName: true, caseMessageId: true },
  });
  const byMessage = new Map<string, MessageAttachment[]>();
  for (const { caseMessageId, ...a } of rows) {
    if (!caseMessageId) continue;
    const list = byMessage.get(caseMessageId) ?? [];
    list.push(a);
    byMessage.set(caseMessageId, list);
  }
  return byMessage;
}

/** Content-Disposition с ASCII резерва и RFC 5987 името (без кавички и обратни наклонени). */
export function contentDisposition(type: 'inline' | 'attachment', name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]|["\\%]/g, '_');
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
