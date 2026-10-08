import { idSchema } from '@/lib/schemas';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { composeStored } from '@/server/drawing-compose';
import { composeStoredRoom } from '@/server/room-compose';
import { attachment, downloader, text } from '@/server/download';
import { getDrawingSet } from '@/server/queries';
import { keepSetPdf, keptSetPdf } from '@/server/drawing-pdf';
import { firstIssuedAt } from '@/server/set-identity';
import { RendererBusy, busyResponse } from '@/lib/report/render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The PDF of an issued drawing set: the one kept as issued (drawing-pdf.ts); a set without one yet is drawn again from
// what it was made of, only when the running engines give the same drawing (the stored hash), and kept; otherwise 409:
// a new revision must be issued.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const d = await downloader('pdf', 30);
    if ('refused' in d) return d.refused;
    const { user } = d;
    const id = idSchema.safeParse((await params).id);
    if (!id.success) return text(404, 'Not found');
    const s = await getDrawingSet(user, id.data);
    if (!s) return text(404, 'Not found');
    let pdf = await keptSetPdf(s.id);
    if (!pdf) {
      // a whole project's set from its shaft design, a replacement's from its machine room (R0: its number's first issue)
      const first = await firstIssuedAt(user.companyId, s);
      const r = s.roomDesign ? composeStoredRoom({ ...s, firstIssuedAt: first, calculation: s.calculation, roomDesign: s.roomDesign, logo: s.logo, clientLogo: s.clientLogo })
        : s.shaftDesign ? composeStored({ ...s, firstIssuedAt: first, calculation: s.calculation, shaftDesign: s.shaftDesign, logo: s.logo, clientLogo: s.clientLogo }) : null;
      if (!r) return text(404, 'Not found');
      if ('ok' in r) return text(r.error === 'engineChanged' ? 409 : 404, r.error === 'engineChanged' ? 'The running engines do not reproduce this drawing set' : 'Not found');
      pdf = await keepSetPdf(s.id, r.doc);
    }
    await audit({ companyId: user.companyId, userId: user.id, action: 'DRAWING_SET_DOWNLOADED', entity: 'DrawingSet', entityId: s.id });
    const name = `tavole-${s.number}${s.revision ? `-R${s.revision}` : ''}.pdf`;
    return attachment(pdf, 'application/pdf', name);
  } catch (err) {
    if (err instanceof RendererBusy) return busyResponse();
    log.error({ err }, 'drawing set pdf failed');
    return text(500, 'Drawing set generation failed');
  }
}
