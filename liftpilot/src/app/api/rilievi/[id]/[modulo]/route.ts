import { env } from '@/lib/env';
import { log } from '@/lib/log';
import { moduloFileName } from '@/lib/rilievi/form-help';
import { sceltoNellaScheda, slotByPath } from '@/lib/rilievi/ordini/registry';
import { storedValori } from '@/lib/rilievi/ordini/valori';
import { attachment, downloader, text } from '@/server/download';
import { renderModulo } from '@/server/rilievi/modulo-pdf';
import { sheetToShow } from '@/server/rilievi/pages';
import { ANSWER } from '@/lib/answers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A supplier's module filled in on a survey sheet (rilievi's GET /schede/:id/ordine-quadro, /ordine-quadro-movilift,
// /ordine-quadro-mastech-ng120, /ordine-quadro-mastech-qi-touch, /dati-argano and /sospensioni-2sg, commit 988f3cf37): the
// official PDF with the stored values on it, apart from the sheet's PDF. The same rights as the sheet; a sheet of another
// company, unknown, without the module answered «Sì» and stored, or of another make or model (the panel's Pelazza order
// on a MoviLift sheet, the NG120 order on a QI Touch sheet) is 404. A blank module whose SHA-256 is not
// its map's pin makes no PDF (500). `?inline=1` opens it in the browser (to print), otherwise it is saved. An unknown
// module path is 404 before anything else (rilievi never routed it), so it spends no download of the person's quota.
export async function GET(req: Request, { params }: { params: Promise<{ id: string; modulo: string }> }): Promise<Response> {
  try {
    const p = await params, slot = slotByPath(p.modulo);
    if (!slot) return text(404, ANSWER.notFound);
    const d = await downloader('rilievi-pdf', 30, 'rilievi:view');
    if ('refused' in d) return d.refused;
    const { user } = d;
    const scheda = await sheetToShow(user, p.id);
    if (!scheda || scheda[slot.question] !== true || !sceltoNellaScheda(slot, (key) => scheda[key as keyof typeof scheda])) {
      return text(404, ANSWER.notFound);
    }
    const valori = storedValori(slot.modulo, scheda[slot.column]);
    if (!valori) return text(404, ANSWER.notFound);
    const pdf = await renderModulo(slot.modulo, valori, env().REPORT_FONT_DIR);
    const inline = new URL(req.url).searchParams.get('inline') === '1';
    return attachment(new Uint8Array(pdf), 'application/pdf', moduloFileName(slot.path, scheda), inline ? 'inline' : 'attachment');
  } catch (err) {
    log.error({ err }, 'rilievi module pdf failed');
    return text(500, ANSWER.failed);
  }
}
