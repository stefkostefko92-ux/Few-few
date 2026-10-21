import { idSchema } from '@/lib/schemas';
import { log } from '@/lib/log';
import { attachment, downloader, slug, text } from '@/server/download';
import { draftPreview } from '@/server/rt/preview';
import { RendererBusy, busyResponse, renderPdf } from '@/lib/report/render';
import { ANSWER } from '@/lib/answers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The draft of an installation's relazione tecnica di modifica as a PDF (the body only, «BOZZA — non emessa, non valida
// per la firma» on every page, no number, no file appended), from the draft kept (FormDraft scope 'rt'): whoever prepares
// it (progetto:edit), at most 20 in 10 minutes. Not a record: nothing is kept, nothing audited. 409 when the base needs
// «Aggiorna con il software attuale», 422 when the installation has no base an RT can be made from.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const d = await downloader('rt-bozza', 20, 'progetto:edit');
    if ('refused' in d) return d.refused;
    const { user } = d;
    const id = idSchema.safeParse((await params).id);
    if (!id.success) return text(404, ANSWER.notFound);
    const p = await draftPreview(user, id.data);
    if (!p.ok) {
      if (p.error === 'rtBaseOutdated') return text(409, ANSWER.rtBaseOutdated);
      if (p.error === 'rtNotEligible') return text(422, ANSWER.rtNotEligible);
      return text(p.error === 'archived' ? 409 : 404, p.error === 'archived' ? ANSWER.archived : ANSWER.notFound);
    }
    const pdf = await renderPdf(p.composed.doc, new Date());
    return attachment(new Uint8Array(pdf), 'application/pdf', `RT-bozza-${slug(p.composed.input.project.name)}.pdf`);
  } catch (err) {
    if (err instanceof RendererBusy) return busyResponse();
    log.error({ err }, 'technical report preview failed');
    return text(500, ANSWER.failed);
  }
}
