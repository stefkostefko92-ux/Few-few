'use server';

// The logo of the client who commissioned an installation, for the title block of its drawing sets: uploaded on the
// project (PNG or JPEG by the magic bytes, at most 300 KB, as the company's), kept as a new row every time so that the
// sets issued with an older one keep it; removed by unlinking it. Only on an installation of the user's company that
// is not archived.
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { idSchema } from '@/lib/schemas';
import { LOGO_MAX_BYTES, readLogo } from '@/lib/logo';

export type ClientLogoResult = { ok: true } | { ok: false; error: string };

async function editor(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user && !user.mustChangePassword && can(user, 'projects:edit') ? user : null;
}

export async function uploadClientLogoAction(fd: FormData): Promise<ClientLogoResult> {
  const user = await editor();
  if (!user) return { ok: false, error: 'forbidden' };
  if (!rateLimit(`logo:${user.id}`, 20, 60 * 60 * 1000)) return { ok: false, error: 'rateLimited' };
  const id = idSchema.safeParse(fd.get('projectId')), file = fd.get('logo');
  if (!id.success || !(file instanceof File) || file.size === 0) return { ok: false, error: 'invalidFields' };
  if (file.size > LOGO_MAX_BYTES) return { ok: false, error: 'logoTooLarge' };
  const bytes = new Uint8Array(await file.arrayBuffer()), info = readLogo(bytes);
  if (!info) return { ok: false, error: 'logoInvalid' };
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const logo = await prisma.$transaction(async (tx) => {
    const p = await tx.project.findFirst({ where: { id: id.data, companyId: user.companyId, archivedAt: null }, select: { id: true } });
    if (!p) return null;
    const l = await tx.clientLogo.create({
      data: { companyId: user.companyId, projectId: p.id, mime: info.mime, data: Buffer.from(bytes), sha256, width: info.width, height: info.height },
      select: { id: true },
    });
    await tx.project.update({ where: { id: p.id }, data: { clientLogoId: l.id } });
    return l;
  });
  if (!logo) return { ok: false, error: 'notFound' };
  await audit({ companyId: user.companyId, userId: user.id, action: 'CLIENT_LOGO_UPLOADED', entity: 'Project', entityId: id.data, meta: { logoId: logo.id, sha256 } });
  return { ok: true };
}

export async function removeClientLogoAction(projectId: unknown): Promise<ClientLogoResult> {
  const user = await editor();
  if (!user) return { ok: false, error: 'forbidden' };
  const id = idSchema.safeParse(projectId);
  if (!id.success) return { ok: false, error: 'invalidFields' };
  // the logo rows stay: the sets issued with them keep drawing them
  const res = await prisma.project.updateMany({ where: { id: id.data, companyId: user.companyId, archivedAt: null }, data: { clientLogoId: null } });
  if (res.count !== 1) return { ok: false, error: 'notFound' };
  await audit({ companyId: user.companyId, userId: user.id, action: 'CLIENT_LOGO_REMOVED', entity: 'Project', entityId: id.data });
  return { ok: true };
}
