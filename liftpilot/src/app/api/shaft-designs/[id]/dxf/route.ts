import { idSchema } from '@/lib/schemas';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { attachment, downloader, text } from '@/server/download';
import { exportShaftPlan } from '@/server/shaft-export';
import { ANSWER } from '@/lib/answers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The plan of a saved shaft design as DXF (in SVG: ../svg), drawn again from the stored inputs only when the running
// engine reproduces the stored hash (otherwise 409: the design must be redone).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const dl = await downloader('dxf', 60);
    if ('refused' in dl) return dl.refused;
    const { user } = dl;
    const id = idSchema.safeParse((await params).id);
    if (!id.success) return text(404, ANSWER.notFound);
    const r = await exportShaftPlan(user, id.data, 'dxf');
    if (!r.ok) return r.error === 'engineChanged' ? text(409, ANSWER.stale) : text(404, ANSWER.notFound);
    await audit({ companyId: user.companyId, userId: user.id, action: 'DXF_DOWNLOADED', entity: 'ShaftDesign', entityId: r.designId });
    return attachment(r.body, r.mime, r.name);
  } catch (err) {
    log.error({ err }, 'dxf failed');
    return text(500, ANSWER.failed);
  }
}
