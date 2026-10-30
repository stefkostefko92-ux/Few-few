'use server';

// The relazione tecnica di modifica's actions (RT plan §7, §8): its live summary while it is prepared (whoever draws the
// project: progetto:edit, at most 120 in 10 minutes), its issue and its revisions (whoever issues the drawing sets and
// the relazioni: drawings:issue, at most 30 in 10 minutes). The server decides everything (issue.ts, preview.ts);
// nothing is sent to anyone.
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { can, type Capability } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { idSchema } from '@/lib/schemas';
import { emettiRt, type RtIssueResult } from './issue';
import { summaryPreview, type PreviewError } from './preview';
import type { Conferma, RtSummary } from './summary';

async function actor(capability: Capability): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user && !user.mustChangePassword && can(user, capability) ? user : null;
}

export type RtPreviewResult = { ok: true; summary: RtSummary; conferma: Conferma } | { ok: false; error: PreviewError | 'forbidden' | 'rateLimited' };

export async function rtPreviewAction(input: { projectId: unknown; inputs: unknown }): Promise<RtPreviewResult> {
  const user = await actor('progetto:edit');
  if (!user) return { ok: false, error: 'forbidden' };
  if (!rateLimit(`rt-preview:${user.id}`, 120, 10 * 60 * 1000)) return { ok: false, error: 'rateLimited' };
  const id = idSchema.safeParse(input.projectId);
  if (!id.success) return { ok: false, error: 'notFound' };
  return summaryPreview(user, id.data, input.inputs);
}

export async function issueTechnicalReportAction(input: { projectId: unknown; inputs: unknown; conferma?: unknown }): Promise<RtIssueResult> {
  const user = await actor('drawings:issue');
  if (!user) return { ok: false, error: 'forbidden' };
  if (!rateLimit(`rt:${user.id}`, 30, 10 * 60 * 1000)) return { ok: false, error: 'rateLimited' };
  return emettiRt(user, { projectId: input.projectId, inputs: input.inputs, conferma: input.conferma });
}

/** A revision of the latest revision of an RT's number: the same number, revision + 1, with its note. */
export async function reviseTechnicalReportAction(input: { reportId: unknown; projectId: unknown; inputs: unknown; conferma?: unknown }): Promise<RtIssueResult> {
  const user = await actor('drawings:issue');
  if (!user) return { ok: false, error: 'forbidden' };
  if (!rateLimit(`rt:${user.id}`, 30, 10 * 60 * 1000)) return { ok: false, error: 'rateLimited' };
  if (input.reportId == null) return { ok: false, error: 'invalidFields' };
  return emettiRt(user, { projectId: input.projectId, inputs: input.inputs, conferma: input.conferma, revisionOf: input.reportId });
}
