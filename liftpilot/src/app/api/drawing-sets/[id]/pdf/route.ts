import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { idSchema } from '@/lib/schemas';
import { renderTavole } from '@/lib/report/render';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { composeStored } from '@/server/drawing-compose';
import { getDrawingSet } from '@/server/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const text = (status: number, body: string): Response => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

// The PDF of an issued drawing set, drawn again from what it was made of only when the running engines give the same
// drawing (the stored hash); otherwise 409: a new revision must be issued.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await getSessionUser();
    if (!user || user.mustChangePassword) return text(401, 'Unauthorized');
    if (!can(user.role, 'report:download')) return text(403, 'Forbidden');
    if (!rateLimit(`pdf:${user.id}`, 30, 10 * 60 * 1000)) return text(429, 'Too many requests');
    const id = idSchema.safeParse((await params).id);
    if (!id.success) return text(404, 'Not found');
    const s = await getDrawingSet(user, id.data);
    if (!s) return text(404, 'Not found');
    const r = composeStored({ ...s, calculation: s.calculation, shaftDesign: s.shaftDesign, logo: s.logo, clientLogo: s.clientLogo });
    if ('ok' in r) return text(r.error === 'engineChanged' ? 409 : 404, r.error === 'engineChanged' ? 'The running engines do not reproduce this drawing set' : 'Not found');
    const pdf = await renderTavole(r.doc);
    await audit({ companyId: user.companyId, userId: user.id, action: 'DRAWING_SET_DOWNLOADED', entity: 'DrawingSet', entityId: s.id });
    const name = `tavole-${s.number}${s.revision ? `-R${s.revision}` : ''}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (err) {
    log.error({ err }, 'drawing set pdf failed');
    return text(500, 'Drawing set generation failed');
  }
}
