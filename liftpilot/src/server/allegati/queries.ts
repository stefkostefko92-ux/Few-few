import 'server-only';
// Reads of the uploaded files, always by the company of the session: another company's id is «not found». The list
// never loads the bytes (AttachmentBlob is read only by the download and by the fascicolo).
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import type { AllegatoKind, Componente } from '@/lib/allegati/kinds';
import { isAllegatoMime, type AllegatoMime } from '@/lib/allegati/limits';
import { COMPONENTI } from '@/lib/rt/types';

/** A file's row as the pages and the answers read it: every column (never the bytes: AttachmentBlob is a relation and is
 *  not included), the author's name, how many issued reports list it. An include, not a select: the scalar columns come
 *  as they are (and no select names a `kind`, which tests/no-project-kind reserves for the dropped Project.kind). */
export const ATTACHMENT_ROW = {
  include: { createdBy: { select: { name: true } }, _count: { select: { reports: true } } },
} as const;

export interface AttachmentRow {
  id: string;
  projectId: string;
  kind: AllegatoKind;
  title: string;
  component: string | null;
  fileName: string;
  mime: string;
  size: number;
  sha256: string;
  pages: number;
  width: number | null;
  height: number | null;
  orientation: number | null;
  createdAt: Date;
  createdBy: { name: string } | null;
  _count: { reports: number };
}

/** A file as the client components receive it (plain JSON: dates as ISO strings). */
export interface AttachmentView {
  id: string;
  kind: AllegatoKind;
  title: string;
  component: Componente | null;
  fileName: string;
  mime: AllegatoMime;
  size: number;
  sha256: string;
  pages: number;
  width: number | null;
  height: number | null;
  createdAt: string;
  createdBy: string | null;
  /** issued relazioni tecniche that list it: it cannot be deleted */
  inUse: number;
}

const isComponente = (c: string | null): c is Componente => c !== null && (COMPONENTI as readonly string[]).includes(c);

export const viewOf = (r: AttachmentRow): AttachmentView => ({
  id: r.id, kind: r.kind, title: r.title, component: isComponente(r.component) ? r.component : null, fileName: r.fileName,
  mime: isAllegatoMime(r.mime) ? r.mime : 'application/pdf', size: r.size, sha256: r.sha256, pages: r.pages, width: r.width,
  height: r.height, createdAt: r.createdAt.toISOString(), createdBy: r.createdBy?.name ?? null, inUse: r._count.reports,
});

/** The files of an installation of the user's company, newest first (none for another company's id). */
export async function listAttachments(user: SessionUser, projectId: string): Promise<AttachmentView[]> {
  const rows = await prisma.attachment.findMany({
    where: { projectId, companyId: user.companyId },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 200,
    ...ATTACHMENT_ROW,
  });
  return rows.map(viewOf);
}

/** One file for the download — its row, never its bytes (blob.ts streams them); null for an id of another company or none. */
export function attachmentFile(user: SessionUser, id: string) {
  return prisma.attachment.findFirst({
    where: { id, companyId: user.companyId, blob: { isNot: null } },
    select: { id: true, title: true, mime: true, sha256: true, size: true },
  });
}

/** The installation an upload goes to: of the user's company (else null), and whether it is archived. */
export function uploadTarget(user: SessionUser, projectId: string) {
  return prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId }, select: { id: true, archivedAt: true } });
}
