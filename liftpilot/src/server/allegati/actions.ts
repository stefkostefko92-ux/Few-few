'use server';

// The changes to an uploaded file (round 49, plan §6.1): its title, kind and section — the only columns the database lets
// change (trigger attachment_guard) — and its deletion, refused while an issued relazione tecnica lists it (the foreign
// key of TechnicalReportAttachment, checked at the DELETE here rather than at the commit). Only whoever edits the
// installation's data ('projects:edit'), only on an installation of the company that is not archived; the activity log
// names the file by id and SHA-256, never by its name. The deletion's transaction is quota.ts removeAttachment.
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { idSchema } from '@/lib/schemas';
import { editSchema } from '@/lib/allegati/kinds';
import { ALLEGATI_LIMITS } from '@/lib/allegati/limits';
import { removeAttachment } from './quota';

export type AttachmentActionError = 'forbidden' | 'rateLimited' | 'invalidFields' | 'notFound' | 'archived' | 'attachmentInUse';
export type AttachmentActionResult = { ok: true } | { ok: false; error: AttachmentActionError };

type Checked<T> = { ok: true; value: T } | { ok: false; error: AttachmentActionError };

async function editor(): Promise<Checked<SessionUser>> {
  const user = await getSessionUser();
  if (!user || user.mustChangePassword || !can(user, 'projects:edit')) return { ok: false, error: 'forbidden' };
  if (!rateLimit(`allegati-edit:${user.id}`, ALLEGATI_LIMITS.editsPer10Min, 10 * 60 * 1000)) return { ok: false, error: 'rateLimited' };
  return { ok: true, value: user };
}

/** The file of the user's company with its installation's state, or why not. */
async function ownFile(user: SessionUser, id: string): Promise<Checked<{ id: string; sha256: string }>> {
  const f = await prisma.attachment.findFirst({
    where: { id, companyId: user.companyId },
    select: { id: true, sha256: true, project: { select: { archivedAt: true } } },
  });
  if (!f) return { ok: false, error: 'notFound' };
  if (f.project.archivedAt) return { ok: false, error: 'archived' };
  return { ok: true, value: { id: f.id, sha256: f.sha256 } };
}

export async function updateAttachmentAction(input: unknown): Promise<AttachmentActionResult> {
  const me = await editor();
  if (!me.ok) return me;
  const user = me.value;
  const v = editSchema.safeParse(input);
  if (!v.success) return { ok: false, error: 'invalidFields' };
  const own = await ownFile(user, v.data.id);
  if (!own.ok) return own;
  const file = own.value;
  // only the three editable columns: any other change is refused by the database
  await prisma.attachment.update({ where: { id: file.id }, data: { title: v.data.title, kind: v.data.kind, component: v.data.component ?? null } });
  await audit({ companyId: user.companyId, userId: user.id, action: 'ATTACHMENT_EDITED', entity: 'Attachment', entityId: file.id, meta: { attachmentId: file.id } });
  return { ok: true };
}

export async function deleteAttachmentAction(id: unknown): Promise<AttachmentActionResult> {
  const me = await editor();
  if (!me.ok) return me;
  const user = me.value;
  const v = idSchema.safeParse(id);
  if (!v.success) return { ok: false, error: 'invalidFields' };
  const own = await ownFile(user, v.data);
  if (!own.ok) return own;
  const file = own.value;
  const removed = await removeAttachment(user.companyId, file.id);
  if (removed !== 'deleted') return { ok: false, error: removed === 'inUse' ? 'attachmentInUse' : 'notFound' };
  await audit({ companyId: user.companyId, userId: user.id, action: 'ATTACHMENT_DELETED', entity: 'Attachment', entityId: file.id, meta: { attachmentId: file.id, sha256: file.sha256 } });
  return { ok: true };
}
