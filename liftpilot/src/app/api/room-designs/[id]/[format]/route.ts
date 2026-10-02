import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { idSchema } from '@/lib/schemas';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { ROOM_FORMATS, exportRoomDesign } from '@/server/room-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const text = (status: number, body: string): Response => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
const formatSchema = z.enum(ROOM_FORMATS);

// A saved machine room of a replacement as files: the relazione tecnica, the drawing set as a PDF draft, the plan and
// section in DXF or DWG; 409 when the running engines no longer reproduce it or its calculation (a new survey is needed).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; format: string }> }): Promise<Response> {
  try {
    const user = await getSessionUser();
    if (!user || user.mustChangePassword) return text(401, 'Unauthorized');
    if (!can(user, 'report:download')) return text(403, 'Forbidden');
    if (!rateLimit(`export:${user.id}`, 30, 10 * 60 * 1000)) return text(429, 'Too many requests');
    const p = await params, id = idSchema.safeParse(p.id), format = formatSchema.safeParse(p.format);
    if (!id.success || !format.success) return text(404, 'Not found');
    const r = await exportRoomDesign(user, id.data, format.data);
    if (!r.ok) return r.error === 'engineChanged' ? text(409, 'The running engines do not reproduce this machine room') : text(404, 'Not found');
    await audit({ companyId: user.companyId, userId: user.id, action: format.data === 'relazione' ? 'REPORT_DOWNLOADED' : 'PROJECT_EXPORTED', entity: 'RoomDesign', entityId: id.data, meta: { format: format.data } });
    return new Response(r.body, {
      headers: { 'Content-Type': r.mime, 'Content-Disposition': `attachment; filename="${r.name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (err) {
    log.error({ err }, 'room export failed');
    return text(500, 'Export failed');
  }
}
