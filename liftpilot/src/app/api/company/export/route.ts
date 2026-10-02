import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { companyExport } from '@/server/company-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const text = (status: number, body: string): Response => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
const slug = (s: string): string => s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').toLowerCase().slice(0, 60) || 'azienda';

// The company's data as JSON, for its owner: also read-only (after the subscription, or before accepting new terms).
export async function GET(): Promise<Response> {
  try {
    const user = await getSessionUser();
    if (!user || user.mustChangePassword) return text(401, 'Unauthorized');
    if (!can(user, 'company:export')) return text(403, 'Forbidden');
    if (!rateLimit(`export:${user.companyId}`, 6, 60 * 60 * 1000)) return text(429, 'Too many requests');
    const data = await companyExport(user.companyId);
    if (!data) return text(404, 'Not found');
    await audit({ companyId: user.companyId, userId: user.id, action: 'DATA_EXPORTED', entity: 'Company', entityId: user.companyId });
    const name = `liftpilot-${slug(user.companyName)}-${new Date().toISOString().slice(0, 10)}.json`;
    return new Response(JSON.stringify(data, null, 2), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff' },
    });
  } catch (err) {
    log.error({ err }, 'company export failed');
    return text(500, 'Export failed');
  }
}
