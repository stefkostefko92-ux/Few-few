'use server';

// The actions of the RT after the owner's model (round 52): its issue and its revisions (whoever issues the drawing sets
// and the relazioni: drawings:issue, at most 30 in 10 minutes). The server decides everything (issue.ts); nothing is
// sent to anyone. The live view derives in the browser from the same engine; the issue derives again here.
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { can, type Capability } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { emettiRt2, type Rt2IssueResult } from './issue';

async function actor(capability: Capability): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user && !user.mustChangePassword && can(user, capability) ? user : null;
}

export async function issueRt2Action(input: { projectId: unknown; inputs: unknown; conferma?: unknown; revisionOf?: unknown }): Promise<Rt2IssueResult> {
  const user = await actor('drawings:issue');
  if (!user) return { ok: false, error: 'forbidden' };
  if (!rateLimit(`rt:${user.id}`, 30, 10 * 60 * 1000)) return { ok: false, error: 'rateLimited' };
  return emettiRt2(user, { projectId: input.projectId, inputs: input.inputs, conferma: input.conferma, revisionOf: input.revisionOf ?? undefined });
}
