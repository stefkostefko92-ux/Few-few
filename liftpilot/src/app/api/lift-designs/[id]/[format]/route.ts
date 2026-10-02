import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { idSchema } from '@/lib/schemas';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { EXPORT_FORMATS, exportLiftDesign } from '@/server/project-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const text = (status: number, body: string): Response => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
const formatSchema = z.enum(EXPORT_FORMATS);

// A saved lift design as files: the drawing set as a PDF draft, every view in DXF or DWG; 409 when the running engines
// no longer reproduce its records (a new save is needed).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; format: string }> }): Promise<Response> {
  try {
    const user = await getSessionUser();
    if (!user || user.mustChangePassword) return text(401, 'Unauthorized');
    if (!can(user, 'report:download')) return text(403, 'Forbidden');
    if (!rateLimit(`export:${user.id}`, 30, 10 * 60 * 1000)) return text(429, 'Too many requests');
    const p = await params, id = idSchema.safeParse(p.id), format = formatSchema.safeParse(p.format);
    if (!id.success || !format.success) return text(404, 'Not found');
    const r = await exportLiftDesign(user, id.data, format.data);
    if (!r.ok) return r.error === 'engineChanged' ? text(409, 'The running engines do not reproduce this project') : text(404, 'Not found');
    await audit({ companyId: user.companyId, userId: user.id, action: 'PROJECT_EXPORTED', entity: 'LiftDesign', entityId: r.designId, meta: { format: format.data } });
    return new Response(r.body, {
      headers: { 'Content-Type': r.mime, 'Content-Disposition': `attachment; filename="${r.name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (err) {
    log.error({ err }, 'project export failed');
    return text(500, 'Export failed');
  }
}
