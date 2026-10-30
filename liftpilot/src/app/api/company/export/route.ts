import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { companyExport, exportStream } from '@/server/company-export';
import { attachment, slug, text } from '@/server/download';
import { ANSWER } from '@/lib/answers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The company's data as JSON, for whoever holds 'company:export' (the owner; a Capotecnico the company gives it to): also
// read-only (after the subscription, or before accepting new terms). One JSON document, streamed: the logos, the
// installations, the survey sheets and the activity log a page at a time, the uploaded files (format 12) a slice at a
// time, so the server never holds the company's data; what companyExport reads comes before the audit entry of the export.
export async function GET(): Promise<Response> {
  try {
    const user = await getSessionUser();
    if (!user || user.mustChangePassword) return text(401, ANSWER.unauthorized);
    if (!can(user, 'company:export')) return text(403, ANSWER.forbidden);
    if (!rateLimit(`export:${user.companyId}`, 6, 60 * 60 * 1000)) return text(429, ANSWER.rateLimited);
    const head = await companyExport(user.companyId);
    if (!head) return text(404, ANSWER.notFound);
    await audit({ companyId: user.companyId, userId: user.id, action: 'DATA_EXPORTED', entity: 'Company', entityId: user.companyId });
    return attachment(exportStream(head, user.companyId), 'application/json; charset=utf-8', `liftpilot-${slug(user.companyName, 'azienda')}-${new Date().toISOString().slice(0, 10)}.json`);
  } catch (err) {
    log.error({ err }, 'company export failed');
    return text(500, ANSWER.failed);
  }
}
