import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { idSchema } from '@/lib/schemas';
import { formValuesSchema } from '@/lib/calc-input';
import { verifyStored } from '@/lib/snapshot-hash';
import { buildReport } from '@/lib/report/build';
import { renderPdf } from '@/lib/report/render';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { isRole } from '@/lib/rbac';
import { getCalculation } from '@/server/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const text = (status: number, body: string): Response => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
const slug = (s: string): string => s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').toLowerCase().slice(0, 60) || 'impianto';

// The report of a saved calculation, regenerated from the stored values only when the running engine reproduces
// the stored hash (otherwise 409: the calculation must be redone).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await getSessionUser();
    if (!user || user.mustChangePassword) return text(401, 'Unauthorized');
    if (!can(user.role, 'report:download')) return text(403, 'Forbidden');
    if (!rateLimit(`pdf:${user.id}`, 30, 10 * 60 * 1000)) return text(429, 'Too many requests');
    const id = idSchema.safeParse((await params).id);
    if (!id.success) return text(404, 'Not found');
    const c = await getCalculation(user, id.data);
    const values = c ? formValuesSchema.safeParse(c.inputs) : null;
    if (!c || !values?.success) return text(404, 'Not found');
    if (!verifyStored(values.data, c.sha256).same) return text(409, 'The running engine does not reproduce this calculation');
    const doc = buildReport({
      calc: { id: c.id, label: c.label, createdAt: c.createdAt, sha256: c.sha256, engineVersion: c.engineVersion, profileId: c.profileId, author: c.user?.name ?? null },
      project: c.project, company: user.companyName, values: values.data, generatedAt: new Date(),
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
