import { env } from '@/lib/env';
import { log } from '@/lib/log';
import { pdfFileName } from '@/lib/rilievi/form-help';
import { rilieviTranslator } from '@/lib/rilievi/i18n';
import { attachment, downloader, text } from '@/server/download';
import { sheetToShow } from '@/server/rilievi/pages';
import { renderSchedaPdf } from '@/server/rilievi/pdf';
import { companyLogo } from '@/server/rilievi/queries';
import { ANSWER } from '@/lib/answers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A survey sheet's PDF (rilievi's GET /schede/:id/pdf): the same content as the print page, never the suppliers'
// modules. Every role reads it; a trashed sheet only whoever manages the trash; another company's or an unknown id is
// 404. `?inline=1` opens it in the browser (to print), otherwise it is saved.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const d = await downloader('rilievi-pdf', 30, 'rilievi:view');
    if ('refused' in d) return d.refused;
    const { user } = d;
    const scheda = await sheetToShow(user, (await params).id);
    if (!scheda) return text(404, ANSWER.notFound);
    const pdf = await renderSchedaPdf(scheda, {
      t: rilieviTranslator(),
      generatedBy: user.name,
      fontDir: env().REPORT_FONT_DIR,
      logo: await companyLogo(scheda.companyId),
    });
    const inline = new URL(req.url).searchParams.get('inline') === '1';
    return attachment(new Uint8Array(pdf), 'application/pdf', pdfFileName(scheda), inline ? 'inline' : 'attachment');
  } catch (err) {
    log.error({ err }, 'rilievi sheet pdf failed');
    return text(500, ANSWER.failed);
  }
}
