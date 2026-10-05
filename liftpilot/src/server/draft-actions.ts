'use server';

// A form's draft kept as it is filled in, and discarded on request (src/server/drafts.ts): the user may enter the form's
// data, the project is the company's and not archived, a survey's calculation is the project's; the draft reads as the
// form sends it and is no larger than DRAFT_MAX. A draft is not a record: it holds what was typed, nothing derived.
import { prisma } from '@/lib/db';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { idSchema } from '@/lib/schemas';
import { DRAFT_MAX, draftSchemaOf, draftScopeSchema, type DraftScope } from '@/lib/draft-input';

export type DraftResult = { ok: true; at: string } | { ok: false; error: 'unauthorized' | 'forbidden' | 'rateLimited' | 'invalidFields' | 'notFound' };

type Target = { user: SessionUser; projectId: string; scope: DraftScope };

async function target(input: { projectId: unknown; scope: unknown }, limit: string): Promise<Target | Exclude<DraftResult, { ok: true }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'unauthorized' };
  if (user.mustChangePassword || !can(user, 'calc:create')) return { ok: false, error: 'forbidden' };
  // a change of the form every second at most, and the discards with them
  if (!rateLimit(`${limit}:${user.id}`, 600, 10 * 60 * 1000)) return { ok: false, error: 'rateLimited' };
  const projectId = idSchema.safeParse(input.projectId), scope = draftScopeSchema.safeParse(input.scope);
  if (!projectId.success || !scope.success) return { ok: false, error: 'invalidFields' };
  const project = await prisma.project.findFirst({ where: { id: projectId.data, companyId: user.companyId, archivedAt: null }, select: { id: true } });
  if (!project) return { ok: false, error: 'notFound' };
  if (scope.data.startsWith('room:')) {
    const calc = await prisma.calculation.findFirst({ where: { id: scope.data.slice(5), projectId: project.id, companyId: user.companyId }, select: { id: true } });
    if (!calc) return { ok: false, error: 'notFound' };
  }
  return { user, projectId: project.id, scope: scope.data };
}

export async function saveDraftAction(input: { projectId: unknown; scope: unknown; data: unknown }): Promise<DraftResult> {
  const t = await target(input, 'draft');
  if (!('user' in t)) return t;
  if (JSON.stringify(input.data ?? null).length > DRAFT_MAX) return { ok: false, error: 'invalidFields' };
  const data = draftSchemaOf(t.scope).safeParse(input.data);
  if (!data.success) return { ok: false, error: 'invalidFields' };
  const d = await prisma.formDraft.upsert({
    where: { projectId_scope: { projectId: t.projectId, scope: t.scope } },
    create: { companyId: t.user.companyId, projectId: t.projectId, scope: t.scope, data: data.data },
    update: { data: data.data },
    select: { updatedAt: true },
  });
  return { ok: true, at: d.updatedAt.toISOString() };
}

export async function discardDraftAction(input: { projectId: unknown; scope: unknown }): Promise<DraftResult> {
  const t = await target(input, 'draft');
  if (!('user' in t)) return t;
  await prisma.formDraft.deleteMany({ where: { companyId: t.user.companyId, projectId: t.projectId, scope: t.scope } });
  return { ok: true, at: new Date().toISOString() };
}
