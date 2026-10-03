import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { companyExport } from '@/server/company-export';
import { attachment, slug, text } from '@/server/download';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    return attachment(JSON.stringify(data, null, 2), 'application/json; charset=utf-8', `liftpilot-${slug(user.companyName, 'azienda')}-${new Date().toISOString().slice(0, 10)}.json`);
  } catch (err) {
    log.error({ err }, 'company export failed');
    return text(500, 'Export failed');
  }
}
