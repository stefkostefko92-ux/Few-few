import { z } from 'zod';
import { idSchema } from '@/lib/schemas';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { EXPORT_FORMATS, exportLiftDesign } from '@/server/project-export';
import { RendererBusy, busyResponse } from '@/lib/report/render';
import { attachment, downloader, text } from '@/server/download';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const formatSchema = z.enum(EXPORT_FORMATS);

// A saved lift design as files: the drawing set as a PDF draft, every view in DXF or DWG; 409 when the running engines
// no longer reproduce its records (a new save is needed).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; format: string }> }): Promise<Response> {
  try {
    const d = await downloader('export', 30);
    if ('refused' in d) return d.refused;
    const { user } = d;
    const p = await params, id = idSchema.safeParse(p.id), format = formatSchema.safeParse(p.format);
    if (!id.success || !format.success) return text(404, 'Not found');
    const r = await exportLiftDesign(user, id.data, format.data);
    if (!r.ok) return r.error === 'engineChanged' ? text(409, 'The running engines do not reproduce this project') : text(404, 'Not found');
    await audit({ companyId: user.companyId, userId: user.id, action: 'PROJECT_EXPORTED', entity: 'LiftDesign', entityId: r.designId, meta: { format: format.data } });
    return attachment(r.body, r.mime, r.name);
  } catch (err) {
    if (err instanceof RendererBusy) return busyResponse();
    log.error({ err }, 'project export failed');
    return text(500, 'Export failed');
  }
}
