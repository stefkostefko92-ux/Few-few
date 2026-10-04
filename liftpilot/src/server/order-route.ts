import 'server-only';
// The route of a draft order (src/app/api/{lift-designs,calculations}/<id>/order/<docx|pdf>): signed in, allowed to
// download documents, a bounded rate, the company's own record; 409 when the running engines no longer reproduce it.
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { idSchema } from '@/lib/schemas';
import { attachment, downloader, text } from './download';
import { ORDER_FORMATS, exportCalcOrder, exportDesignOrder } from './order-export';
import { RendererBusy, busyResponse } from '@/lib/report/render';

const formatSchema = z.enum(ORDER_FORMATS);

export function orderRoute(kind: 'design' | 'calc') {
  return async function GET(_req: Request, { params }: { params: Promise<{ id: string; format: string }> }): Promise<Response> {
    try {
      const d = await downloader('order', 30);
      if ('refused' in d) return d.refused;
      const { user } = d;
      const p = await params, id = idSchema.safeParse(p.id), format = formatSchema.safeParse(p.format);
      if (!id.success || !format.success) return text(404, 'Not found');
      const r = kind === 'design' ? await exportDesignOrder(user, id.data, format.data) : await exportCalcOrder(user, id.data, format.data);
      if (!r.ok) {
        return r.error === 'engineChanged' ? text(409, 'The running engines do not reproduce this record')
          : r.error === 'noMachine' ? text(422, 'No catalogue machine takes this installation') : text(404, 'Not found');
      }
      await audit({ companyId: user.companyId, userId: user.id, action: 'ORDER_EXPORTED', entity: r.entity, entityId: r.entityId, meta: { format: format.data } });
      return attachment(r.body, r.mime, r.name);
    } catch (err) {
      if (err instanceof RendererBusy) return busyResponse();
      log.error({ err }, 'order export failed');
      return text(500, 'Export failed');
    }
  };
}
