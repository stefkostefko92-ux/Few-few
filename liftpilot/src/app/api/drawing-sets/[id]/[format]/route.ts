import { z } from 'zod';
import { idSchema } from '@/lib/schemas';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { attachment, downloader, text } from '@/server/download';
import { SET_CAD_FORMATS, exportDrawingSet } from '@/server/set-cad';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const formatSchema = z.enum(SET_CAD_FORMATS);

// An issued drawing set in DXF or DWG (its PDF: ../pdf): drawn again from what it was made of, only when the running
// engines give the same drawing (the stored hash); otherwise 409: a new revision must be issued.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; format: string }> }): Promise<Response> {
  try {
    const d = await downloader('export', 30);
    if ('refused' in d) return d.refused;
    const { user } = d;
    const p = await params, id = idSchema.safeParse(p.id), format = formatSchema.safeParse(p.format);
    if (!id.success || !format.success) return text(404, 'Not found');
    const r = await exportDrawingSet(user, id.data, format.data);
    if (!r.ok) return r.error === 'engineChanged' ? text(409, 'The running engines do not reproduce this drawing set') : text(404, 'Not found');
    await audit({ companyId: user.companyId, userId: user.id, action: 'DRAWING_SET_DOWNLOADED', entity: 'DrawingSet', entityId: r.setId, meta: { format: format.data } });
    return attachment(r.body, r.mime, r.name);
  } catch (err) {
    log.error({ err }, 'drawing set cad failed');
    return text(500, 'Drawing set generation failed');
  }
}
