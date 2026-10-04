import { idSchema } from '@/lib/schemas';
import { shaftInputsReadSchema } from '@/lib/shaft-input';
import { verifyShaftStored } from '@/lib/shaft-hash';
import { planToDxf } from '@/lib/cad/export';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { attachment, downloader, slug, text } from '@/server/download';
import { getShaftDesign } from '@/server/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The plan of a saved shaft design as DXF, drawn again from the stored inputs only when the running engine
// reproduces the stored hash (otherwise 409: the design must be redone).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const dl = await downloader('dxf', 60);
    if ('refused' in dl) return dl.refused;
    const { user } = dl;
    const id = idSchema.safeParse((await params).id);
    if (!id.success) return text(404, 'Not found');
    const d = await getShaftDesign(user, id.data);
    const inputs = d ? shaftInputsReadSchema.safeParse(d.inputs) : null;
    if (!d || !inputs?.success) return text(404, 'Not found');
    const stored = verifyShaftStored(inputs.data, d.sha256);
    if (!stored.same) return text(409, 'The running engine does not reproduce this design');
    const title = `${d.project.name} · progetto del vano ${d.id} · ${d.createdAt.toISOString().slice(0, 10)} · SHA-256 ${d.sha256.slice(0, 16)}`;
    const dxf = planToDxf(stored.layout, title);
    await audit({ companyId: user.companyId, userId: user.id, action: 'DXF_DOWNLOADED', entity: 'ShaftDesign', entityId: d.id });
    const name = `vano-${slug(d.project.name)}-${d.createdAt.toISOString().slice(0, 10)}.dxf`;
    return attachment(dxf, 'image/vnd.dxf; charset=utf-8', name);
  } catch (err) {
    log.error({ err }, 'dxf failed');
    return text(500, 'DXF generation failed');
  }
}
