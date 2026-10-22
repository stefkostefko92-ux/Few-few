import { ANSWER } from '@/lib/answers';
import { TYPE_OF, isAllegatoMime } from '@/lib/allegati/limits';
import { log } from '@/lib/log';
import { SCHIZZO_PAGINE, previewOf } from '@/lib/report/image-tool';
import { RendererBusy, busyResponse } from '@/lib/report/render';
import { idSchema } from '@/lib/schemas';
import { downloader, inFlight, text } from '@/server/download';
import { bytesOf, fileDaMostrare } from '@/server/schizzi/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Previews per user and 10 minutes (a PDF sketch's pages, the panel's zoom: a few each time). */
const PER_10_MIN = 120;

// The preview of an uploaded file beside a form (round 50, the survey sketches; any uploaded file of the company):
// whoever sees the installations ('projects:view'), 120 in 10 minutes and two at a time per user, another company's id
// «not found». Never the uploaded bytes: a picture made again by us (src/lib/report/image-tool.ts) — a JPEG or PNG
// turned the way the phone held it and at most 1600 px on its longest side, in its own format; a PDF's page
// ?pagina=N (1..4, at most its pages) drawn as a PNG — inline, cached by the browser for 5 minutes (the bytes never
// change), sandboxed like every file the product serves. X-Pagine says the file's pages (of a PDF, only the first
// four are shown).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const d = await downloader('anteprima', PER_10_MIN, 'projects:view');
  if ('refused' in d) return d.refused;
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return text(404, ANSWER.notFound);
  const f = await fileDaMostrare(d.user, id.data);
  if (!f || !isAllegatoMime(f.mime)) return text(404, ANSWER.notFound);
  const type = TYPE_OF[f.mime], asked = new URL(req.url).searchParams.get('pagina');
  let page = 1;
  if (type === 'pdf' && asked !== null) {
    if (!/^[1-9]\d{0,2}$/.test(asked)) return text(404, ANSWER.notFound);
    page = Number(asked);
    if (page > Math.min(f.pages, SCHIZZO_PAGINE)) return text(404, ANSWER.notFound);
  }
  const release = inFlight(`anteprima:${d.user.id}`, 2);
  if (!release) return text(429, ANSWER.rateLimited);
  try {
    const pic = await previewOf({ load: () => bytesOf(f.id, f.size), type, orientation: f.orientation }, page);
    return new Response(new Uint8Array(pic.bytes), {
      headers: {
        'Content-Type': pic.mime,
        'Content-Disposition': `inline; filename="anteprima-${f.sha256.slice(0, 8)}-${page}.${pic.mime === 'image/png' ? 'png' : 'jpg'}"`,
        'Content-Length': String(pic.bytes.length),
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'",
        'X-Pagine': String(f.pages),
      },
    });
  } catch (e) {
    if (e instanceof RendererBusy) return busyResponse();
    log.warn({ companyId: d.user.companyId, attachmentId: f.id, type, detail: e instanceof Error ? e.message.slice(0, 200) : 'preview failed' }, 'preview failed');
    return text(500, ANSWER.failed);
  } finally {
    release();
  }
}
