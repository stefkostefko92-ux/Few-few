import { ANSWER } from '@/lib/answers';
import { TYPE_OF, isAllegatoMime } from '@/lib/allegati/limits';
import { log } from '@/lib/log';
import { SCHIZZO_PAGINE } from '@/lib/report/image-tool';
import { RendererBusy, busyResponse } from '@/lib/report/render';
import { idSchema } from '@/lib/schemas';
import { downloader, text } from '@/server/download';
import { ANTEPRIMA_LIMITS, anteprimaDi } from '@/server/schizzi/anteprime';
import { fileDaMostrare } from '@/server/schizzi/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The preview of a survey sketch beside a form (round 50): whoever sees the installations ('projects:view'), of a file of
// kind SCHIZZO only — any other uploaded file, another company's id «not found» (the others are downloaded with
// 'report:download', a right the company may take from a role) —, 30 in 10 minutes per user. Never the uploaded bytes: a
// picture made again by us (src/lib/report/image-tool.ts) — a JPEG or PNG turned the way the phone held it and at most
// 1600 px on its longest side, in its own format; a PDF's page ?pagina=N (1..4, at most its pages) drawn as a PNG —, kept
// in memory once drawn, one drawn at a time in the server and one under way per company (src/server/schizzi/
// anteprime.ts: else 503 with Retry-After), inline, cached by the browser for 5 minutes (the bytes never change),
// sandboxed like every file the product serves. X-Pagine says the file's pages (of a PDF, only the first four are shown).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const d = await downloader('anteprima', ANTEPRIMA_LIMITS.perUser10Min, 'projects:view');
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
  try {
    const pic = await anteprimaDi(d.user, f, type, page);
    if (!pic) return text(429, ANSWER.rateLimited);
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
  }
}
