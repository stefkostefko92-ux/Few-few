import 'server-only';
// Keeping an uploaded file (round 49, plan §6.1): the row and its bytes in one transaction, under the company's lock, so
// that two uploads arriving together cannot pass the limits together — at most 60 files per installation and 500 MiB
// per company (the SUM of the stored sizes). The same bytes on the same installation are one row: the existing one is
// returned (dedupe by the unique (projectId, sha256)). The installation is checked again inside: of the company, not
// archived. And removing one: refused while an issued relazione tecnica lists it. Plain functions (no session): the
// route and the actions call them after their checks; never exported from a 'use server' file.
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ALLEGATI_LIMITS } from '@/lib/allegati/limits';
import type { AllegatoKind, Componente } from '@/lib/allegati/kinds';
import { ATTACHMENT_ROW, type AttachmentRow } from './queries';

/** The advisory locks of the uploads, apart from any other lock of the application (two-key form: this, the company). */
export const UPLOAD_LOCK = 4949;

export interface NewAttachment {
  companyId: string;
  projectId: string;
  userId: string;
  kind: AllegatoKind;
  title: string;
  component: Componente | null;
  fileName: string;
  mime: string;
  data: Uint8Array<ArrayBuffer>;
  sha256: string;
  pages: number;
  width: number | null;
  height: number | null;
  orientation: number | null;
}

export type Stored =
  | { ok: true; row: AttachmentRow; duplicate: boolean }
  | { ok: false; error: 'notFound' | 'archived' | 'quotaExceeded' };

const isUniqueViolation = (e: unknown): boolean => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
/** A foreign key refused the statement (P2003; 23503 when it surfaces raw). */
const isForeignKeyViolation = (e: unknown): boolean =>
  (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') || (e instanceof Error && /\b23503\b|foreign key/i.test(e.message));

/** The row of these bytes on this installation, if it is there already. */
export const existing = (projectId: string, sha256: string, companyId: string) =>
  prisma.attachment.findFirst({ where: { projectId, sha256, companyId }, ...ATTACHMENT_ROW });

/** Stores the file within the limits (see above); the answer says whether it was there already. */
export async function storeAttachment(a: NewAttachment): Promise<Stored> {
  try {
    return await prisma.$transaction(async (tx): Promise<Stored> => {
      // every upload of the company waits here for the one before it to commit: the counts below see its row (executeRaw:
      // the function returns void, which a query's result cannot carry)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${UPLOAD_LOCK}::int, hashtext(${a.companyId}))`;
      const project = await tx.project.findFirst({ where: { id: a.projectId, companyId: a.companyId }, select: { archivedAt: true } });
      if (!project) return { ok: false, error: 'notFound' };
      if (project.archivedAt) return { ok: false, error: 'archived' };
      const same = await tx.attachment.findFirst({ where: { projectId: a.projectId, sha256: a.sha256 }, ...ATTACHMENT_ROW });
      if (same) return { ok: true, row: same, duplicate: true };
      const [files, used] = await Promise.all([
        tx.attachment.count({ where: { projectId: a.projectId } }),
        tx.attachment.aggregate({ where: { companyId: a.companyId }, _sum: { size: true } }),
      ]);
      if (files >= ALLEGATI_LIMITS.perProject || (used._sum.size ?? 0) + a.data.length > ALLEGATI_LIMITS.perCompanyBytes) {
        return { ok: false, error: 'quotaExceeded' };
      }
      const { id } = await tx.attachment.create({
        data: {
          companyId: a.companyId, projectId: a.projectId, createdById: a.userId, kind: a.kind, title: a.title, component: a.component,
          fileName: a.fileName, mime: a.mime, size: a.data.length, sha256: a.sha256, pages: a.pages, width: a.width, height: a.height,
          orientation: a.orientation, blob: { create: { data: a.data } },
        },
        select: { id: true },
      });
      return { ok: true, row: await tx.attachment.findUniqueOrThrow({ where: { id }, ...ATTACHMENT_ROW }), duplicate: false };
    }, { maxWait: 15_000, timeout: 60_000 });
  } catch (e) {
    // the lock serialises the company's uploads, so this is only a safety net: the same bytes stored meanwhile
    if (!isUniqueViolation(e)) throw e;
    const row = await existing(a.projectId, a.sha256, a.companyId);
    if (!row) throw e;
    return { ok: true, row, duplicate: true };
  }
}

/** How much of the limits is used: files of this installation, bytes of the company. */
export async function usage(companyId: string, projectId: string): Promise<{ files: number; bytes: number }> {
  const [files, used] = await Promise.all([
    prisma.attachment.count({ where: { projectId, companyId } }),
    prisma.attachment.aggregate({ where: { companyId }, _sum: { size: true } }),
  ]);
  return { files, bytes: used._sum.size ?? 0 };
}

/**
 * Deletes a file of the company (its bytes go with it, cascade): 'inUse' while an issued relazione tecnica lists it. The
 * foreign key of TechnicalReportAttachment is deferred to the commit (migration 27): made immediate here, so that a
 * report issued meanwhile makes this DELETE fail, not the commit; the count before it gives the same answer earlier.
 */
export async function removeAttachment(companyId: string, id: string): Promise<'deleted' | 'inUse' | 'notFound'> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET CONSTRAINTS "TechnicalReportAttachment_attachmentId_fkey" IMMEDIATE`;
      if (!(await tx.attachment.count({ where: { id, companyId } }))) return 'notFound';
      if (await tx.technicalReportAttachment.count({ where: { attachmentId: id } })) return 'inUse';
      const r = await tx.attachment.deleteMany({ where: { id, companyId } });
      return r.count === 1 ? 'deleted' : 'notFound';
    });
  } catch (e) {
    if (isForeignKeyViolation(e)) return 'inUse';
    throw e;
  }
}
