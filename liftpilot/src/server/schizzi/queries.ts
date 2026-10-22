import 'server-only';
// Reads of the survey sketches (round 50), always by the company of the session: another company's installation or
// file is «not found». A sketch is an uploaded file of kind SCHIZZO (migration 29); its target — the shaft or the
// machine room — is the file's `component` (vano | locale). The list never loads the bytes; the reading and the
// preview read them a slice at a time into one buffer for the image tools (at most 20 MiB, inside their slots).
import type { SessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isAllegatoMime, type AllegatoMime } from '@/lib/allegati/limits';
import { blobSlices } from '@/server/allegati/blob';
import { aiEnabled } from './config';

/** A sketch as the pages list it (plain JSON). */
export interface SchizzoView {
  id: string;
  title: string;
  /** what it was drawn for: the shaft, the machine room, or another part (null: none said) */
  component: string | null;
  mime: AllegatoMime;
  /** pages of a PDF (the first four are shown and read), 1 for a picture */
  pages: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

/** The sketches of an installation of the user's company, newest first, and whether they can be read automatically;
 *  null for another company's installation or none. */
export async function schizziOf(user: SessionUser, projectId: string): Promise<{ schizzi: SchizzoView[]; aiEnabled: boolean } | null> {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId }, select: { id: true } });
  if (!project) return null;
  const rows = await prisma.attachment.findMany({
    where: { projectId, companyId: user.companyId, kind: 'SCHIZZO' },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 60,
    select: { id: true, title: true, component: true, mime: true, pages: true, width: true, height: true, createdAt: true },
  });
  return {
    schizzi: rows.flatMap((r) => (isAllegatoMime(r.mime)
      ? [{ id: r.id, title: r.title, component: r.component, mime: r.mime, pages: r.pages, width: r.width, height: r.height, createdAt: r.createdAt.toISOString() }]
      : [])),
    aiEnabled: aiEnabled(),
  };
}

/** A sketch of this installation and company to read: its row (never another kind, never another company's). */
export function schizzoDaLeggere(user: SessionUser, projectId: string, attachmentId: string) {
  return prisma.attachment.findFirst({
    where: { id: attachmentId, projectId, companyId: user.companyId, kind: 'SCHIZZO', blob: { isNot: null } },
    select: { id: true, sha256: true, mime: true, size: true, pages: true, orientation: true },
  });
}

/** The installation a reading is for: of the user's company (else null), and whether it is archived. */
export function progettoDi(user: SessionUser, projectId: string) {
  return prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId }, select: { id: true, archivedAt: true } });
}

/** A file shown as a preview (projects:view): a sketch of the company only — any other uploaded file is downloaded with
 *  'report:download', a right the company may take from a role, never seen through its preview. */
export function fileDaMostrare(user: SessionUser, attachmentId: string) {
  return prisma.attachment.findFirst({
    where: { id: attachmentId, companyId: user.companyId, kind: 'SCHIZZO', blob: { isNot: null } },
    select: { id: true, sha256: true, mime: true, size: true, pages: true, orientation: true },
  });
}

/** A file's bytes, whole (the image tools read a file): at most its stored size, 20 MiB. */
export async function bytesOf(attachmentId: string, size: number): Promise<Uint8Array> {
  const out = new Uint8Array(size);
  let at = 0;
  for await (const part of blobSlices(attachmentId, size)) {
    if (at + part.length > size) throw new Error(`attachment ${attachmentId}: more bytes than its size`);
    out.set(part, at);
    at += part.length;
  }
  if (at !== size) throw new Error(`attachment ${attachmentId}: bytes cut short`);
  return out;
}
