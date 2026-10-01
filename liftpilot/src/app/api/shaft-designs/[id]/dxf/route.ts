import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { idSchema } from '@/lib/schemas';
import { shaftInputsSchema } from '@/lib/shaft-input';
import { verifyShaftStored } from '@/lib/shaft-hash';
import { planToDxf } from '@/lib/cad/export';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { getShaftDesign } from '@/server/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const text = (status: number, body: string): Response => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
const slug = (s: string): string => s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').toLowerCase().slice(0, 60) || 'impianto';

// The plan of a saved shaft design as DXF, drawn again from the stored inputs only when the running engine
// reproduces the stored hash (otherwise 409: the design must be redone).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await getSessionUser();
    if (!user || user.mustChangePassword) return text(401, 'Unauthorized');
    if (!can(user.role, 'report:download')) return text(403, 'Forbidden');
    if (!rateLimit(`dxf:${user.id}`, 60, 10 * 60 * 1000)) return text(429, 'Too many requests');
    const id = idSchema.safeParse((await params).id);
    if (!id.success) return text(404, 'Not found');
    const d = await getShaftDesign(user, id.data);
    const inputs = d ? shaftInputsSchema.safeParse(d.inputs) : null;
    if (!d || !inputs?.success) return text(404, 'Not found');
    const stored = verifyShaftStored(inputs.data, d.sha256);
    if (!stored.same) return text(409, 'The running engine does not reproduce this design');
    const title = `${d.project.name} · progetto del vano ${d.id} · ${d.createdAt.toISOString().slice(0, 10)} · SHA-256 ${d.sha256.slice(0, 16)}`;
    const dxf = planToDxf(stored.layout, title);
    await audit({ companyId: user.companyId, userId: user.id, action: 'DXF_DOWNLOADED', entity: 'ShaftDesign', entityId: d.id });
    const name = `vano-${slug(d.project.name)}-${d.createdAt.toISOString().slice(0, 10)}.dxf`;
    return new Response(dxf, {
      headers: { 'Content-Type': 'image/vnd.dxf; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (err) {
    log.error({ err }, 'dxf failed');
    return text(500, 'DXF generation failed');
  }
}
