import { DEFAULT_LOCALE } from '@/i18n/locales';
import { log } from '@/lib/log';
import { idSchema } from '@/lib/schemas';
import { isVerdictKind } from '@/lib/verdict-checks';
import { downloader, text } from '@/server/download';
import { verdictDetail } from '@/server/verdict-checks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The checks a saved record does not pass, and those it passes with a warning, for the pill that shows its result
// (VerdictChecks): read on the first opening of the pill, in Italian (the only language). Signed in, the right to see the
// calculations, the company's own record (another company's id is «not found», as an unknown one); read only, so the
// read-only mode of a company keeps it.
export async function GET(_req: Request, { params }: { params: Promise<{ kind: string; id: string }> }): Promise<Response> {
  try {
    const d = await downloader('verdict', 300, 'calc:view');
    if ('refused' in d) return d.refused;
    const { kind, id } = await params, parsed = idSchema.safeParse(id);
    if (!isVerdictKind(kind) || !parsed.success) return text(404, 'Not found');
    const detail = await verdictDetail(d.user, kind, parsed.data, DEFAULT_LOCALE);
    if (!detail) return text(404, 'Not found');
    return Response.json(detail, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    log.error({ err }, 'verdict checks failed');
    return text(500, 'Failed');
  }
}
