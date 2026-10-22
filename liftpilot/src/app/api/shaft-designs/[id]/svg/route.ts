import { idSchema } from '@/lib/schemas';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { attachment, downloader, sandboxed, text } from '@/server/download';
import { exportShaftPlan } from '@/server/shaft-export';
import { ANSWER } from '@/lib/answers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The plan of a saved shaft design as SVG, the same view as its DXF (../dxf), on a paper of its size at 1:20, with the
// same rights, rate (the DXF's bucket) and 409 when the running engine no longer reproduces the stored hash. An SVG is
// active content: sandboxed if opened.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const dl = await downloader('dxf', 60);
    if ('refused' in dl) return dl.refused;
    const { user } = dl;
    const id = idSchema.safeParse((await params).id);
    if (!id.success) return text(404, ANSWER.notFound);
    const r = await exportShaftPlan(user, id.data, 'svg');
    if (!r.ok) return r.error === 'engineChanged' ? text(409, ANSWER.stale) : text(404, ANSWER.notFound);
    await audit({ companyId: user.companyId, userId: user.id, action: 'SVG_DOWNLOADED', entity: 'ShaftDesign', entityId: r.designId, meta: { format: 'svg' } });
    return sandboxed(attachment(r.body, r.mime, r.name));
  } catch (err) {
    log.error({ err }, 'svg failed');
    return text(500, ANSWER.failed);
  }
}
