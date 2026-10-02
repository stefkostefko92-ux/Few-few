import 'server-only';
// The route of a draft order (src/app/api/{lift-designs,calculations}/<id>/order/<docx|pdf>): signed in, allowed to
// download documents, a bounded rate, the company's own record; 409 when the running engines no longer reproduce it.
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { rateLimit } from '@/lib/ratelimit';
import { can } from '@/lib/rbac';
import { idSchema } from '@/lib/schemas';
import { ORDER_FORMATS, exportCalcOrder, exportDesignOrder } from './order-export';

const text = (status: number, body: string): Response => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
const formatSchema = z.enum(ORDER_FORMATS);

export function orderRoute(kind: 'design' | 'calc') {
  return async function GET(_req: Request, { params }: { params: Promise<{ id: string; format: string }> }): Promise<Response> {
    try {
      const user = await getSessionUser();
      if (!user || user.mustChangePassword) return text(401, 'Unauthorized');
      if (!can(user.role, 'report:download')) return text(403, 'Forbidden');
      if (!rateLimit(`order:${user.id}`, 30, 10 * 60 * 1000)) return text(429, 'Too many requests');
      const p = await params, id = idSchema.safeParse(p.id), format = formatSchema.safeParse(p.format);
      if (!id.success || !format.success) return text(404, 'Not found');
      const r = kind === 'design' ? await exportDesignOrder(user, id.data, format.data) : await exportCalcOrder(user, id.data, format.data);
      if (!r.ok) {
        return r.error === 'engineChanged' ? text(409, 'The running engines do not reproduce this record')
          : r.error === 'noMachine' ? text(422, 'No catalogue machine takes this installation') : text(404, 'Not found');
      }
      await audit({ companyId: user.companyId, userId: user.id, action: 'ORDER_EXPORTED', entity: kind === 'design' ? 'LiftDesign' : 'Calculation', entityId: r.entityId, meta: { format: format.data } });
      return new Response(r.body, {
        headers: { 'Content-Type': r.mime, 'Content-Disposition': `attachment; filename="${r.name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    } catch (err) {
      log.error({ err }, 'order export failed');
      return text(500, 'Export failed');
    }
  };
}
