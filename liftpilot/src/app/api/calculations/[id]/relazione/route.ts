import { idSchema } from '@/lib/schemas';
import { savedLiftAdvice, savedValuesAdvice } from '@/lib/lift/advice-cache';
import { buildReport } from '@/lib/report/build';
import { renderPdf } from '@/lib/report/render';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { isRole } from '@/lib/rbac';
import { attachment, downloader, slug, text } from '@/server/download';
import { getCalculation, getLetterhead } from '@/server/queries';
import { calcRecord, recordMarks } from '@/server/records';
import { RendererBusy, busyResponse } from '@/lib/report/render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The report of a saved calculation, regenerated from the stored values only when the running engines reproduce it and
// the records it was made from (src/server/records.ts; otherwise 409: it must be saved again). What the software filled
// in from the one form of a lift design is marked as such.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const d = await downloader('pdf', 30);
    if ('refused' in d) return d.refused;
    const { user } = d;
    const id = idSchema.safeParse((await params).id);
    if (!id.success) return text(404, 'Not found');
    const c = await getCalculation(user, id.data), rec = c ? calcRecord(c) : null;
    if (!c || !rec) return text(404, 'Not found');
    if (!rec.ok) return text(409, 'The running engines do not reproduce this calculation or the records it was made from');
    // the advice among SICOR and Montanari: from the lift design's inputs when it has one, else from the values
    const advice = rec.lift ? savedLiftAdvice(rec.lift.inputs) : savedValuesAdvice(rec.values);
    const doc = buildReport({
      calc: { id: c.id, label: c.label, createdAt: c.createdAt, sha256: c.sha256, engineVersion: c.engineVersion, profileId: c.profileId, author: c.user?.name ?? null },
      project: c.project, ...await getLetterhead(user), advice, values: rec.values, design: rec.design, generatedAt: new Date(),
      // the standards: those of the lift design it comes from, else those chosen with the calculation
      marks: recordMarks(rec, c.collaudo),
      reviews: c.reviews.map((r) => ({ name: r.user?.name ?? null, role: r.user && isRole(r.user.role) ? r.user.role : null, note: r.note, createdAt: r.createdAt })),
    });
    const pdf = await renderPdf(doc);
    await audit({ companyId: user.companyId, userId: user.id, action: 'REPORT_DOWNLOADED', entity: 'Calculation', entityId: c.id });
    return attachment(new Uint8Array(pdf), 'application/pdf', `relazione-di-calcolo-${slug(c.project.name)}-${c.createdAt.toISOString().slice(0, 10)}.pdf`);
  } catch (err) {
    if (err instanceof RendererBusy) return busyResponse();
    log.error({ err }, 'report failed');
    return text(500, 'Report generation failed');
  }
}
