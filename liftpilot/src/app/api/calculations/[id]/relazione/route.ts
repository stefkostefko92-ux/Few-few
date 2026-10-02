import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { idSchema } from '@/lib/schemas';
import { formValuesSchema } from '@/lib/calc-input';
import { verifyStored } from '@/lib/snapshot-hash';
import { reproduceDesign } from '@/lib/shaft-hash';
import { calcMarks } from '@/lib/lift-marks';
import { collaudoSchema, liftInputsReadSchema } from '@/lib/lift-input';
import { collaudoOf } from '@/lib/lift/collaudo';
import { liftAdvice, valuesAdvice } from '@/lib/lift/advice';
import { buildReport } from '@/lib/report/build';
import { renderPdf } from '@/lib/report/render';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { isRole } from '@/lib/rbac';
import { getCalculation, getCompanyLetterhead } from '@/server/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const text = (status: number, body: string): Response => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
const slug = (s: string): string => s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').toLowerCase().slice(0, 60) || 'impianto';

// The report of a saved calculation, regenerated from the stored values only when the running engine reproduces
// the stored hash, and that of the shaft design the calculation comes from (otherwise 409: it must be redone). What the
// software filled in from the one form of a lift design is marked as such.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await getSessionUser();
    if (!user || user.mustChangePassword) return text(401, 'Unauthorized');
    if (!can(user, 'report:download')) return text(403, 'Forbidden');
    if (!rateLimit(`pdf:${user.id}`, 30, 10 * 60 * 1000)) return text(429, 'Too many requests');
    const id = idSchema.safeParse((await params).id);
    if (!id.success) return text(404, 'Not found');
    const c = await getCalculation(user, id.data);
    const values = c ? formValuesSchema.safeParse(c.inputs) : null;
    if (!c || !values?.success) return text(404, 'Not found');
    if (!verifyStored(values.data, c.sha256).same) return text(409, 'The running engine does not reproduce this calculation');
    const design = c.shaftDesign ? reproduceDesign(c.shaftDesign) : null;
    if (c.shaftDesign && !design) return text(409, 'The running engine does not reproduce the shaft design of this calculation');
    // the standards: those of the lift design it comes from, else those chosen with the calculation
    const marks = calcMarks(c.liftDesign, c.sha256), own = c.collaudo ? collaudoSchema.safeParse(c.collaudo) : null;
    // the advice among SICOR and Montanari: from the lift design's inputs when it has one, else from the values
    const lift = c.liftDesign ? liftInputsReadSchema.safeParse(c.liftDesign.inputs) : null;
    const advice = lift?.success ? liftAdvice(lift.data) : valuesAdvice(values.data);
    const head = await getCompanyLetterhead(user), mime = head?.logo?.mime;
    const logo = head?.logo && (mime === 'image/png' || mime === 'image/jpeg') ? { mime, data: Buffer.from(head.logo.data).toString('base64') } as const : null;
    const doc = buildReport({
      calc: { id: c.id, label: c.label, createdAt: c.createdAt, sha256: c.sha256, engineVersion: c.engineVersion, profileId: c.profileId, author: c.user?.name ?? null },
      project: c.project, company: head?.name ?? user.companyName, companyCity: head?.city ?? null, logo, advice, values: values.data, design, generatedAt: new Date(),
      marks: !marks.collaudo && own?.success ? { ...marks, collaudo: collaudoOf(values.data, own.data) } : marks,
      reviews: c.reviews.map((r) => ({ name: r.user?.name ?? null, role: r.user && isRole(r.user.role) ? r.user.role : null, note: r.note, createdAt: r.createdAt })),
    });
    const pdf = await renderPdf(doc);
    await audit({ companyId: user.companyId, userId: user.id, action: 'REPORT_DOWNLOADED', entity: 'Calculation', entityId: c.id });
    const name = `relazione-di-calcolo-${slug(c.project.name)}-${c.createdAt.toISOString().slice(0, 10)}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (err) {
    log.error({ err }, 'report failed');
    return text(500, 'Report generation failed');
  }
}
