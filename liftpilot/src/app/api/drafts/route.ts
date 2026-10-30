import { getSessionUser } from '@/lib/auth';
import { DRAFT_MAX } from '@/lib/draft-input';
import { ANSWER } from '@/lib/answers';
import { sameOriginPost } from '@/lib/same-origin';
import { text } from '@/server/download';
import { saveDraftAction } from '@/server/draft-actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS = { unauthorized: 401, forbidden: 403, rateLimited: 429, invalidFields: 400, notFound: 404 } as const;

// A form's draft kept as the tab is hidden or closed (round 46, src/components/draft/useDraft.ts): the same keep as the
// form's server action (src/server/draft-actions.ts — the right, the project of the company, the schema, the size), as
// a POST the browser finishes after the page is gone (fetch keepalive). Only from the application's own pages
// (sameOriginPost); the answer is the action's.
export async function POST(req: Request): Promise<Response> {
  if (!sameOriginPost(req.headers)) return text(403, ANSWER.forbidden);
  // the session first, as the other routes: without one nothing of the body is read (401, not 400 or 413)
  if (!(await getSessionUser())) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const body = await req.text();
  // the draft (DRAFT_MAX) with its project and scope
  if (body.length > DRAFT_MAX + 512) return Response.json({ ok: false, error: 'invalidFields' }, { status: 413 });
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return Response.json({ ok: false, error: 'invalidFields' }, { status: 400 });
  }
  const o = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const r = await saveDraftAction({ projectId: o.projectId, scope: o.scope, data: o.data });
  return Response.json(r, { status: r.ok ? 200 : STATUS[r.error], headers: { 'Cache-Control': 'no-store' } });
}
