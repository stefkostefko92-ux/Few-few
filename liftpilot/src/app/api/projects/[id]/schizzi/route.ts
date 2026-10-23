import { ANSWER } from '@/lib/answers';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { idSchema } from '@/lib/schemas';
import { text } from '@/server/download';
import { schizziOf } from '@/server/schizzi/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The survey sketches of an installation (round 50) and whether they can be read automatically on this server: whoever
// sees the installation ('projects:view'); another company's installation is «not found». JSON, never cached:
// { ok: true, schizzi: SchizzoView[], aiEnabled } (src/server/schizzi/queries.ts).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getSessionUser();
  if (!user || user.mustChangePassword) return text(401, ANSWER.unauthorized);
  if (!can(user, 'projects:view')) return text(403, ANSWER.forbidden);
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return text(404, ANSWER.notFound);
  const list = await schizziOf(user, id.data);
  if (!list) return text(404, ANSWER.notFound);
  return Response.json({ ok: true, ...list }, { headers: { 'Cache-Control': 'no-store' } });
}
