import { z } from 'zod';
import { idSchema } from '@/lib/schemas';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { ROOM_FORMATS, exportRoomDesign } from '@/server/room-export';
import { RendererBusy, busyResponse } from '@/lib/report/render';
import { attachment, downloader, sandboxed, text } from '@/server/download';
import { ANSWER } from '@/lib/answers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const formatSchema = z.enum(ROOM_FORMATS);

// A saved machine room of a replacement as files: the drawing set as a PDF draft or its pages in SVG, the plan and
// section in DXF or DWG; 409 when the running engines no longer reproduce it or its calculation (a new survey is
// needed). Its old relazione tecnica (format `relazione`) is gone with round 49 — 404 —: the installation's relazione
// tecnica di modifica replaces it.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; format: string }> }): Promise<Response> {
  try {
    const d = await downloader('export', 30);
    if ('refused' in d) return d.refused;
    const { user } = d;
    const p = await params, id = idSchema.safeParse(p.id), format = formatSchema.safeParse(p.format);
    if (!id.success || !format.success) return text(404, ANSWER.notFound);
    const r = await exportRoomDesign(user, id.data, format.data);
    if (!r.ok) return r.error === 'engineChanged' ? text(409, ANSWER.stale) : text(404, ANSWER.notFound);
    await audit({ companyId: user.companyId, userId: user.id, action: 'PROJECT_EXPORTED', entity: 'RoomDesign', entityId: id.data, meta: { format: format.data } });
    // an SVG (or a ZIP of them) is active content: sandboxed if opened
    const res = attachment(r.body, r.mime, r.name);
    return format.data === 'svg' ? sandboxed(res) : res;
  } catch (err) {
    if (err instanceof RendererBusy) return busyResponse();
    log.error({ err }, 'room export failed');
    return text(500, ANSWER.failed);
  }
}
