import 'server-only';
// A form's draft (FormDraft): what the installation's one form, a replacement's calculator or a calculation's machine
// room survey held when it last changed, read back when the form opens again (a draft that no longer reads as the form
// sends it counts as none); deleted when the form's record is saved. Always the user's company.
import type { z } from 'zod';
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import type { DraftScope } from '@/lib/draft-input';

export interface ReadDraft<T> {
  data: T;
  /** when it was last kept (ISO) */
  at: string;
}

export async function readDraft<T>(user: SessionUser, projectId: string, scope: DraftScope, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<ReadDraft<T> | null> {
  const d = await prisma.formDraft.findFirst({ where: { projectId, scope, companyId: user.companyId }, select: { data: true, updatedAt: true } });
  if (!d) return null;
  const r = schema.safeParse(d.data);
  return r.success ? { data: r.data, at: d.updatedAt.toISOString() } : null;
}

/** The draft of a form whose record was just saved: gone. */
export async function dropDraft(companyId: string, projectId: string, scope: DraftScope): Promise<void> {
  await prisma.formDraft.deleteMany({ where: { companyId, projectId, scope } });
}
